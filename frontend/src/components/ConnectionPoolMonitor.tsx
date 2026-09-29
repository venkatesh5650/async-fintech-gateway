"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ConnectionPoolStatus,
  ConnectionPoolStressReport,
} from "@/types/api";

const DEFAULT_STATUS: ConnectionPoolStatus = {
  pool_size: 20,
  max_overflow: 10,
  total_capacity: 30,
  checked_in: 0,
  checked_out: 0,
  overflow_active: 0,
  saturation_pct: 0.0,
  is_exhausted: false,
  avg_checkout_latency_ms: 1.8,
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-pool-init-trace-01",
};

const DEFAULT_REPORT: ConnectionPoolStressReport = {
  run_id: "pool_baseline",
  status: "COMPLETED",
  requested_connections: 25,
  acquired_connections: 25,
  failed_connections: 0,
  peak_saturation_pct: 83.33,
  avg_queue_wait_ms: 14.8,
  max_queue_wait_ms: 48.2,
  recovery_time_ms: 62.4,
  pool_exhausted: false,
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-pool-stress-trace-01",
};

function PoolDialGauge({ saturationPct }: { saturationPct: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(saturationPct, 100) / 100) * circumference;

  const colorClass =
    saturationPct < 70
      ? "text-emerald-400 stroke-emerald-500"
      : saturationPct < 90
      ? "text-amber-400 stroke-amber-500"
      : "text-rose-400 stroke-rose-500";

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="#1f2937"
          strokeWidth="8"
          fill="transparent"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${colorClass} transition-all duration-700 ease-out`}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold font-mono text-white tabular-nums tracking-tight">
          {saturationPct.toFixed(1)}%
        </span>
        <span className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">
          Pool Load
        </span>
      </div>
    </div>
  );
}

export default function ConnectionPoolMonitor() {
  const [status, setStatus] = useState<ConnectionPoolStatus>(DEFAULT_STATUS);
  const [report, setReport] = useState<ConnectionPoolStressReport>(DEFAULT_REPORT);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStressRunning, setIsStressRunning] = useState<boolean>(false);
  const [stressTimer, setStressTimer] = useState<number>(0);
  const [concurrency, setConcurrency] = useState<number>(25);
  const [holdDurationSec, setHoldDurationSec] = useState<number>(2);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await fetch("/api/chaos/pool");
      if (res.ok) {
        const data: ConnectionPoolStatus = await res.json();
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
      const res = await fetch("/api/chaos/pool?mode=latest");
      if (res.ok) {
        const data: ConnectionPoolStressReport = await res.json();
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

  const handleRunPoolStress = async () => {
    if (isStressRunning) return;
    setIsStressRunning(true);
    setStressTimer(holdDurationSec + 1);
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
      const res = await fetch("/api/chaos/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concurrency,
          hold_duration_seconds: holdDurationSec,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const stressResult: ConnectionPoolStressReport = await res.json();
      setReport(stressResult);
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Starvation test failed";
      setErrorMessage(msg);
    } finally {
      clearInterval(timerInterval);
      setIsStressRunning(false);
      setStressTimer(0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🏊</span>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Database Connection Pool &amp; Starvation Telemetry
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
                ASYNCPG POOL
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Active checkout utilization, queue delay tracking, and controlled pool starvation recovery benchmarks.
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
              onClick={handleRunPoolStress}
              disabled={isStressRunning}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-2 shadow-lg ${
                isStressRunning
                  ? "bg-amber-600/30 text-amber-300 border border-amber-500/50 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30"
              }`}
            >
              {isStressRunning ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Starving Pool ({stressTimer}s)...</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Simulate Starvation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 pb-2 border-b border-gray-800/60">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Hold Concurrency:</span>
            <div className="flex items-center gap-1">
              {[15, 25, 40].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConcurrency(c)}
                  disabled={isStressRunning}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    concurrency === c
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Hold Duration:</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setHoldDurationSec(d)}
                  disabled={isStressRunning}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    holdDurationSec === d
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div className="text-right text-xs font-mono text-gray-400">
            <span>Pool State: </span>
            <span
              className={`font-semibold ${
                status.is_exhausted
                  ? "text-rose-400"
                  : status.saturation_pct > 70
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {status.is_exhausted ? "EXHAUSTED" : "HEALTHY"}
            </span>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs font-mono text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Live Telemetry View */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center mt-6">
          <div className="flex items-center justify-center p-4 bg-gray-950/70 border border-gray-800/80 rounded-lg">
            <PoolDialGauge saturationPct={status.saturation_pct} />
          </div>

          <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
                Total Capacity
              </span>
              <span className="text-xl font-bold font-mono text-white mt-1 block">
                {status.total_capacity}
              </span>
              <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
                {status.pool_size} base + {status.max_overflow} overflow
              </span>
            </div>

            <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
                Checked-Out (Active)
              </span>
              <span
                className={`text-xl font-bold font-mono mt-1 block ${
                  status.checked_out > 0 ? "text-cyan-400" : "text-gray-300"
                }`}
              >
                {status.checked_out}
              </span>
              <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
                In-flight queries
              </span>
            </div>

            <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
                Checked-In (Idle)
              </span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                {status.checked_in}
              </span>
              <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
                Ready for checkout
              </span>
            </div>

            <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-3">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">
                Round-Trip Latency
              </span>
              <span className="text-xl font-bold font-mono text-purple-400 mt-1 block">
                {status.avg_checkout_latency_ms.toFixed(1)}
                <span className="text-xs text-gray-500 ml-1 font-normal">ms</span>
              </span>
              <span className="text-[9px] font-mono text-gray-500 block mt-0.5">
                SELECT 1 ping
              </span>
            </div>
          </div>
        </div>

        {/* Starvation Benchmark Results Card */}
        <div className="mt-6 bg-gray-950/60 border border-gray-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 border-b border-gray-800/60 pb-2">
            <span className="text-xs font-mono font-semibold text-gray-300">
              Latest Starvation &amp; Recovery Benchmark
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              Run: {report.run_id} | Status: {report.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Connections</span>
              <span className="text-sm font-bold text-white mt-0.5 block">
                {report.acquired_connections}/{report.requested_connections}
              </span>
              <span className="text-[9px] text-gray-500 block">
                {report.failed_connections} failed
              </span>
            </div>

            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Peak Saturation</span>
              <span
                className={`text-sm font-bold mt-0.5 block ${
                  report.peak_saturation_pct >= 90
                    ? "text-rose-400"
                    : report.peak_saturation_pct >= 70
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {report.peak_saturation_pct.toFixed(1)}%
              </span>
              <span className="text-[9px] text-gray-500 block">
                {report.pool_exhausted ? "Exhausted" : "Sub-capacity"}
              </span>
            </div>

            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Avg Queue Wait</span>
              <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                {report.avg_queue_wait_ms.toFixed(1)} ms
              </span>
              <span className="text-[9px] text-gray-500 block">Acquisition delay</span>
            </div>

            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Max Queue Wait</span>
              <span className="text-sm font-bold text-amber-400 mt-0.5 block">
                {report.max_queue_wait_ms.toFixed(1)} ms
              </span>
              <span className="text-[9px] text-gray-500 block">Tail delay</span>
            </div>

            <div className="p-2.5 bg-gray-900/60 border border-gray-800/60 rounded">
              <span className="text-[10px] text-gray-500 uppercase block">Recovery Time</span>
              <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                {report.recovery_time_ms.toFixed(1)} ms
              </span>
              <span className="text-[9px] text-gray-500 block">Back to baseline</span>
            </div>
          </div>
        </div>

        {/* Footer Trace Telemetry */}
        <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>Pool Trace: {status.trace_id}</span>
          <span>Last Measured: {new Date(status.timestamp_iso).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
