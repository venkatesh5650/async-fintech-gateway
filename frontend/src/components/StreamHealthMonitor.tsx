"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { StreamHealthResponse, StreamHealthStatus } from "@/types/api";

const POLL_INTERVAL_MS = 3000;
const REFRESH_TICK_MS = 1000;
const MAX_HISTORY_POINTS = 20;

const MIN_CONCURRENCY = 3;
const MAX_CONCURRENCY = 10;
const SCALE_UP_THRESHOLD = 5;

interface LagDataPoint {
  time: string;
  lag: number;
  totalLag: number;
}

const STATUS_CONFIG: Record<
  StreamHealthStatus,
  { label: string; badgeClass: string; dotClass: string; description: string }
> = {
  HEALTHY: {
    label: "HEALTHY",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dotClass: "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
    description: "Zero stream backlog. Consumers idle and ready for ingestion.",
  },
  ACTIVE: {
    label: "ACTIVE",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    dotClass: "bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-pulse",
    description: "Nominal stream throughput. Messages processed within latency budget.",
  },
  DEGRADED: {
    label: "DEGRADED",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    dotClass: "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse",
    description: "Moderate queue lag accumulating. Auto-scaler increasing concurrency.",
  },
  CRITICAL: {
    label: "CRITICAL",
    badgeClass: "bg-red-500/10 text-red-400 border-red-500/30",
    dotClass: "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse",
    description: "High queue backlog. Worker pool running at maximum surge capacity.",
  },
};

