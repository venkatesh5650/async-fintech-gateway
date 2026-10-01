"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  TraceWaterfallDetail,
  WaterfallSpanItem,
  TraceSummaryItem,
  TraceQueryResponse,
} from "../types/api";

const SERVICE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  "fintech-gateway-api": {
    bg: "bg-sky-950/40 border-sky-800/60",
    text: "text-sky-300",
    bar: "from-sky-500 to-blue-600",
  },
  "redis-distributed-cache": {
    bg: "bg-amber-950/40 border-amber-800/60",
    text: "text-amber-300",
    bar: "from-amber-500 to-yellow-600",
  },
  "postgres-timeseries-db": {
    bg: "bg-indigo-950/40 border-indigo-800/60",
    text: "text-indigo-300",
    bar: "from-indigo-500 to-violet-600",
  },
  "redis-streams-broker": {
    bg: "bg-orange-950/40 border-orange-800/60",
    text: "text-orange-300",
    bar: "from-orange-500 to-amber-600",
  },
  "fintech-stream-worker": {
    bg: "bg-purple-950/40 border-purple-800/60",
    text: "text-purple-300",
    bar: "from-purple-500 to-fuchsia-600",
  },
  "pgvector-rag-engine": {
    bg: "bg-emerald-950/40 border-emerald-800/60",
    text: "text-emerald-300",
    bar: "from-emerald-500 to-teal-600",
  },
  "langgraph-reasoning-core": {
    bg: "bg-cyan-950/40 border-cyan-800/60",
    text: "text-cyan-300",
    bar: "from-cyan-500 to-teal-500",
  },
  "websocket-fanout-manager": {
    bg: "bg-pink-950/40 border-pink-800/60",
    text: "text-pink-300",
    bar: "from-pink-500 to-rose-600",
  },
};

const DEFAULT_SERVICE_COLOR = {
  bg: "bg-gray-800/50 border-gray-700",
  text: "text-gray-300",
  bar: "from-gray-500 to-slate-600",
};

