"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  EventLoopLagSimulationReport,
  EventLoopStatus,
} from "@/types/api";

const DEFAULT_STATUS: EventLoopStatus = {
  current_lag_ms: 0.28,
  avg_lag_ms: 0.35,
  p95_lag_ms: 0.72,
  max_lag_ms: 1.15,
  blocking_events_count: 0,
  is_starved: false,
  sample_count: 40,
  recent_samples_ms: [
    0.22, 0.25, 0.31, 0.28, 0.24, 0.35, 0.29, 0.33, 0.41, 0.27,
    0.3, 0.26, 0.25, 0.28, 0.32, 0.38, 0.45, 0.29, 0.27, 0.31,
    0.28, 0.33, 0.26, 0.29, 0.34, 0.25, 0.31, 0.28, 0.29, 0.35,
    0.26, 0.28, 0.3, 0.33, 0.27, 0.29, 0.31, 0.34, 0.28, 0.32,
  ],
  status: "HEALTHY",
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-loop-trace-01",
};

const DEFAULT_REPORT: EventLoopLagSimulationReport = {
  run_id: "loop_baseline",
  status: "COMPLETED",
  target_block_ms: 50.0,
  measured_lag_ms: 51.42,
  recovery_time_ms: 5.2,
  detected_by_monitor: true,
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-loop-trace-report",
};

