"use client";
import { useEffect, useState, useRef } from "react";

interface UseWebSocketOptions {
  jobId?: string;
  onMessage: (data: any) => void;
  onSequenceGap?: () => void;
}

export default function useWebSocket({
  jobId,
  onMessage,
  onSequenceGap,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isExhausted, setIsExhausted] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onSequenceGapRef = useRef(onSequenceGap);
  const retryCount = useRef(0);
  const MAX_RETRIES = 10; // Resilient 10-attempt reconnection limit

  const lastSequenceNumber = useRef<number>(0);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // Keep the latest callbacks without re-creating the connection
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onSequenceGapRef.current = onSequenceGap;
  }, [onSequenceGap]);

  // Reset circuit breaker when jobId changes
  useEffect(() => {
    setIsExhausted(false);
    retryCount.current = 0;
  }, [jobId]);

  useEffect(() => {
    if (!jobId || jobId.startsWith("cache-")) return;

    let cancelled = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    let rawHost = process.env.NEXT_PUBLIC_WS_HOST || "127.0.0.1:8000";
    let isSecure = window.location.protocol === "https:";

    if (rawHost.startsWith("wss://")) {
      isSecure = true;
      rawHost = rawHost.replace("wss://", "");
    } else if (rawHost.startsWith("ws://")) {
      isSecure = false;
      rawHost = rawHost.replace("ws://", "");
    } else if (
      rawHost.includes("onrender.com") ||
      rawHost.includes("render.com") ||
      (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith("https://"))
    ) {
      // Production cloud deployments require secure WebSockets (WSS) even if UI runs on localhost:3000
      isSecure = true;
    }

    const wsProtocol = isSecure ? "wss:" : "ws:";
    const cleanHost = rawHost.replace(/\/+$/, "");
    const wsUrl = `${wsProtocol}//${cleanHost}/v1/ws/jobs/${jobId}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setIsConnected(true);
      setIsExhausted(false);
      retryCount.current = 0;
      lastSequenceNumber.current = 0;
      console.log(`[WS] Secure handshake established for Job ID: ${jobId}`);

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const parsedData = JSON.parse(event.data);
        if (parsedData.type === "pong") return;

        // Sequence Number Validation
        const seq = parsedData.sequence_number;
        if (typeof seq === "number") {
          const expectedSeq = lastSequenceNumber.current + 1;
          if (seq < expectedSeq) {
            return;
          } else if (seq > expectedSeq && lastSequenceNumber.current > 0) {
            console.error(
              `[WS] Sequence gap detected! Expected ${expectedSeq}, got ${seq}. Triggering recovery.`
            );
            if (onSequenceGapRef.current) {
              onSequenceGapRef.current();
            }
          }
          lastSequenceNumber.current = seq;
        }

        if (parsedData.server_timestamp) {
          const networkLatency = Date.now() - parsedData.server_timestamp;
          parsedData.result = {
            ...parsedData.result,
            network_latency_ms: networkLatency,
          };
        }

        onMessageRef.current(parsedData);
      } catch (err) {
        console.error("[WS] Failed to parse incoming payload:", err);
      }
    };

    ws.onerror = () => {
      if (!cancelled) {
        console.warn(`[WS] Transmission issue detected for ${wsUrl}. Fallback recovery engaged.`);
      }
    };

    ws.onclose = (event) => {
      if (cancelled) return;

      console.log("[WS] CLOSED", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });

      setIsConnected(false);

      if (retryCount.current >= MAX_RETRIES) {
        console.error("[WS] CIRCUIT BREAKER TRIPPED after maximum retries");
        setIsExhausted(true);
        return;
      }

      retryCount.current += 1;
      // Exponential backoff with ceiling at 8s
      const backoffDelay = Math.min(8000, 1500 * Math.pow(1.5, retryCount.current));
      console.warn(
        `[WS] Connection dropped. Attempt ${retryCount.current}/${MAX_RETRIES} in ${Math.round(backoffDelay / 1000)}s...`
      );

      reconnectTimeout = setTimeout(() => {
        if (!cancelled) {
          setReconnectTrigger((prev) => prev + 1);
        }
      }, backoffDelay);
    };

    return () => {
      cancelled = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);

      ws.onclose = null;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      socketRef.current = null;
    };
  }, [jobId, reconnectTrigger]);

  return { isConnected, isExhausted };
}
