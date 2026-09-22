"use client";

import React from "react";

interface StampedeGuardBadgeProps {
  mutexContention?: boolean;
  lockWaitMs?: number;
  compact?: boolean;
}

export default function StampedeGuardBadge({
  mutexContention = false,
  lockWaitMs = 0,
  compact = false,
}: StampedeGuardBadgeProps) {
  if (!mutexContention && (!lockWaitMs || lockWaitMs <= 0)) {
    return null;
  }

  const formattedWait = typeof lockWaitMs === "number" ? lockWaitMs.toFixed(1) : lockWaitMs;

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1 font-mono text-[10px] bg-amber-950/40 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.2)] cursor-help"
        title="Concurrent query stampede absorbed by Redis distributed mutex. Database query prevented."
      >
        <span className="text-amber-400 animate-pulse">🔒</span>
        <span className="font-semibold uppercase tracking-wider text-[9px]">LOCK WAIT</span>
        <span className="font-bold tabular-nums text-[10px] text-amber-200">
          {formattedWait}ms
        </span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 font-mono text-xs bg-gradient-to-r from-amber-950/50 to-purple-950/40 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-md shadow-[0_0_12px_rgba(245,158,11,0.18)] cursor-help"
      title="Thundering herd avoided: A concurrent request acquired the distributed mutex and primed Redis, while this request was served safely from cache."
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
      </span>
      <span className="flex items-center gap-1 font-bold uppercase tracking-wider text-[11px] text-amber-300">
        <span>🔒</span>
        <span>Stampede Mitigated</span>
      </span>
      <span className="text-[10px] bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded text-amber-200 font-bold tabular-nums">
        WAIT: {formattedWait}ms
      </span>
    </div>
  );
}
