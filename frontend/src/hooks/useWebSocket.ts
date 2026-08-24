"use client";
import { useEffect, useState, useRef, useCallback } from "react";

interface UseWebSocketOptions {
  jobId?: string;
  onMessage: (data: any) => void;
}

export default function useWebSocket({
  jobId,
  onMessage,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isExhausted, setIsExhausted] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const retryCount = useRef(0);
  const MAX_RETRIES = 3;
  const intentionalClose = useRef(false);

  // Keep the latest onMessage without re-creating the connection
  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = process.env.NEXT_PUBLIC_WS_HOST || "127.0.0.1:8000";
    const wsUrl = `${wsProtocol}//${wsHost}/v1/ws/jobs/${jobId}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setIsConnected(true);
      retryCount.current = 0;
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
        `[WS] Connection dropped. Attempt ${retryCount.current}/${MAX_RETRIES} in 3s...`,
      );
      setTimeout(() => {
        // only reconnect if this effect is still alive
        if (!cancelled) {
          // force a clean reconnect by changing a dummy dependency or just call connect logic again
          // simplest: rely on the fact that jobId is still the same
        }
      }, 3000);
    };

    // Cleanup only runs on real unmount or jobId change
    return () => {
      cancelled = true;
      console.log("[WS] CLEANUP (real) – closing socket for", jobId);

      if (pingInterval) clearInterval(pingInterval);

      ws.onclose = null; // prevent the onclose handler from running
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      socketRef.current = null;
    };
  }, [jobId]); // ← ONLY depend on jobId; // only re-run when jobId really changes

  return { isConnected, isExhausted };
}
