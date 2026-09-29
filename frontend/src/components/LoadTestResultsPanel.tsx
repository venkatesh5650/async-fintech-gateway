"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LoadTestReport } from "@/types/api";

const DEFAULT_REPORT: LoadTestReport = {
  run_id: "loadtest_init",
  status: "COMPLETED",
  concurrency: 50,
  duration_seconds: 30.0,
  total_requests: 5130,
  total_success: 5127,
  total_failures: 3,
  requests_per_second: 171.0,
  failure_rate_pct: 0.06,
  latency_p50_ms: 11.8,
  latency_p90_ms: 24.1,
  latency_p95_ms: 31.5,
  latency_p99_ms: 49.7,
  latency_min_ms: 2.1,
  latency_max_ms: 74.3,
  endpoint_breakdown: [
    {
      endpoint: "/v1/intelligence/batch",
      method: "POST",
      request_count: 1850,
      success_count: 1848,
      failure_count: 2,
      p50_ms: 14.2,
      p90_ms: 28.4,
      p95_ms: 36.8,
      p99_ms: 58.1,
      avg_latency_ms: 16.5,
    },
    {
      endpoint: "/v1/market-data/ingest",
      method: "POST",
      request_count: 1720,
      success_count: 1719,
      failure_count: 1,
      p50_ms: 8.6,
      p90_ms: 17.2,
      p95_ms: 22.4,
      p99_ms: 39.5,
      avg_latency_ms: 10.1,
    },
    {
      endpoint: "/v1/analytics/{ticker}",
      method: "GET",
      request_count: 1040,
      success_count: 1040,
      failure_count: 0,
      p50_ms: 11.3,
      p90_ms: 21.8,
      p95_ms: 27.6,
      p99_ms: 44.2,
      avg_latency_ms: 13.0,
    },
    {
      endpoint: "/v1/intelligence/stream-health",
      method: "GET",
      request_count: 520,
      success_count: 520,
      failure_count: 0,
      p50_ms: 3.4,
      p90_ms: 6.1,
      p95_ms: 8.5,
      p99_ms: 12.8,
      avg_latency_ms: 4.2,
    },
  ],
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-loadtest-trace-01",
};

