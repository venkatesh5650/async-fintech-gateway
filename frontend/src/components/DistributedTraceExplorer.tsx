"use client";

import { useEffect, useState, useCallback } from "react";
import { TraceWaterfallResponse, TraceSpanEntry } from "@/types/api";

interface DistributedTraceExplorerProps {
  initialTraceId?: string;
}

const STAGE_METADATA: Record<
  string,
  { label: string; description: string; color: string; bgGradient: string }
> = {
  INGEST_AND_STREAM_ENQUEUE: {
    label: "Ingest & Enqueue",
    description: "API boundary authentication, schema validation, and Redis XADD enqueue",
    color: "text-sky-400",
    bgGradient: "from-sky-500 to-blue-600",
  },
  STREAM_QUEUE_WAIT: {
    label: "Stream Queue Wait",
    description: "Dwell time in Redis Stream PEL awaiting consumer worker allocation",
    color: "text-amber-400",
    bgGradient: "from-amber-500 to-orange-600",
  },
  WORKER_MULTI_AGENT_EXECUTION: {
    label: "Multi-Agent Graph",
    description: "LangGraph asynchronous state machine and quantitative model inference",
    color: "text-purple-400",
    bgGradient: "from-purple-500 to-indigo-600",
  },
  BROADCAST_AND_PERSIST: {
    label: "Broadcast & Persist",
    description: "PostgreSQL relational commit and real-time WebSocket subscriber fanout",
    color: "text-emerald-400",
    bgGradient: "from-emerald-500 to-teal-600",
  },
  POISON_PILL_DLQ_QUARANTINE: {
    label: "DLQ Poison Pill Quarantine",
    description: "Max retry limit exhausted; message isolated in dead-letter stream",
    color: "text-red-400",
    bgGradient: "from-red-600 to-rose-700",
  },
};