export default function EventLoopLatencyChart() {
  const [status, setStatus] = useState<EventLoopStatus>(DEFAULT_STATUS);
  const [report, setReport] = useState<EventLoopLagSimulationReport>(DEFAULT_REPORT);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStressRunning, setIsStressRunning] = useState<boolean>(false);
  const [stressTimer, setStressTimer] = useState<number>(0);
  const [blockDurationMs, setBlockDurationMs] = useState<number>(50);
  const [simulationType, setSimulationType] = useState<string>("cpu_burn");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await fetch("/api/chaos/event-loop");
      if (res.ok) {
        const data: EventLoopStatus = await res.json();
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
      const res = await fetch("/api/chaos/event-loop?mode=latest");
      if (res.ok) {
        const data: EventLoopLagSimulationReport = await res.json();
        setReport(data);
      }
    } catch {
      // Report read fallback
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLatestReport();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchLatestReport]);

  const handleSimulateBlock = async () => {
    if (isStressRunning) return;
    setIsStressRunning(true);
    setStressTimer(2);
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
      const res = await fetch("/api/chaos/event-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block_duration_ms: blockDurationMs,
          simulation_type: simulationType,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const newReport: EventLoopLagSimulationReport = await res.json();
      setReport(newReport);
      await fetchStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Stress test failed";
      setErrorMessage(msg);
    } finally {
      setIsStressRunning(false);
      clearInterval(timerInterval);
      setStressTimer(0);
    }
  };

  // SVG dimensions for rolling sparkline
  const samples = status.recent_samples_ms.length > 0
    ? status.recent_samples_ms
    : DEFAULT_STATUS.recent_samples_ms;

  const maxVal = Math.max(...samples, 20.0);
  const chartHeight = 120;
  const chartWidth = 600;
  const points = samples.map((val, idx) => {
    const x = (idx / (samples.length - 1 || 1)) * chartWidth;
    const y = chartHeight - (Math.min(val, maxVal) / maxVal) * (chartHeight - 16) - 8;
    return `${x},${y}`;
  }).join(" ");

  const warningY = chartHeight - (15.0 / maxVal) * (chartHeight - 16) - 8;
  const elevatedY = chartHeight - (5.0 / maxVal) * (chartHeight - 16) - 8;

  const isStarved = status.status === "STARVED" || status.is_starved;
  const isElevated = status.status === "ELEVATED";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-gray-100 shadow-2xl relative overflow-hidden">
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏱️</span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              ASGI Event-Loop Latency Benchmark
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                isStarved
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse"
                  : isElevated
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              }`}
            >
              {status.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Real-time asyncio scheduling drift, blocking task detection, and single-thread starvation guard
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchStatus();
              fetchLatestReport();
            }}
            disabled={isLoading || isStressRunning}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs font-mono flex items-center justify-between">
          <span>Error: {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Top Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">Current Drift</div>
          <div className={`text-xl font-bold font-mono mt-1 ${
            status.current_lag_ms >= 15 ? "text-rose-400" : status.current_lag_ms >= 5 ? "text-amber-400" : "text-emerald-400"
          }`}>
            {status.current_lag_ms.toFixed(2)} ms
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Instant scheduling latency</div>
        </div>

        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">Rolling Avg</div>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
            {status.avg_lag_ms.toFixed(2)} ms
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Mean latency ({status.sample_count} samples)</div>
        </div>

        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">P95 Lag</div>
          <div className={`text-xl font-bold font-mono mt-1 ${
            status.p95_lag_ms >= 15 ? "text-rose-400" : status.p95_lag_ms >= 5 ? "text-amber-400" : "text-emerald-300"
          }`}>
            {status.p95_lag_ms.toFixed(2)} ms
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">95th percentile worst-case</div>
        </div>

        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">Peak Lag</div>
          <div className="text-xl font-bold font-mono text-purple-400 mt-1">
            {status.max_lag_ms.toFixed(2)} ms
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Highest recorded spike</div>
        </div>

        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">Blocking Events</div>
          <div className={`text-xl font-bold font-mono mt-1 ${
            status.blocking_events_count > 0 ? "text-rose-400" : "text-gray-300"
          }`}>
            {status.blocking_events_count}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">&gt;15ms thread stalls</div>
        </div>
      </div>

      {/* Live SVG Latency Sparkline Chart */}
      <div className="bg-gray-950/70 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 font-medium uppercase tracking-wider">
              Rolling Event-Loop Latency Timeline
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-400">
              {samples.length} Datapoints
            </span>
          </div>

          <div className="flex items-center gap-4 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" />
              <span className="text-gray-400">Drift Trace</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-amber-500/70 border-b border-dashed inline-block" />
              <span className="text-amber-400">Elevated (5ms)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-rose-500/70 border-b border-dashed inline-block" />
              <span className="text-rose-400">Starved (15ms)</span>
            </div>
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-32 stroke-linejoin-round"
            preserveAspectRatio="none"
          >
            {/* Background Grid Lines */}
            <line
              x1="0"
              y1={chartHeight - 8}
              x2={chartWidth}
              y2={chartHeight - 8}
              stroke="#1f2937"
              strokeWidth="1"
            />
            {/* Elevated 5ms threshold */}
            <line
              x1="0"
              y1={elevatedY}
              x2={chartWidth}
              y2={elevatedY}
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.4"
            />
            {/* Starvation 15ms threshold */}
            <line
              x1="0"
              y1={warningY}
              x2={chartWidth}
              y2={warningY}
              stroke="#f43f5e"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.5"
            />

            {/* Gradient Fill under sparkline */}
            <defs>
              <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <polygon
              points={`0,${chartHeight - 8} ${points} ${chartWidth},${chartHeight - 8}`}
              fill="url(#latencyGradient)"
            />

            {/* Sparkline path */}
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              points={points}
            />

            {/* Latest point circle */}
            {samples.length > 0 && (
              <circle
                cx={chartWidth}
                cy={chartHeight - (Math.min(samples[samples.length - 1], maxVal) / maxVal) * (chartHeight - 16) - 8}
                r="4"
                fill="#10b981"
                className="animate-pulse"
              />
            )}
          </svg>
        </div>
      </div>

      {/* Stress Simulation & Benchmark Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Controls */}
        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
          <div className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider mb-3">
            Controlled Thread-Blocking Generator
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Simulates synchronous execution blocking on the main ASGI event loop thread to verify that latency monitors detect starvation and recovery SLAs are met.
          </p>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-gray-400">Target Blocking Duration:</span>
                <span className="text-indigo-400 font-bold">{blockDurationMs} ms</span>
              </div>
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={blockDurationMs}
                disabled={isStressRunning}
                onChange={(e) => setBlockDurationMs(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <span className="text-xs font-mono text-gray-400 block mb-1.5">Simulation Mode:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSimulationType("cpu_burn")}
                  disabled={isStressRunning}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-medium border transition-colors ${
                    simulationType === "cpu_burn"
                      ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/50"
                      : "bg-gray-800/60 text-gray-400 border-gray-700/50 hover:bg-gray-800"
                  }`}
                >
                  CPU-Bound Burn (Math Loop)
                </button>
                <button
                  type="button"
                  onClick={() => setSimulationType("sync_sleep")}
                  disabled={isStressRunning}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-medium border transition-colors ${
                    simulationType === "sync_sleep"
                      ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/50"
                      : "bg-gray-800/60 text-gray-400 border-gray-700/50 hover:bg-gray-800"
                  }`}
                >
                  Sync Blocking (time.sleep)
                </button>
              </div>
            </div>

            <button
              onClick={handleSimulateBlock}
              disabled={isStressRunning}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-mono font-semibold transition-all shadow-md ${
                isStressRunning
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                  : "bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white"
              }`}
            >
              {isStressRunning
                ? `Injecting Delay (${stressTimer}s remaining)...`
                : `Simulate ${blockDurationMs}ms Event-Loop Starvation`}
            </button>
          </div>
        </div>

        {/* Latest Benchmark Recovery Report */}
        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                Starvation Benchmark Recovery Report
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {report.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800/60">
                <span className="text-[10px] font-mono text-gray-400 uppercase block">Target Block</span>
                <span className="text-sm font-bold font-mono text-gray-200">
                  {report.target_block_ms.toFixed(1)} ms
                </span>
              </div>
              <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800/60">
                <span className="text-[10px] font-mono text-gray-400 uppercase block">Observed Lag</span>
                <span className="text-sm font-bold font-mono text-rose-400">
                  {report.measured_lag_ms.toFixed(1)} ms
                </span>
              </div>
              <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800/60">
                <span className="text-[10px] font-mono text-gray-400 uppercase block">Recovery SLA</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {report.recovery_time_ms.toFixed(2)} ms
                </span>
              </div>
              <div className="bg-gray-900/60 p-2.5 rounded-lg border border-gray-800/60">
                <span className="text-[10px] font-mono text-gray-400 uppercase block">Monitor Alert</span>
                <span className={`text-xs font-bold font-mono ${
                  report.detected_by_monitor ? "text-emerald-400" : "text-amber-400"
                }`}>
                  {report.detected_by_monitor ? "FLAGGED (PASS)" : "UNFLAGGED"}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800/80 pt-3 flex items-center justify-between text-[11px] font-mono text-gray-500">
            <span>Run: {report.run_id}</span>
            <span>Trace: {report.trace_id ? report.trace_id.slice(0, 14) : "default"}...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
