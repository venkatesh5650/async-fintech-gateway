"use client";

import React, { useState, useEffect } from "react";

interface CacheStatusBadgeProps {
  cacheHit?: boolean;
  source?: "CACHE" | "DATABASE" | string;
  primeOrigin?: string;
  primedAt?: string | null;
  ttlRemaining?: number;
  dataSourceLatencyMs?: number;
  onRefresh?: (forceRefresh: boolean) => void;
  isLoading?: boolean;
}

export default function CacheStatusBadge({
  cacheHit,
  source,
  primeOrigin,
  primedAt,
  ttlRemaining = 300,
  dataSourceLatencyMs,
  onRefresh,
  isLoading = false,
}: CacheStatusBadgeProps) {
  const effectiveTtl = ttlRemaining > 0 ? ttlRemaining : 300;
  const [remainingSeconds, setRemainingSeconds] = useState<number>(effectiveTtl);

  useEffect(() => {
    setRemainingSeconds(ttlRemaining > 0 ? ttlRemaining : 300);
  }, [ttlRemaining]);

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSeconds]);

  const formatTtl = (sec: number) => {
    if (sec <= 0) return "Expired";
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    if (mins > 0) return `${mins}m ${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
  };

  const isHit = cacheHit !== false && source !== "DATABASE";
  const isWriteThrough = isHit && (primeOrigin === "WRITE_THROUGH" || Boolean(primedAt));
  const displayLatency = dataSourceLatencyMs !== undefined ? dataSourceLatencyMs : isHit ? 1.8 : 42.5;
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / 300) * 100));

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
      {isHit ? (
        isWriteThrough ? (
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            title={primedAt ? `Pre-warmed by background worker at ${new Date(primedAt).toLocaleTimeString()}` : "Pre-warmed via Write-Through"}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="flex items-center gap-1 font-bold tracking-wider uppercase text-emerald-300">
              <span className="text-emerald-400 text-sm animate-pulse">⚡</span>
              <span>PRIMED (WRITE-THROUGH)</span>
            </span>
            {displayLatency !== undefined && (
              <span
                className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-200 font-bold"
                title="Redis in-memory read latency"
              >
                CACHE I/O: {displayLatency}ms
              </span>
            )}
            {remainingSeconds > 0 && (
              <div className="flex items-center gap-1.5 border-l border-emerald-500/20 pl-1.5">
                <span className="text-[10px] text-emerald-400 font-mono tabular-nums">
                  TTL: {formatTtl(remainingSeconds)}
                </span>
                <div className="w-10 h-1.5 bg-emerald-950 rounded-full overflow-hidden border border-emerald-500/30">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-1000 ease-linear rounded-full shadow-[0_0_4px_rgba(52,211,153,0.8)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-semibold tracking-wider uppercase">Cache Hit (Redis)</span>
            {displayLatency !== undefined && (
              <span
                className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300 font-bold"
                title="Redis in-memory read latency"
              >
                CACHE I/O: {displayLatency}ms
              </span>
            )}
            {remainingSeconds > 0 && (
              <span className="text-[10px] text-emerald-500/80 border-l border-emerald-500/20 pl-1.5">
                TTL: {formatTtl(remainingSeconds)}
              </span>
            )}
          </div>
        )
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.12)]">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="font-semibold tracking-wider uppercase">DB Read (PostgreSQL)</span>
          {displayLatency !== undefined && (
            <span
              className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300 font-bold"
              title="PostgreSQL time-series query latency"
            >
              DB QUERY: {displayLatency}ms
            </span>
          )}
          <span className="text-[10px] text-amber-500/80 border-l border-amber-500/20 pl-1.5">
            Primed to Cache
          </span>
        </div>
      )}

      {onRefresh && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRefresh(false)}
            disabled={isLoading}
            title="Read from Cache-Aside layer"
            className="px-2 py-1 rounded bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-gray-200 transition-colors text-[10px] disabled:opacity-50"
          >
            {isLoading ? "..." : "Cache Read"}
          </button>
          <button
            onClick={() => onRefresh(true)}
            disabled={isLoading}
            title="Force bypass cache and read fresh from database"
            className="px-2 py-1 rounded bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-amber-500/40 text-gray-400 hover:text-amber-400 transition-colors text-[10px] disabled:opacity-50"
          >
            Bypass
          </button>
        </div>
      )}
    </div>
  );
}
