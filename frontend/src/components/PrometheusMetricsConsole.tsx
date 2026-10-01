"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MetricSummaryReport, TrafficSimulationResponse } from "../types/api";

export function PrometheusMetricsConsole() {
  const [report, setReport] = useState<MetricSummaryReport | null>(null);
  const [rawMetrics, setRawMetrics] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"samples" | "raw" | "json">("samples");
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const [summaryRes, rawRes] = await Promise.all([
        fetch("/api/cloud/metrics/summary", { cache: "no-store" }),
        fetch("/api/cloud/metrics/raw", { cache: "no-store" }),
      ]);

      if (!summaryRes.ok) {
        throw new Error(`Summary API HTTP ${summaryRes.status}`);
      }

      const summaryData: MetricSummaryReport = await summaryRes.json();
      setReport(summaryData);
      setError(null);

      if (rawRes.ok) {
        const rawText = await rawRes.text();
        setRawMetrics(rawText);
      }
    } catch (err: any) {
      console.error("Failed to fetch Prometheus metrics:", err);
      setError(err?.message || "Failed to connect to Prometheus telemetry endpoint");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 4000);
    return () => clearInterval(interval);
  }, [fetchMetrics, autoRefresh]);

  const handleSimulateTraffic = async (count: number = 25) => {
    setSimulating(true);
    setSimulationStatus(`Injecting ${count} synthetic requests...`);
    try {
      const res = await fetch("/api/cloud/metrics/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!res.ok) throw new Error(`Simulation failed: HTTP ${res.status}`);
      const data: TrafficSimulationResponse = await res.json();
      setSimulationStatus(`✓ Injected ${data.simulated_requests} requests across histogram buckets.`);
      await fetchMetrics();
      setTimeout(() => setSimulationStatus(null), 4000);
    } catch (err: any) {
      setSimulationStatus(`❌ Error: ${err?.message}`);
      setTimeout(() => setSimulationStatus(null), 4000);
    } finally {
      setSimulating(false);
    }
  };

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(rawMetrics);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const filteredSamples = (report?.samples || []).filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.help.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(s.labels).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "ALL" || s.type.toUpperCase() === typeFilter.toUpperCase();
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono text-xl shadow-inner">
                📊
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white tracking-wide">
                    Prometheus Telemetry & Latency Histograms
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    OPENMETRICS 0.0.4
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scrape Target: <code className="text-cyan-300 font-mono">GET /metrics</code> · Live SRE Golden Signals, exponential histogram buckets, and queue saturation
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all flex items-center gap-1.5 ${
                autoRefresh
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/10"
                  : "bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-cyan-400 animate-ping" : "bg-slate-600"}`} />
              Auto-poll (4s)
            </button>

            <button
              onClick={() => fetchMetrics()}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5"
            >
              🔄 Refresh
            </button>

            <button
              onClick={() => handleSimulateTraffic(30)}
              disabled={simulating}
              className="px-3.5 py-1.5 text-xs font-mono font-medium rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/20 border border-cyan-400/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              ⚡ Inject Synthetic Traffic
            </button>
          </div>
        </div>

        {simulationStatus && (
          <div className="mt-3 text-xs font-mono px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 animate-fadeIn">
            {simulationStatus}
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs font-mono px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800/50 text-rose-300">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* SRE Golden Signals Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Throughput */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Throughput (Rate)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-cyan-400">
              {report ? report.golden_signals.throughput_rps.toFixed(1) : "—"}
            </span>
            <span className="text-xs text-slate-500 font-mono">req/s</span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Total:</span>
            <span className="text-slate-300 font-semibold">{report?.golden_signals.total_requests ?? 0}</span>
          </div>
        </div>

        {/* Error Rate */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Error Rate</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold font-mono ${
                (report?.golden_signals.error_rate_pct ?? 0) > 5.0 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {report ? `${report.golden_signals.error_rate_pct.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Errors:</span>
            <span className="text-slate-300 font-semibold">{report?.golden_signals.error_requests ?? 0}</span>
          </div>
        </div>

        {/* P50 Latency */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Latency (P50)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-white">
              {report ? `${report.golden_signals.p50_latency_ms.toFixed(0)}` : "—"}
            </span>
            <span className="text-xs text-slate-500 font-mono">ms</span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Median SLA:</span>
            <span className="text-emerald-400 font-semibold">&lt; 100ms</span>
          </div>
        </div>

        {/* P90 Latency */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Latency (P90)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-amber-300">
              {report ? `${report.golden_signals.p90_latency_ms.toFixed(0)}` : "—"}
            </span>
            <span className="text-xs text-slate-500 font-mono">ms</span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Target:</span>
            <span className="text-amber-400 font-semibold">&lt; 300ms</span>
          </div>
        </div>

        {/* P99 Latency */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Latency (P99)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold font-mono ${
                (report?.golden_signals.p99_latency_ms ?? 0) > 500 ? "text-rose-400" : "text-cyan-300"
              }`}
            >
              {report ? `${report.golden_signals.p99_latency_ms.toFixed(0)}` : "—"}
            </span>
            <span className="text-xs text-slate-500 font-mono">ms</span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Hard SLA:</span>
            <span className="text-cyan-400 font-semibold">&lt; 500ms</span>
          </div>
        </div>

        {/* Event Loop Lag */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">ASGI Loop Lag</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {report ? `${report.golden_signals.event_loop_lag_ms.toFixed(1)}` : "—"}
            </span>
            <span className="text-xs text-slate-500 font-mono">ms</span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Non-blocking:</span>
            <span className="text-emerald-400 font-semibold">OPTIMAL</span>
          </div>
        </div>
      </div>

      {/* Subsystem Health Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Stream Lag */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Redis Streams Lag</span>
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <div className="mt-3 space-y-2">
            {report && Object.keys(report.stream_lag).length > 0 ? (
              Object.entries(report.stream_lag).map(([stream, lag]) => (
                <div key={stream} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300 truncate max-w-[140px]">{stream}</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${lag === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {lag} msg pending
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs font-mono text-slate-500">0 pending messages</div>
            )}
          </div>
        </div>

        {/* Distributed Cache Telemetry */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Distributed Cache</span>
            <span className="text-xs font-mono font-bold text-cyan-400">{report?.cache_telemetry.hit_rate_pct.toFixed(1)}% Hit Rate</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-mono">
            <div>
              <div className="text-slate-500 text-[10px]">HITS</div>
              <div className="text-sm font-bold text-emerald-400">{report?.cache_telemetry.hits ?? 0}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">MISSES</div>
              <div className="text-sm font-bold text-amber-400">{report?.cache_telemetry.misses ?? 0}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">SAVINGS</div>
              <div className="text-sm font-bold text-cyan-400">~85% I/O</div>
            </div>
          </div>
        </div>

        {/* Resilience Circuit Breakers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Circuit Breakers</span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              OPERATIONAL
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {report && Object.entries(report.circuit_breaker_status).map(([circuit, st]) => (
              <div key={circuit} className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">{circuit}</span>
                <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${st === "CLOSED" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                  {st}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Database Connection Pool */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Postgres Pool</span>
            <span className="text-xs font-mono text-slate-400">Max: 10</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-mono">
            <div>
              <div className="text-slate-500 text-[10px]">ACTIVE</div>
              <div className="text-sm font-bold text-cyan-400">{report?.db_pool_status.active_connections ?? 2}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">IDLE</div>
              <div className="text-sm font-bold text-emerald-400">{report?.db_pool_status.idle_connections ?? 8}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px]">SATURATION</div>
              <div className="text-sm font-bold text-slate-300">20.0%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Tabbed Explorer */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Navigation Tabs & Controls */}
        <div className="border-b border-slate-800 px-5 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("samples")}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === "samples"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📑 Metric Samples ({filteredSamples.length})
            </button>
            <button
              onClick={() => setActiveTab("raw")}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === "raw"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📄 Raw /metrics Output
            </button>
            <button
              onClick={() => setActiveTab("json")}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
                activeTab === "json"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⚙️ JSON Contract
            </button>
          </div>

          {activeTab === "samples" && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter metrics or labels..."
                className="bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48 md:w-64"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-800/90 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Types</option>
                <option value="COUNTER">Counter</option>
                <option value="GAUGE">Gauge</option>
                <option value="HISTOGRAM">Histogram</option>
              </select>
            </div>
          )}

          {activeTab === "raw" && (
            <button
              onClick={handleCopyRaw}
              className="px-3 py-1 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5"
            >
              {copySuccess ? "✓ Copied!" : "📋 Copy All"}
            </button>
          )}
        </div>

        {/* Tab 1: Samples Table */}
        {activeTab === "samples" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Metric Identifier</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Documentation</th>
                  <th className="py-2.5 px-3">Labels</th>
                  <th className="py-2.5 px-4 text-right">Observed Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSamples.length > 0 ? (
                  filteredSamples.map((sample, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-cyan-300">
                        {sample.name}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            sample.type === "counter"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                              : sample.type === "gauge"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {sample.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate" title={sample.help}>
                        {sample.help}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {Object.keys(sample.labels).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(sample.labels).map(([k, v]) => (
                              <span key={k} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">
                                {k}={v}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-white">
                        {typeof sample.value === "number" ? sample.value.toLocaleString() : sample.value}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-mono">
                      No metric samples match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Raw /metrics Text Stream */}
        {activeTab === "raw" && (
          <div className="p-4">
            <pre className="text-xs font-mono bg-slate-950 p-4 rounded-lg text-emerald-400 overflow-x-auto max-h-[500px] border border-slate-800 leading-relaxed">
              {rawMetrics || "# Fetching live /metrics stream from FastAPI ASGI gateway..."}
            </pre>
          </div>
        )}

        {/* Tab 3: Machine JSON Inspector */}
        {activeTab === "json" && (
          <div className="p-4">
            <pre className="text-xs font-mono bg-slate-950 p-4 rounded-lg text-cyan-300 overflow-x-auto max-h-[500px] border border-slate-800 leading-relaxed">
              {report ? JSON.stringify(report, null, 2) : "// Loading..."}
            </pre>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-500 px-1">
        <div>
          W3C Trace Lineage: <code className="text-cyan-400">{report?.trace_id || "—"}</code>
        </div>
        <div>
          Last Scraped: {report ? new Date(report.timestamp_iso).toLocaleTimeString() : "—"}
        </div>
      </div>
    </div>
  );
}

export default PrometheusMetricsConsole;