export default function DistributedTraceExplorer({
  initialTraceId,
}: DistributedTraceExplorerProps) {
  const [searchInput, setSearchInput] = useState<string>(initialTraceId || "");
  const [activeTraceId, setActiveTraceId] = useState<string | null>(initialTraceId || null);
  const [data, setData] = useState<TraceWaterfallResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (initialTraceId && !activeTraceId) {
      setSearchInput(initialTraceId);
      setActiveTraceId(initialTraceId);
    }
  }, [initialTraceId, activeTraceId]);

  const fetchTrace = useCallback(async (targetId: string) => {
    if (!targetId.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/trace/${encodeURIComponent(targetId.trim())}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Trace lookup returned HTTP ${res.status}`);
      }
      const json: TraceWaterfallResponse = await res.json();
      setData(json);
      setActiveTraceId(targetId.trim());
    } catch (err: any) {
      setError(err.message || "Failed to retrieve distributed trace.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTraceId) {
      fetchTrace(activeTraceId);
    }
  }, [activeTraceId, fetchTrace]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      fetchTrace(searchInput.trim());
    }
  };

  const handleCopy = () => {
    if (!activeTraceId) return;
    navigator.clipboard.writeText(activeTraceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalJourney = data?.total_journey_ms || 1;

  // Compute breakdown percentages
  const queueWaitMs =
    data?.spans.find((s) => s.stage === "STREAM_QUEUE_WAIT")?.duration_ms || 0;
  const executionMs =
    data?.spans.find((s) => s.stage === "WORKER_MULTI_AGENT_EXECUTION")?.duration_ms || 0;
  const queueRatio = totalJourney > 0 ? (queueWaitMs / totalJourney) * 100 : 0;
  const computeRatio = totalJourney > 0 ? (executionMs / totalJourney) * 100 : 0;

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left shadow-2xl space-y-6">
      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-gray-800 pb-4 gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search or paste trace UUID (e.g., trace-a1b2c3d4...)"
              className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !searchInput.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shrink-0"
          >
            {isLoading ? "Querying..." : "Analyze Trace"}
          </button>
        </form>

        {initialTraceId && initialTraceId !== activeTraceId && (
          <button
            onClick={() => {
              setSearchInput(initialTraceId);
              setActiveTraceId(initialTraceId);
            }}
            className="px-3 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white rounded-lg text-xs transition-colors shrink-0"
          >
            Load Current Job Trace
          </button>
        )}
      </div>

      {/* ── Trace Summary HUD ── */}
      {data && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                Correlation Key
              </span>
              <span className="text-xs text-blue-400 font-mono select-all">
                {data.trace_id}
              </span>
              <button
                onClick={handleCopy}
                className="text-[10px] px-2 py-0.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-400 border border-gray-800 transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                Total Latency
              </span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {data.total_journey_ms.toFixed(2)}ms
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-900 text-xs">
            <div>
              <span className="text-[9px] text-gray-600 uppercase block">Asset</span>
              <span className="text-white font-bold">{data.ticker || "UNKNOWN"}</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-600 uppercase block">Job UUID</span>
              <span className="text-gray-400 font-mono text-[11px] truncate block" title={data.job_id}>
                {data.job_id ? `${data.job_id.slice(0, 12)}…` : "—"}
              </span>
            </div>
            <div>
              <span className="text-[9px] text-gray-600 uppercase block">Lifecycle State</span>
              <span
                className={`text-[11px] font-bold ${
                  data.status === "completed"
                    ? "text-emerald-400"
                    : data.status === "dead_lettered" || data.status === "quarantined"
                    ? "text-red-400"
                    : "text-amber-400"
                }`}
              >
                {data.status.toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-[9px] text-gray-600 uppercase block">Total Spans</span>
              <span className="text-gray-300 font-bold">{data.spans.length} Recorded</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Latency Composition Strip ── */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
            <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
              Queue Wait Overhead
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-amber-400 tabular-nums">
                {queueWaitMs.toFixed(1)}ms
              </span>
              <span className="text-[10px] text-gray-600">({queueRatio.toFixed(0)}%)</span>
            </div>
          </div>

          <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
            <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
              AI Compute Latency
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-purple-400 tabular-nums">
                {executionMs.toFixed(1)}ms
              </span>
              <span className="text-[10px] text-gray-600">({computeRatio.toFixed(0)}%)</span>
            </div>
          </div>

          <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
            <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
              End-to-End Latency
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                {data.total_journey_ms.toFixed(1)}ms
              </span>
              <span className="text-[10px] text-gray-600">total</span>
            </div>
          </div>

          <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
            <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
              Dominant Bottleneck
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold font-mono text-gray-200">
                {queueRatio > 50 ? "Queue Backlog" : "LLM Inference"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Gantt Waterfall Chart ── */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-gray-600 tracking-widest uppercase">
          Traversing distributed spans across cluster...
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs space-y-2">
          <div className="font-bold flex items-center gap-2">
            <span>⚠</span>
            <span>Trace Context Expired or Not Found</span>
          </div>
          <p className="text-gray-400 leading-relaxed text-[11px]">
            {error.includes("404")
              ? "Span logs have expired from the transient 1-hour Redis cache or have not been ingested yet. Dispatched live jobs will automatically surface here."
              : error}
          </p>
        </div>
      ) : data?.spans && data.spans.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-wider">
            <span>Span Execution Lifecycle Stages</span>
            <span>Relative Proportion of Total Journey</span>
          </div>

          <div className="space-y-3">
            {data.spans.map((span: TraceSpanEntry, index: number) => {
              const meta = STAGE_METADATA[span.stage] || {
                label: span.stage,
                description: "Distributed telemetry span",
                color: "text-gray-300",
                bgGradient: "from-blue-600 to-indigo-600",
              };
              const duration = span.duration_ms ?? 0;
              const percent = Math.min(100, Math.max(6, (duration / totalJourney) * 100));
              const isFailed = span.status === "FAILED" || span.status === "QUARANTINED";

              return (
                <div
                  key={span.span_id || index}
                  className="p-4 bg-gray-950 border border-gray-800/90 rounded-lg space-y-2 hover:border-gray-700 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${meta.color}`}>{meta.label}</span>
                        {span.span_id && (
                          <span className="text-[10px] text-gray-600 font-mono">
                            ({span.span_id})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 block">
                        {meta.description}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="text-xs font-mono text-gray-300">
                        {duration.toFixed(2)}ms
                      </span>
                      <span
                        className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          isFailed
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {span.status}
                      </span>
                    </div>
                  </div>

                  {/* Relative Timeline Bar */}
                  <div className="w-full bg-gray-900 rounded-full h-2.5 overflow-hidden flex">
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                        isFailed ? "from-red-600 to-rose-700" : meta.bgGradient
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-gray-600">
          Enter a valid trace correlation key above or dispatch an analysis job to view the waterfall.
        </div>
      )}
    </div>
  );
}
