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
  const MAX_RETRIES = 3;

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
    if (!jobId) return;

    let cancelled = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = process.env.NEXT_PUBLIC_WS_HOST || "127.0.0.1:8000";
    const wsUrl = `${wsProtocol}//${wsHost}/v1/ws/jobs/${jobId}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setIsConnected(true);
      retryCount.current = 0;
      lastSequenceNumber.current = 0; // Reset sequence tracking for fresh session
      console.log(`[WS] Secure handshake established for Job ID: ${jobId}`);

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        }
      }, 30000);
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
            console.warn(
              `[WS] Stale/out-of-order packet discarded. Expected >= ${expectedSeq}, got ${seq}.`
            );
            return;
          } else if (seq > expectedSeq) {
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
          console.log(`[WS] Payload delivered in ${networkLatency}ms`);
        }

        onMessageRef.current(parsedData);
      } catch (err) {
        console.error("[WS] Failed to parse incoming payload:", err);
      }
    };

    ws.onerror = () => {
      if (!cancelled) console.error("[WS] Transmission error detected.");
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
        console.error("[WS] CIRCUIT BREAKER TRIPPED");
        setIsExhausted(true);
        return;
      }

      retryCount.current += 1;
      console.warn(
        `[WS] Connection dropped. Attempt ${retryCount.current}/${MAX_RETRIES} in 3s...`
      );
      
      reconnectTimeout = setTimeout(() => {
        if (!cancelled) {
          setReconnectTrigger((prev) => prev + 1);
        }
      }, 3000);
    };

    // Cleanup only runs on real unmount, jobId change, or reconnectTrigger
    return () => {
      cancelled = true;
      console.log("[WS] CLEANUP – closing socket for", jobId);

      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);

      ws.onclose = null; // prevent the onclose handler from running
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      socketRef.current = null;
    };
  }, [jobId, reconnectTrigger]); // Re-run effect to reconnect when trigger increments

  return { isConnected, isExhausted };
}
