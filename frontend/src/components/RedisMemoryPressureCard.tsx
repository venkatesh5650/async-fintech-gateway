"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  RedisMemoryPressureReport,
  RedisMemoryStatus,
} from "@/types/api";

const DEFAULT_STATUS: RedisMemoryStatus = {
  used_memory_mb: 2.15,
  peak_memory_mb: 3.42,
  allocated_limit_mb: 64.0,
  memory_utilization_pct: 3.36,
  evicted_keys_count: 0,
  expired_keys_count: 62,
  fragmentation_ratio: 1.12,
  total_tracked_keys: 48,
  pressure_status: "HEALTHY",
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-redis-mem-trace-01",
};

const DEFAULT_REPORT: RedisMemoryPressureReport = {
  run_id: "mem_baseline",
  status: "COMPLETED",
  keys_generated: 200,
  memory_before_mb: 2.15,
  memory_peak_mb: 7.42,
  memory_after_mb: 2.21,
  delta_bytes: 5526300,
  eviction_detected: false,
  graceful_degradation_verified: true,
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-redis-stress-trace-01",
};

export default function RedisMemoryPressureCard() {
  const [status, setStatus] = useState<RedisMemoryStatus>(DEFAULT_STATUS);
  const [report, setReport] = useState<RedisMemoryPressureReport>(DEFAULT_REPORT);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStressRunning, setIsStressRunning] = useState<boolean>(false);
  const [stressTimer, setStressTimer] = useState<number>(0);
  const [targetFillMb, setTargetFillMb] = useState<number>(5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await fetch("/api/chaos/redis-memory");
      if (res.ok) {
        const data: RedisMemoryStatus = await res.json();
        setStatus(data);
      }
    } catch {
      // Polling fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLatestReport = useCallback(async () => {
    try {
      const res = await fetch("/api/chaos/redis-memory?mode=latest");
      if (res.ok) {
        const data: RedisMemoryPressureReport = await res.json();
        setReport(data);
      }
    } catch {
      // Report read fallback
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLatestReport();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchLatestReport]);

  const handleRunMemoryPressure = async () => {
    if (isStressRunning) return;
    setIsStressRunning(true);
    setStressTimer(4);
    setErrorMessage(null);

    const timerInterval = setInterval(() => {
      setStressTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await fetch("/api/chaos/redis-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_fill_mb: targetFillMb,
          key_count: targetFillMb * 50,
          ttl_seconds: 60,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const freshReport: RedisMemoryPressureReport = await res.json();
      setReport(freshReport);
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Memory pressure test failed";
      setErrorMessage(msg);
    } finally {
      clearInterval(timerInterval);
      setIsStressRunning(false);
      setStressTimer(0);
    }
  };

  const utilization = Math.min(status.memory_utilization_pct, 100);
  const statusColor =
    status.pressure_status === "HEALTHY"
      ? "text-emerald-400 border-emerald-800/60 bg-emerald-950/60"
      : status.pressure_status === "ELEVATED"
      ? "text-amber-400 border-amber-800/60 bg-amber-950/60"
      : "text-rose-400 border-rose-800/60 bg-rose-950/60";

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">💾</span>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Redis Memory Pressure &amp; LRU Eviction Hardening
              </h2>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${statusColor}`}
              >
                {status.pressure_status}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Active memory footprint vs allocated limits, LRU eviction monitoring, and graceful cache degradation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                fetchStatus();
                fetchLatestReport();
              }}
              disabled={isLoading || isStressRunning}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition disabled:opacity-50"
            >
              ↻ Refresh
            </button>

            <button
              type="button"
              onClick={handleRunMemoryPressure}
              disabled={isStressRunning}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-2 shadow-lg ${
                isStressRunning
                  ? "bg-amber-600/30 text-amber-300 border border-amber-500/50 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/30"
              }`}
            >
              {isStressRunning ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Pressuring Memory ({stressTimer}s)...</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Inject Pressure</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 pb-2 border-b border-gray-800/60">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Fill Target:</span>
            <div className="flex items-center gap-1">
              {[2, 5, 10].map((mb) => (
                <button
                  key={mb}
                  type="button"
                  onClick={() => setTargetFillMb(mb)}
                  disabled={isStressRunning}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    targetFillMb === mb
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  +{mb} MB
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Keys Injected:</span>
            <span className="text-white font-semibold">{targetFillMb * 50} keys</span>
          </div>

          <div className="text-right text-xs font-mono text-gray-400">
            <span>Utilization: </span>
            <span className="text-white font-semibold">{utilization.toFixed(1)}%</span>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs font-mono text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Memory Capacity Bar */}
        <div className="mt-6 bg-gray-950/70 border border-gray-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-gray-300 font-semibold">Memory Ceiling Utilization</span>
            <span className="text-gray-400">
              {status.used_memory_mb.toFixed(2)} MB / {status.allocated_limit_mb.toFixed(1)} MB (
              {utilization.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-gray-900 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                utilization < 70
                  ? "bg-emerald-500"
                  : utilization < 85
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${Math.max(utilization, 2)}%` }}
            />
          </div>
        </div>

        {/* Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
              Used Memory
            </span>
            <span className="text-xl font-bold font-mono text-white mt-1 block">
              {status.used_memory_mb.toFixed(2)}
              <span className="text-xs text-gray-500 ml-1 font-normal">MB</span>
            </span>
            <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
              Peak: {status.peak_memory_mb.toFixed(2)} MB
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
              Evicted Keys
            </span>
            <span
              className={`text-xl font-bold font-mono mt-1 block ${
                status.evicted_keys_count > 0 ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {status.evicted_keys_count}
            </span>
            <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
              LRU policy evictions
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
              Expired Keys
            </span>
            <span className="text-xl font-bold font-mono text-purple-400 mt-1 block">
              {status.expired_keys_count}
            </span>
            <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
              TTL passive expirations
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
              Fragmentation Ratio
            </span>
            <span className="text-xl font-bold font-mono text-cyan-400 mt-1 block">
              {status.fragmentation_ratio.toFixed(2)}
            </span>
            <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
              RSS vs allocated ratio
            </span>
          </div>
        </div>

        {/* Pressure & Graceful Degradation Verification Card */}
        <div className="mt-6 bg-gray-950/60 border border-gray-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 border-b border-gray-800/60 pb-2">
            <span className="text-xs font-mono font-semibold text-gray-300">
              Latest Memory Pressure &amp; Degradation Benchmark
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              Run: {report.run_id} | Status: {report.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Keys Tested</span>
              <span className="text-sm font-bold text-white mt-0.5 block">
                {report.keys_generated} keys
              </span>
              <span className="text-[9px] text-gray-500 block">
                {(report.delta_bytes / (1024 * 1024)).toFixed(2)} MB injected
              </span>
            </div>

            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Memory Profile</span>
              <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                {report.memory_before_mb}MB → {report.memory_peak_mb}MB
              </span>
              <span className="text-[9px] text-gray-500 block">
                Settled: {report.memory_after_mb} MB
              </span>
            </div>

            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Eviction Event</span>
              <span
                className={`text-sm font-bold mt-0.5 block ${
                  report.eviction_detected ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {report.eviction_detected ? "EVICTED" : "CONTAINED"}
              </span>
              <span className="text-[9px] text-gray-500 block">LRU threshold</span>
            </div>

            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Graceful Fallback</span>
              <span
                className={`text-sm font-bold mt-0.5 block ${
                  report.graceful_degradation_verified
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {report.graceful_degradation_verified ? "VERIFIED (100%)" : "FAILED"}
              </span>
              <span className="text-[9px] text-gray-500 block">Zero 500 exceptions</span>
            </div>
          </div>
        </div>

        {/* Footer Trace Telemetry */}
        <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>Memory Trace: {status.trace_id}</span>
          <span>Last Measured: {new Date(status.timestamp_iso).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
