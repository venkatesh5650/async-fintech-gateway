"use client";

import { useEffect, useState } from "react";
import { TraceWaterfallResponse, TraceSpanEntry } from "@/types/api";

interface TraceWaterfallModalProps {
  traceId: string | null;
  onClose: () => void;
}

const STAGE_LABELS: Record<string, { label: string; description: string }> = {
  INGEST_AND_STREAM_ENQUEUE: {
    label: "Ingest & Enqueue",
    description: "API boundary validation and Redis Stream XADD",
  },
  STREAM_QUEUE_WAIT: {
    label: "Stream Queue Wait",
    description: "Pending PEL dwell time awaiting worker consumer group claim",
  },
  WORKER_MULTI_AGENT_EXECUTION: {
    label: "Multi-Agent Graph",
    description: "LangGraph deterministic consensus & market data processing",
  },
  BROADCAST_AND_PERSIST: {
    label: "Broadcast & Persist",
    description: "PostgreSQL persistence and real-time WebSocket fanout",
  },
};

export default function TraceWaterfallModal({
  traceId,
  onClose,
}: TraceWaterfallModalProps) {
  const [data, setData] = useState<TraceWaterfallResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!traceId) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch(`/api/trace/${traceId}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json: TraceWaterfallResponse) => {
        if (isMounted) setData(json);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Failed to load trace");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [traceId]);

  useEffect(() => {
    if (!traceId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [traceId, onClose]);

  if (!traceId) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(traceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalJourney = data?.total_journey_ms || 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0a0a0a] border border-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/70">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            <span className="text-white text-sm font-bold tracking-wider uppercase">
              Distributed Trace Waterfall
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-gray-500 hover:text-gray-200 transition-colors text-sm px-2 py-1 rounded hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-left">
          {/* Metadata Card */}
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                  Trace ID
                </span>
                <span className="text-xs text-blue-400 font-mono select-all">
                  {traceId}
                </span>
                <button
                  onClick={handleCopy}
                  className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {data && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                    Journey Latency
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    {data.total_journey_ms.toFixed(2)}ms
                  </span>
                </div>
              )}
            </div>

            {data && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-gray-900 text-xs">
                <div>
                  <span className="text-[9px] text-gray-600 uppercase block">
                    Target Equity
                  </span>
                  <span className="text-white font-bold">{data.ticker}</span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-600 uppercase block">
                    Job UUID
                  </span>
                  <span className="text-gray-400 text-[11px] truncate block" title={data.job_id}>
                    {data.job_id.slice(0, 12)}…
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-600 uppercase block">
                    Execution State
                  </span>
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
              </div>
            )}
          </div>

          {/* Execution Waterfall Graph */}
          {isLoading ? (
            <div className="py-12 text-center text-xs text-gray-600 tracking-widest uppercase">
              Traversing distributed spans...
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs space-y-2">
              <div className="font-bold flex items-center gap-2">
                <span>⚠</span>
                <span>Trace Telemetry Expired or Unavailable</span>
              </div>
              <p className="text-gray-400 leading-relaxed text-[11px]">
                {error.includes("404")
                  ? "Span logs have expired from the transient 1-hour Redis cache. As seen on the DLQ table, this job was quarantined 142+ hours ago. Full 4-stage waterfall charts render automatically for newly dispatched jobs."
                  : error}
              </p>
            </div>
          ) : data?.spans && data.spans.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[10px] text-gray-600 uppercase tracking-wider">
                <span>Span Lifecycle Stages</span>
                <span>Relative Execution Latency</span>
              </div>

              <div className="space-y-3">
                {data.spans.map((span: TraceSpanEntry, index: number) => {
                  const info = STAGE_LABELS[span.stage] || {
                    label: span.stage,
                    description: "Telemetry stage",
                  };
                  const duration = span.duration_ms ?? 0;
                  const percent = Math.min(100, Math.max(8, (duration / totalJourney) * 100));

                  const isFailed = span.status === "FAILED" || span.status === "QUARANTINED";

                  return (
                    <div
                      key={span.span_id || index}
                      className="p-3 bg-gray-950/60 border border-gray-800/80 rounded-lg space-y-2 hover:border-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-white font-bold tracking-wide">
                            {info.label}
                          </span>
                          <span className="text-[10px] text-gray-500 block">
                            {info.description}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono text-gray-300">
                            {duration.toFixed(2)}ms
                          </span>
                          <span
                            className={`text-[9px] uppercase font-bold ml-2 px-1.5 py-0.5 rounded ${
                              isFailed
                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {span.status}
                          </span>
                        </div>
                      </div>

                      {/* Relative Latency Sparkline Bar */}
                      <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isFailed
                              ? "bg-gradient-to-r from-red-600 to-amber-500"
                              : "bg-gradient-to-r from-blue-500 to-emerald-400"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      {span.span_id && (
                        <div className="text-[9px] text-gray-600">
                          span_id: <span className="font-mono text-gray-500">{span.span_id}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-gray-600">
              No span telemetry available for this trace correlation key.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950/40 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