export default function StreamHealthMonitor() {
  const [data, setData] = useState<StreamHealthResponse | null>(null);
  const [lagHistory, setLagHistory] = useState<LagDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const [mounted, setMounted] = useState(false);

  const concurrencyRef = useRef<number>(MIN_CONCURRENCY);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/stream-health", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json: StreamHealthResponse = await res.json();
      setData(json);
      setIsError(false);

      const totalLag = (json.lag || 0) + (json.pel_count || 0);

      // Autonomous dynamic concurrency calculation matching backend algorithm
      if (totalLag === 0) {
        concurrencyRef.current = MIN_CONCURRENCY;
      } else if (totalLag <= SCALE_UP_THRESHOLD) {
        // Steady state
      } else if (totalLag <= SCALE_UP_THRESHOLD * 3) {
        concurrencyRef.current = Math.min(concurrencyRef.current + 1, MAX_CONCURRENCY);
      } else {
        concurrencyRef.current = MAX_CONCURRENCY;
      }

      // Append point to rolling sparkline history
      const nowStr = new Date().toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setLagHistory((prev) => {
        const next = [...prev, { time: nowStr, lag: json.lag || 0, totalLag }];
        if (next.length > MAX_HISTORY_POINTS) {
          return next.slice(next.length - MAX_HISTORY_POINTS);
        }
        return next;
      });
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
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : POLL_INTERVAL_MS / 1000));
    }, REFRESH_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const healthStatus: StreamHealthStatus = data?.health_status || "HEALTHY";
  const config = STATUS_CONFIG[healthStatus];

  const totalLag = (data?.lag || 0) + (data?.pel_count || 0);
  const currentConcurrency = Math.max(
    MIN_CONCURRENCY,
    Math.min(concurrencyRef.current, MAX_CONCURRENCY)
  );
  const concurrencyPercent =
    ((currentConcurrency - MIN_CONCURRENCY) / (MAX_CONCURRENCY - MIN_CONCURRENCY)) *
    100;

  // Compute SVG sparkline coordinates
  const sparklineHeight = 60;
  const sparklineWidth = 360;
  const maxHistoryLag = Math.max(...lagHistory.map((p) => p.totalLag), 5);

  const sparklinePoints = lagHistory.map((pt, idx) => {
    const x =
      lagHistory.length > 1
        ? (idx / (lagHistory.length - 1)) * sparklineWidth
        : sparklineWidth;
    const y = sparklineHeight - (pt.totalLag / maxHistoryLag) * (sparklineHeight - 10) - 5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylineStr = sparklinePoints.join(" ");
  const areaPoints =
    sparklinePoints.length > 0
      ? `0,${sparklineHeight} ${polylineStr} ${sparklineWidth},${sparklineHeight}`
      : "";

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left shadow-2xl space-y-6">
      {/* ── Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${config.dotClass}`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white text-sm font-bold tracking-wider uppercase">
                Stream Health Monitor
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${config.badgeClass}`}
              >
                {config.label}
              </span>
            </div>
            <span className="text-gray-500 text-xs block mt-0.5">
              {config.description}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className="text-gray-500 text-[11px] tabular-nums">
            Next tick: {countdown}s
          </span>
          <button
            onClick={fetchHealth}
            className="px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white rounded text-xs transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {isError && (
        <div className="text-xs text-red-400/90 border border-red-500/20 bg-red-500/5 px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>⚠ Telemetry edge unreachable. Backend service may be starting up.</span>
          <button onClick={fetchHealth} className="underline hover:text-white transition">
            Retry
          </button>
        </div>
      )}

      {/* ── Metric Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Total Backlog (Lag)
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                totalLag > 20
                  ? "text-red-400"
                  : totalLag > 0
                  ? "text-blue-400"
                  : "text-emerald-400"
              }`}
            >
              {data ? data.lag : "—"}
            </span>
            <span className="text-[10px] text-gray-600">unread msgs</span>
          </div>
        </div>

        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            In-Flight (PEL)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
              {data ? data.pel_count : "—"}
            </span>
            <span className="text-[10px] text-gray-600">unacked</span>
          </div>
        </div>

        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Stream Volume (XLEN)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-gray-200 tabular-nums">
              {data ? data.stream_len : "—"}
            </span>
            <span className="text-[10px] text-gray-600">retained</span>
          </div>
        </div>

        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Active Consumers
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-purple-400 tabular-nums">
              {data ? data.consumer_count : "—"}
            </span>
            <span className="text-[10px] text-gray-600">nodes registered</span>
          </div>
        </div>
      </div>

      {/* ── Two-Column Operational Detail (Sparkline + Concurrency Gauge) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Live Lag Sparkline Micro-Chart */}
        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                Live Backlog Trend (Lag Sparkline)
              </span>
              <span className="text-xs text-gray-400 font-bold">
                Peak: {maxHistoryLag} msgs in window
              </span>
            </div>
            <span className="text-[10px] text-gray-600">Last 20 ticks</span>
          </div>

          <div className="relative w-full bg-black/60 border border-gray-900 rounded-lg p-2 overflow-hidden">
            {isLoading && lagHistory.length === 0 ? (
              <div className="h-[60px] flex items-center justify-center text-[10px] text-gray-700 uppercase tracking-widest">
                Gathering telemetry...
              </div>
            ) : lagHistory.length > 0 ? (
              <svg
                viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
                className="w-full h-[60px] overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="lagAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {areaPoints && (
                  <polygon points={areaPoints} fill="url(#lagAreaGrad)" />
                )}
                {polylineStr && (
                  <polyline
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylineStr}
                  />
                )}
              </svg>
            ) : (
              <div className="h-[60px] flex items-center justify-center text-[10px] text-gray-700">
                No backlog recorded
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-600">
            <span>T - {lagHistory.length * (POLL_INTERVAL_MS / 1000)}s</span>
            <span>Now ({data ? `${totalLag} total lag` : "—"})</span>
          </div>
        </div>

        {/* Right: Autonomous Concurrency Bar */}
        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                Autonomous Concurrency Controller
              </span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {currentConcurrency} / {MAX_CONCURRENCY} Workers
              </span>
            </div>
            <span className="text-[10px] text-gray-600 block mt-0.5">
              Auto-scales semaphore pool based on real-time stream lag.
            </span>
          </div>

          {/* Scale Gauge Bar */}
          <div className="space-y-1.5 pt-2">
            <div className="w-full bg-gray-900 rounded-full h-3 overflow-hidden p-0.5 border border-gray-800 flex">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  currentConcurrency >= 8
                    ? "bg-gradient-to-r from-blue-500 via-amber-500 to-red-500"
                    : currentConcurrency > 4
                    ? "bg-gradient-to-r from-blue-500 to-amber-400"
                    : "bg-gradient-to-r from-emerald-500 to-blue-500"
                }`}
                style={{ width: `${Math.max(15, concurrencyPercent)}%` }}
              />
            </div>

            <div className="flex justify-between text-[9px] text-gray-600">
              <span className="text-emerald-500">3 (Idle Baseline)</span>
              <span className="text-blue-400">5 (Threshold)</span>
              <span className="text-red-400">10 (Surge Peak)</span>
            </div>
          </div>

          <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-900 flex justify-between">
            <span>Active Policy: Dynamic Auto-Scale</span>
            <span className="text-gray-400">
              {currentConcurrency === MIN_CONCURRENCY
                ? "Dormant (Zero Backlog)"
                : currentConcurrency === MAX_CONCURRENCY
                ? "Surge Clamped"
                : "Active Scaling"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Consumer Group Topology Metadata ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-gray-900 text-xs">
        <div>
          <span className="text-[9px] text-gray-600 uppercase block">Stream Name</span>
          <span className="text-gray-300 font-mono text-[11px]">
            {data?.stream_name || "stream:intel_jobs"}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-gray-600 uppercase block">Consumer Group</span>
          <span className="text-gray-300 font-mono text-[11px]">
            {data?.consumer_group || "intel_workers_group"}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-gray-600 uppercase block">Last Dispatched ID</span>
          <span className="text-gray-400 font-mono text-[11px] truncate block" title={data?.last_delivered_id}>
            {data?.last_delivered_id || "0-0"}
          </span>
        </div>
      </div>
    </div>
  );
}
