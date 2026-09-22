"use client";

import React, { useState, useEffect } from "react";

interface CachePrimeIndicatorProps {
  primed?: boolean;
  ttlRemaining?: number | null;
  primedAt?: string | null;
  compact?: boolean;
}

export default function CachePrimeIndicator({
  primed = false,
  ttlRemaining = null,
  primedAt = null,
  compact = false,
}: CachePrimeIndicatorProps) {
  const initialTtl = ttlRemaining != null && ttlRemaining > 0 ? ttlRemaining : 0;
  const [secondsLeft, setSecondsLeft] = useState<number>(initialTtl);

  useEffect(() => {
    setSecondsLeft(ttlRemaining != null && ttlRemaining > 0 ? ttlRemaining : 0);
  }, [ttlRemaining]);

  useEffect(() => {
    if (!primed || secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [primed, secondsLeft]);

  const maxTtl = 300;
  const progressPercent = Math.min(100, Math.max(0, (secondsLeft / maxTtl) * 100));

  const formatCountdown = (sec: number) => {
    if (sec <= 0) return "Expired";
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    if (mins > 0) return `${mins}m ${remainder.toString().padStart(2, "0")}s`;
    return `${remainder}s`;
  };

  const formattedPrimedAt = primedAt
    ? new Date(primedAt).toLocaleTimeString()
    : null;

  if (!primed || secondsLeft <= 0) {
    return (
      <div
        className={`inline-flex items-center gap-1 font-mono rounded px-1.5 py-0.5 border text-[10px] ${
          compact
            ? "bg-gray-900/60 border-gray-800 text-gray-500"
            : "bg-gray-900/80 border-gray-800 text-gray-500 px-2 py-1"
        }`}
        title="Key not primed in in-memory cache"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gray-600 inline-block" />
        <span className="uppercase tracking-wider">Cold</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1.5 font-mono text-[10px] bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 rounded px-2 py-0.5 shadow-[0_0_8px_rgba(16,185,129,0.15)] group relative"
        title={formattedPrimedAt ? `Primed at ${formattedPrimedAt} via Write-Through` : "Write-Through Cache Primed"}
      >
        <span className="text-emerald-400 font-bold animate-pulse">⚡</span>
        <span className="font-semibold tracking-wider uppercase">PRIMED</span>
        <span className="text-emerald-400/90 font-mono text-[9px] tabular-nums">
          {formatCountdown(secondsLeft)}
        </span>
        <div className="w-8 h-1 bg-emerald-950 rounded-full overflow-hidden ml-0.5 border border-emerald-500/20">
          <div
            className="h-full bg-emerald-400 transition-all duration-1000 ease-linear rounded-full shadow-[0_0_4px_rgba(52,211,153,0.8)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5 shadow-[0_0_12px_rgba(16,185,129,0.12)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-emerald-400 font-bold tracking-wider uppercase text-[11px] flex items-center gap-1">
            ⚡ Write-Through Primed
          </span>
        </div>
        <span className="text-emerald-300/90 font-mono text-[10px] tabular-nums bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          TTL: {formatCountdown(secondsLeft)}
        </span>
      </div>

      <div className="w-full h-1.5 bg-emerald-950/80 rounded-full overflow-hidden border border-emerald-500/20">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 ease-linear rounded-full shadow-[0_0_6px_rgba(52,211,153,0.9)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {formattedPrimedAt && (
        <div className="text-[9px] text-emerald-500/70 tracking-tight flex items-center justify-between pt-0.5">
          <span>Primed at: {formattedPrimedAt}</span>
          <span className="text-emerald-400/80 uppercase">Source: Write-Through</span>
        </div>
      )}
    </div>
  );
}
