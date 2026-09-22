"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CacheHealthResponse } from "@/types/api";

const POLL_INTERVAL_MS = 5000;
const REFRESH_TICK_MS = 1000;

const EMPTY_STATE: CacheHealthResponse = {
  hit_count: 0,
  miss_count: 0,
  total_requests: 0,
  hit_ratio_pct: 0.0,
  contention_count: 0,
  total_cached_keys: 0,
  memory_used_mb: 0.0,
  memory_peak_mb: 0.0,
  server_timestamp_ms: 0,
};

function DonutGauge({ hitRatioPct }: { hitRatioPct: number }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (hitRatioPct / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="#1f2937"
          strokeWidth="10"
          fill="transparent"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="#10b981"
          strokeWidth="10"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-xl font-bold font-mono text-white tabular-nums tracking-tight">
          {hitRatioPct.toFixed(1)}%
        </span>
        <span className="text-[8px] text-gray-500 uppercase tracking-widest font-mono">
          Hit Ratio
        </span>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  color,
  sublabel,
}: {
  label: string;
  value: number | string;
  color: string;
  sublabel?: string;
}) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 flex flex-col justify-between">
      <span className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5 my-1">
        <span className={`text-xl font-bold font-mono tabular-nums ${color}`}>
          {value}
        </span>
        {sublabel && (
          <span className="text-[9px] text-gray-600 font-mono">{sublabel}</span>
        )}
      </div>
    </div>
  );
}

export default function CacheHealthMonitor() {
  const [data, setData] = useState<CacheHealthResponse>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/cache-health", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const payload: CacheHealthResponse = await res.json();
      setData(payload);
      setIsError(false);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setCountdown(POLL_INTERVAL_MS / 1000);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : POLL_INTERVAL_MS / 1000));
    }, REFRESH_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const lastUpdate =
    mounted && data.server_timestamp_ms > 0
      ? new Date(data.server_timestamp_ms).toLocaleTimeString()
      : "—";

  const maxMemoryRefMb = Math.max(data.memory_peak_mb * 1.5, 10.0);
  const memoryPercent = Math.min(
    100,
    Math.max(0, (data.memory_used_mb / maxMemoryRefMb) * 100)
  );

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          </span>
          <span className="text-xs text-white font-bold tracking-widest uppercase">
            Distributed Cache Health & Memory Monitor
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Synced: {lastUpdate}</span>
          <button
            onClick={fetchHealth}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 transition-colors text-[10px] disabled:opacity-50"
            title="Poll fresh cache health metrics"
          >
            <span className={isLoading ? "animate-spin inline-block" : ""}>
              ↻
            </span>
            <span>Refresh ({countdown}s)</span>
          </button>
        </div>
      </div>

      {isError && (
        <div className="text-xs text-red-400/90 border border-red-500/20 rounded bg-red-500/5 px-3 py-2 mb-4 font-mono">
          ⚠ Cache health gateway unreachable. Confirm Redis backend container is running.
        </div>
      )}

      {/* Main Grid: Donut + Memory Gauge + Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
        {/* Donut Chart */}
        <div className="flex flex-col items-center justify-center p-4 bg-gray-900/30 border border-gray-800/80 rounded-xl">
          <DonutGauge hitRatioPct={data.hit_ratio_pct} />
          <div className="mt-3 text-center">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest block">
              In-Memory Efficiency
            </span>
            <span className="text-[9px] text-emerald-400/90 font-mono">
              {data.hit_count} hits of {data.total_requests} total inquiries
            </span>
          </div>
        </div>

        {/* Memory Gauge */}
        <div className="flex flex-col justify-center p-4 bg-gray-900/30 border border-gray-800/80 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">
              Redis RAM Allocation
            </span>
            <span className="text-xs font-bold text-cyan-400 font-mono tabular-nums">
              {data.memory_used_mb.toFixed(2)} MB
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-1000 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.6)]"
              style={{ width: `${memoryPercent}%` }}
            />
          </div>

          <div className="flex justify-between text-[9px] text-gray-500 font-mono pt-1">
            <span>Peak: {data.memory_peak_mb.toFixed(2)} MB</span>
            <span>Allocated: {data.memory_used_mb.toFixed(2)} MB</span>
          </div>

          <div className="pt-1 border-t border-gray-800/60 flex items-center justify-between text-[9px] text-gray-500">
            <span>Active Keys:</span>
            <span className="font-bold text-gray-300 font-mono">{data.total_cached_keys}</span>
          </div>
        </div>

        {/* 4 Stat Tiles */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Total Queries"
            value={data.total_requests}
            color="text-white"
          />
          <StatTile
            label="Cache Hits"
            value={data.hit_count}
            color="text-emerald-400"
          />
          <StatTile
            label="Cache Misses"
            value={data.miss_count}
            color="text-amber-400"
          />
          <StatTile
            label="Stampedes Mitigated"
            value={data.contention_count}
            color="text-purple-400"
            sublabel="mutex"
          />
        </div>
      </div>
    </div>
  );
}