export default function LoadTestResultsPanel() {
  const [report, setReport] = useState<LoadTestReport>(DEFAULT_REPORT);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [concurrency, setConcurrency] = useState<number>(50);
  const [durationSec, setDurationSec] = useState<number>(15);
  const [executionTimer, setExecutionTimer] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchLatestReport = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetch("/api/chaos/load-test");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: LoadTestReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load telemetry";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestReport();
  }, [fetchLatestReport]);

  const handleRunStressTest = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecutionTimer(durationSec);
    setErrorMessage(null);

    const interval = setInterval(() => {
      setExecutionTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await fetch("/api/chaos/load-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concurrency,
          duration_seconds: durationSec,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const freshReport: LoadTestReport = await res.json();
      setReport(freshReport);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Stress test failed";
      setErrorMessage(msg);
    } finally {
      clearInterval(interval);
      setIsExecuting(false);
      setExecutionTimer(0);
    }
  };

  const maxPercentile = Math.max(
    report.latency_p99_ms || 1,
    report.latency_max_ms || 1,
    60
  );

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h2 className="text-lg font-bold text-white tracking-wide">
                High-Throughput Load Testing &amp; Percentile Telemetry
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
                LOCUST HARNESS
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Multi-asset batch enqueue, concurrent market data ingestion, and ASGI event-loop stress evaluation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchLatestReport}
              disabled={isLoading || isExecuting}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition disabled:opacity-50"
            >
              {isLoading ? "Refreshing..." : "↻ Refresh"}
            </button>

            <button
              type="button"
              onClick={handleRunStressTest}
              disabled={isExecuting}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex items-center gap-2 shadow-lg ${
                isExecuting
                  ? "bg-amber-600/30 text-amber-300 border border-amber-500/50 cursor-not-allowed"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30"
              }`}
            >
              {isExecuting ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Executing ({executionTimer}s)...</span>
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>Run Stress Test</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 pb-2">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Concurrency:</span>
            <div className="flex items-center gap-1">
              {[10, 25, 50].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConcurrency(c)}
                  disabled={isExecuting}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    concurrency === c
                      ? "bg-cyan-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {c} users
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Duration:</span>
            <div className="flex items-center gap-1">
              {[10, 15, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationSec(d)}
                  disabled={isExecuting}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                    durationSec === d
                      ? "bg-cyan-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div className="text-right text-xs font-mono text-gray-400">
            <span>Status: </span>
            <span
              className={`font-semibold ${
                report.status === "COMPLETED"
                  ? "text-emerald-400"
                  : report.status === "RUNNING"
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {report.status}
            </span>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs font-mono text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Primary Metric Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-4">
            <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
              Throughput (RPS)
            </span>
            <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
              {report.requests_per_second.toFixed(1)}
              <span className="text-xs text-gray-500 ml-1 font-normal">req/s</span>
            </div>
            <span className="text-[10px] font-mono text-gray-500 mt-1 block">
              {report.total_requests.toLocaleString()} total requests
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-4">
            <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
              Failure Rate
            </span>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${
                report.failure_rate_pct < 1.0
                  ? "text-emerald-400"
                  : report.failure_rate_pct < 5.0
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {report.failure_rate_pct.toFixed(2)}%
            </div>
            <span className="text-[10px] font-mono text-gray-500 mt-1 block">
              {report.total_failures} errors ({report.total_success.toLocaleString()} ok)
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-4">
            <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
              P50 Median Latency
            </span>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {report.latency_p50_ms.toFixed(1)}
              <span className="text-xs text-gray-500 ml-1 font-normal">ms</span>
            </div>
            <span className="text-[10px] font-mono text-gray-500 mt-1 block">
              Min: {report.latency_min_ms.toFixed(1)}ms
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-4">
            <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
              P99 Tail Latency
            </span>
            <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
              {report.latency_p99_ms.toFixed(1)}
              <span className="text-xs text-gray-500 ml-1 font-normal">ms</span>
            </div>
            <span className="text-[10px] font-mono text-gray-500 mt-1 block">
              Max: {report.latency_max_ms.toFixed(1)}ms
            </span>
          </div>
        </div>

        {/* Quantile Progression Visualizer */}
        <div className="mt-6 bg-gray-950/60 border border-gray-800/80 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold text-gray-300">
              Latency Percentile Distribution
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              Run: {report.run_id} | Concurrency: {report.concurrency} users
            </span>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            {[
              { label: "P50 (Median)", val: report.latency_p50_ms, color: "bg-emerald-500" },
              { label: "P90 (Fast)", val: report.latency_p90_ms, color: "bg-blue-500" },
              { label: "P95 (Edge)", val: report.latency_p95_ms, color: "bg-amber-500" },
              { label: "P99 (Tail)", val: report.latency_p99_ms, color: "bg-purple-500" },
            ].map((p) => {
              const widthPct = Math.min(Math.max((p.val / maxPercentile) * 100, 2), 100);
              return (
                <div key={p.label} className="flex items-center gap-3">
                  <span className="w-24 text-[11px] text-gray-400 shrink-0">{p.label}</span>
                  <div className="flex-1 bg-gray-900 rounded h-3 overflow-hidden">
                    <div
                      className={`h-full ${p.color} transition-all duration-500 rounded`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-semibold text-white text-[11px] shrink-0">
                    {p.val.toFixed(1)} ms
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-Endpoint Breakdown Table */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold text-gray-300">
              Target Endpoints Breakdown
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              Updated: {new Date(report.timestamp_iso).toLocaleTimeString()}
            </span>
          </div>

          <div className="overflow-x-auto border border-gray-800/80 rounded-lg">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-gray-950/80 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
                <tr>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Endpoint</th>
                  <th className="py-2.5 px-3 text-right">Requests</th>
                  <th className="py-2.5 px-3 text-right">P50 (ms)</th>
                  <th className="py-2.5 px-3 text-right">P95 (ms)</th>
                  <th className="py-2.5 px-3 text-right">P99 (ms)</th>
                  <th className="py-2.5 px-3 text-right">Success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-gray-950/40">
                {report.endpoint_breakdown.map((ep, idx) => (
                  <tr key={idx} className="hover:bg-gray-800/30 transition">
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          ep.method === "POST"
                            ? "bg-cyan-950 text-cyan-400 border border-cyan-800/60"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                        }`}
                      >
                        {ep.method}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-200 font-semibold">{ep.endpoint}</td>
                    <td className="py-2 px-3 text-right text-gray-400">
                      {ep.request_count.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-emerald-400">{ep.p50_ms.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-amber-400">{ep.p95_ms.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-purple-400">{ep.p99_ms.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-emerald-400 font-semibold">
                        {ep.request_count > 0
                          ? ((ep.success_count / ep.request_count) * 100).toFixed(1)
                          : "100.0"}
                        %
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Trace Telemetry */}
        <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>W3C Trace: {report.trace_id}</span>
          <span>Duration: {report.duration_seconds}s</span>
        </div>
      </div>
    </div>
  );
}