export function TraceWaterfallExplorer() {
  const [traces, setTraces] = useState<TraceSummaryItem[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [waterfall, setWaterfall] = useState<TraceWaterfallDetail | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<WaterfallSpanItem | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [tickerFilter, setTickerFilter] = useState<string>("ALL");
  const [scenario, setScenario] = useState<string>("SUCCESS");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"waterfall" | "raw">("waterfall");
  const [error, setError] = useState<string | null>(null);

  const fetchTraceList = useCallback(
    async (preferredId?: string) => {
      try {
        setLoadingList(true);
        const params = new URLSearchParams();
        if (statusFilter !== "ALL") params.append("status_filter", statusFilter);
        if (tickerFilter !== "ALL") params.append("ticker", tickerFilter);
        params.append("limit", "25");

        const res = await fetch(`/api/cloud/traces?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TraceQueryResponse = await res.json();
        setTraces(data.traces || []);

        const targetId =
          preferredId ||
          (data.traces && data.traces.length > 0 ? data.traces[0].trace_id : null);
        if (targetId) {
          setSelectedTraceId(targetId);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingList(false);
      }
    },
    [statusFilter, tickerFilter]
  );

  const fetchWaterfall = useCallback(async (traceId: string) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const res = await fetch(`/api/cloud/traces/${encodeURIComponent(traceId)}/waterfall`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TraceWaterfallDetail = await res.json();
      setWaterfall(data);
      if (data.spans && data.spans.length > 0) {
        setSelectedSpan(data.spans[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchTraceList();
  }, [fetchTraceList]);

  useEffect(() => {
    if (selectedTraceId) {
      fetchWaterfall(selectedTraceId);
    }
  }, [selectedTraceId, fetchWaterfall]);

  const handleSimulateTrace = async () => {
    try {
      setSimulating(true);
      setError(null);
      const res = await fetch("/api/cloud/traces/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: tickerFilter === "ALL" ? "AAPL" : tickerFilter,
          scenario,
          error_injected: scenario === "VECTOR_ERROR",
        }),
      });
      if (!res.ok) throw new Error(`Simulation failed: HTTP ${res.status}`);
      const data = await res.json();
      await fetchTraceList(data.trace_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(label);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  return (
    <div className="space-y-6 text-gray-200">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-900/90 border border-gray-800 rounded-xl p-5 shadow-lg backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌊</span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              W3C Distributed Trace Waterfall & Span Explorer
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-mono font-semibold rounded-full bg-cyan-900/40 border border-cyan-700/60 text-cyan-300">
              Day 98 • Production Observability
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Hierarchical parent-child span lineage, microsecond Gantt timing, critical path
            bottlenecks & W3C traceparent context across edge, queue, RAG, and reasoning cores.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="SUCCESS">Scenario: Fast Path (OK)</option>
            <option value="CACHE_MISS">Scenario: Cache Miss (Cold)</option>
            <option value="SLOW_LLM">Scenario: Slow LLM Bottleneck</option>
            <option value="VECTOR_ERROR">Scenario: Vector RAG Error</option>
          </select>

          <button
            type="button"
            onClick={handleSimulateTrace}
            disabled={simulating}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            <span>{simulating ? "⏳" : "⚡"}</span>
            <span>{simulating ? "Simulating..." : "Inject Multi-Hop Trace"}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchTraceList(selectedTraceId || undefined)}
            className="p-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-all"
            title="Refresh Trace List"
          >
            🔄
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs bg-red-950/60 border border-red-800/80 rounded-lg text-red-300 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Filter and Trace Picker Rail */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Trace Selector:
          </span>

          <select
            value={selectedTraceId || ""}
            onChange={(e) => setSelectedTraceId(e.target.value)}
            disabled={loadingList || traces.length === 0}
            className="flex-1 md:w-80 px-3 py-1.5 text-xs font-mono bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          >
            {traces.map((t) => (
              <option key={t.trace_id} value={t.trace_id}>
                [{t.status}] {t.ticker || "MKT"} • {t.duration_ms}ms • {t.trace_id.slice(0, 10)}...
              </option>
            ))}
          </select>

          {/* Quick Filters */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-mono bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
          >
            <option value="ALL">Status: All</option>
            <option value="OK">Status: OK</option>
            <option value="ERROR">Status: ERROR</option>
            <option value="SLOW">Status: SLOW</option>
          </select>

          <select
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-mono bg-gray-800 border border-gray-700 rounded-lg text-gray-300"
          >
            <option value="ALL">Ticker: All</option>
            <option value="AAPL">AAPL</option>
            <option value="NVDA">NVDA</option>
            <option value="MSFT">MSFT</option>
            <option value="TSLA">TSLA</option>
            <option value="GOOGL">GOOGL</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("waterfall")}
            className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all ${
              activeTab === "waterfall"
                ? "bg-cyan-900/50 border border-cyan-600 text-cyan-300"
                : "text-gray-400 hover:text-white"
            }`}
          >
            📊 Gantt Waterfall
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("raw")}
            className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all ${
              activeTab === "raw"
                ? "bg-cyan-900/50 border border-cyan-600 text-cyan-300"
                : "text-gray-400 hover:text-white"
            }`}
          >
            📜 Raw JSON
          </button>
        </div>
      </div>

      {/* Telemetry Overview Cards */}
      {waterfall && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
            <span className="text-[11px] font-mono text-gray-400 block uppercase">
              Total Duration
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-white">
                {waterfall.total_duration_ms}
              </span>
              <span className="text-xs text-gray-400">ms</span>
            </div>
            <span
              className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-mono font-semibold rounded ${
                waterfall.status === "ERROR"
                  ? "bg-red-950/60 text-red-300 border border-red-800"
                  : waterfall.status === "SLOW"
                  ? "bg-amber-950/60 text-amber-300 border border-amber-800"
                  : "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
              }`}
            >
              {waterfall.status}
            </span>
          </div>

          <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
            <span className="text-[11px] font-mono text-gray-400 block uppercase">
              Critical Path
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-amber-300">
                {waterfall.critical_path_duration_ms}
              </span>
              <span className="text-xs text-gray-400">ms</span>
            </div>
            <span className="text-[11px] text-gray-400 block mt-2">
              {Math.round((waterfall.critical_path_duration_ms / waterfall.total_duration_ms) * 100)}% of total latency
            </span>
          </div>

          <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
            <span className="text-[11px] font-mono text-gray-400 block uppercase">
              Span Count
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-cyan-300">
                {waterfall.span_count}
              </span>
              <span className="text-xs text-gray-400">spans</span>
            </div>
            <span className="text-[11px] text-gray-400 block mt-2">
              {waterfall.error_count > 0 ? (
                <span className="text-red-400">⚠️ {waterfall.error_count} error spans</span>
              ) : (
                <span className="text-emerald-400">✓ 0 error spans</span>
              )}
            </span>
          </div>

          <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
            <span className="text-[11px] font-mono text-gray-400 block uppercase">
              Root Service
            </span>
            <div className="text-sm font-semibold font-mono text-white mt-1 truncate">
              {waterfall.service_name}
            </div>
            <span className="text-[10px] font-mono text-gray-400 block mt-2 truncate">
              {waterfall.root_span_name}
            </span>
          </div>

          <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 col-span-2 md:col-span-1">
            <span className="text-[11px] font-mono text-gray-400 block uppercase">
              W3C Trace ID
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs font-mono text-cyan-300 truncate">
                {waterfall.trace_id.slice(0, 14)}...
              </span>
              <button
                type="button"
                onClick={() => handleCopy(waterfall.trace_id, "trace_id")}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700"
              >
                {copyStatus === "trace_id" ? "✓" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(waterfall.w3c_traceparent, "traceparent")}
              className="text-[10px] font-mono text-gray-400 hover:text-cyan-300 block mt-2 underline"
            >
              {copyStatus === "traceparent" ? "Copied traceparent!" : "Copy W3C header"}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loadingDetail ? (
        <div className="h-64 flex items-center justify-center bg-gray-900/50 rounded-xl border border-gray-800">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm">
            <span>⏳</span> Reconstructing distributed span tree...
          </div>
        </div>
      ) : activeTab === "raw" ? (
        <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 font-mono text-xs overflow-x-auto">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-800">
            <span className="text-gray-400">OpenTelemetry / W3C Trace Waterfall Payload</span>
            <button
              type="button"
              onClick={() => handleCopy(JSON.stringify(waterfall, null, 2), "raw_json")}
              className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-gray-700"
            >
              {copyStatus === "raw_json" ? "✓ Copied" : "Copy JSON"}
            </button>
          </div>
          <pre className="text-emerald-400/90">{JSON.stringify(waterfall, null, 2)}</pre>
        </div>
      ) : waterfall ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gantt Waterfall Visualizer (Span Tree + Timeline) */}
          <div className="lg:col-span-2 bg-gray-900/80 border border-gray-800 rounded-xl p-5 overflow-hidden">
            {/* Timeline Ruler Header */}
            <div className="flex items-center border-b border-gray-800 pb-2 mb-3 text-[11px] font-mono text-gray-400">
              <div className="w-1/2 md:w-5/12">Operation & Hierarchy</div>
              <div className="w-1/2 md:w-7/12 flex justify-between px-2 text-[10px] text-gray-500">
                <span>0ms</span>
                <span>{Math.round(waterfall.total_duration_ms * 0.25)}ms</span>
                <span>{Math.round(waterfall.total_duration_ms * 0.5)}ms</span>
                <span>{Math.round(waterfall.total_duration_ms * 0.75)}ms</span>
                <span>{waterfall.total_duration_ms}ms</span>
              </div>
            </div>

            {/* Span Rows */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {waterfall.spans.map((span) => {
                const sColor = SERVICE_COLORS[span.service] || DEFAULT_SERVICE_COLOR;
                const isSelected = selectedSpan?.span_id === span.span_id;

                return (
                  <div
                    key={span.span_id}
                    onClick={() => setSelectedSpan(span)}
                    className={`flex items-center text-xs font-mono py-2 px-2.5 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? "bg-gray-800/90 border-cyan-500 shadow-sm"
                        : "bg-gray-950/40 border-gray-800/60 hover:bg-gray-850 hover:border-gray-700"
                    }`}
                  >
                    {/* Left: Hierarchy & Descriptor */}
                    <div className="w-1/2 md:w-5/12 flex items-center gap-1.5 pr-2 truncate">
                      {/* Depth Indentation Indication */}
                      <div
                        style={{ width: `${span.depth * 14}px` }}
                        className="shrink-0 flex items-center justify-end"
                      >
                        {span.depth > 0 && <span className="text-gray-600 text-[10px]">└</span>}
                      </div>

                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-semibold shrink-0 uppercase border ${
                          span.status === "ERROR"
                            ? "bg-red-950/60 border-red-800 text-red-300"
                            : span.is_critical_path
                            ? "bg-amber-950/60 border-amber-800 text-amber-300"
                            : "bg-gray-800 border-gray-700 text-gray-400"
                        }`}
                      >
                        {span.kind}
                      </span>

                      <span className={`truncate font-medium ${sColor.text}`} title={span.name}>
                        {span.name}
                      </span>

                      {span.is_critical_path && (
                        <span
                          className="shrink-0 text-[10px] text-amber-400 font-bold"
                          title="Critical Path Bottleneck"
                        >
                          ⚡
                        </span>
                      )}
                    </div>

                    {/* Right: Gantt Bar */}
                    <div className="w-1/2 md:w-7/12 relative h-6 bg-gray-950/80 rounded border border-gray-800/60 flex items-center px-0.5 overflow-hidden">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 flex justify-between pointer-events-none opacity-15">
                        <div className="border-r border-gray-600 h-full w-1/4" />
                        <div className="border-r border-gray-600 h-full w-1/4" />
                        <div className="border-r border-gray-600 h-full w-1/4" />
                      </div>

                      {/* Bar Fill */}
                      <div
                        style={{
                          marginLeft: `${span.offset_percent}%`,
                          width: `${span.width_percent}%`,
                        }}
                        className={`h-4 rounded bg-gradient-to-r ${sColor.bar} transition-all relative group flex items-center justify-between px-1 ${
                          span.status === "ERROR"
                            ? "from-red-600 to-rose-700 border border-red-400"
                            : span.is_critical_path
                            ? "border border-amber-300/80"
                            : ""
                        }`}
                      >
                        <span className="text-[10px] font-bold text-white drop-shadow-sm truncate">
                          {span.duration_ms}ms
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Span Detail Inspector Card */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🔍</span> Span Attributes
              </h3>
              {selectedSpan && (
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded ${
                    selectedSpan.status === "ERROR"
                      ? "bg-red-950 text-red-300 border border-red-800"
                      : selectedSpan.status === "SLOW"
                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                      : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  }`}
                >
                  {selectedSpan.status}
                </span>
              )}
            </div>

            {selectedSpan ? (
              <div className="space-y-4 text-xs font-mono">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Operation</span>
                  <div className="text-white font-semibold mt-0.5 break-all">
                    {selectedSpan.name}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Service</span>
                    <div className="text-cyan-300 font-medium">{selectedSpan.service}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Kind / Depth</span>
                    <div className="text-gray-200">
                      {selectedSpan.kind} (Depth {selectedSpan.depth})
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-gray-950/60 p-2.5 rounded-lg border border-gray-800">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Duration</span>
                    <div className="text-amber-300 font-bold">{selectedSpan.duration_ms} ms</div>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Offset</span>
                    <div className="text-gray-300">+{selectedSpan.relative_offset_ms} ms</div>
                  </div>
                </div>

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Critical Path</span>
                  <div className="mt-0.5">
                    {selectedSpan.is_critical_path ? (
                      <span className="text-amber-400 flex items-center gap-1 font-semibold">
                        ⚡ Yes (Latency Bottleneck)
                      </span>
                    ) : (
                      <span className="text-gray-400">Non-critical / Concurrent</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Span IDs</span>
                  <div className="space-y-1 mt-1 text-[11px] text-gray-300">
                    <div>
                      <span className="text-gray-500">Span:</span> {selectedSpan.span_id}
                    </div>
                    <div>
                      <span className="text-gray-500">Parent:</span>{" "}
                      {selectedSpan.parent_span_id || "None (Root)"}
                    </div>
                  </div>
                </div>

                {/* Tags Table */}
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase mb-1.5">
                    Metadata & Tags
                  </span>
                  <div className="space-y-1 bg-gray-950/90 rounded-lg p-2.5 border border-gray-800 max-h-48 overflow-y-auto">
                    {Object.entries(selectedSpan.tags).length === 0 ? (
                      <span className="text-gray-500">No tags recorded</span>
                    ) : (
                      Object.entries(selectedSpan.tags).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2 text-[11px]">
                          <span className="text-cyan-400/90">{k}:</span>
                          <span className="text-gray-200 text-right font-medium truncate max-w-[140px]">
                            {String(v)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* W3C Header Copy */}
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase mb-1">
                    W3C Traceparent
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={selectedSpan.traceparent}
                      className="w-full text-[10px] font-mono bg-gray-950 text-gray-300 p-1.5 rounded border border-gray-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedSpan.traceparent, "span_tp")}
                      className="px-2 py-1 text-[10px] rounded bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-gray-700 shrink-0"
                    >
                      {copyStatus === "span_tp" ? "✓" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic py-8 text-center">
                Select a span row to inspect attributes.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center bg-gray-900/50 rounded-xl border border-gray-800 text-gray-400 text-xs">
          No trace data available. Click &quot;Inject Multi-Hop Trace&quot; above to simulate a transaction.
        </div>
      )}
    </div>
  );
}
