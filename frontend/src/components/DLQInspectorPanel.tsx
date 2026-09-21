"use client";

import { useEffect, useState, useCallback } from "react";
import { DeadLetterJobEntry, DeadLetterRegistryResponse } from "@/types/api";

const POLL_INTERVAL_MS = 5000;
const REFRESH_TICK_MS = 1000;

interface DLQInspectorPanelProps {
  onSelectTrace?: (traceId: string) => void;
}

export default function DLQInspectorPanel({
  onSelectTrace,
}: DLQInspectorPanelProps) {
  const [data, setData] = useState<DeadLetterRegistryResponse>({
    total_quarantined: 0,
    entries: [],
    audit_timestamp_ms: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [filterTicker, setFilterTicker] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<DeadLetterJobEntry | null>(
    null
  );
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const [mounted, setMounted] = useState(false);

  const fetchDLQ = useCallback(async () => {
    try {
      const res = await fetch("/api/dlq?count=50", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json: DeadLetterRegistryResponse = await res.json();
      setData(json);
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
    fetchDLQ();
    const interval = setInterval(fetchDLQ, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDLQ]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : POLL_INTERVAL_MS / 1000));
    }, REFRESH_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const filteredEntries = data.entries.filter((e) =>
    filterTicker ? e.ticker.toLowerCase().includes(filterTicker.toLowerCase()) : true
  );

  const formatRelativeTime = (timestamp: number) => {
    const deltaSec = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    const min = Math.floor(deltaSec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  };

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left shadow-2xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 mb-6 gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              data.total_quarantined > 0
                ? "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white text-sm font-bold tracking-wider uppercase">
                Dead-Letter Queue Inspector
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  data.total_quarantined > 0
                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                }`}
              >
                {data.total_quarantined > 0
                  ? `${data.total_quarantined} Quarantined`
                  : "Stream Pure"}
              </span>
            </div>
            <span className="text-gray-500 text-xs block mt-0.5">
              stream:intel_jobs:dlq • Poison pill isolation & diagnostics
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <input
            type="text"
            placeholder="Filter ticker..."
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
            className="px-3 py-1 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors w-32"
          />
          <button
            onClick={fetchDLQ}
            className="px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white rounded text-xs transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Observability Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Quarantined Total
          </span>
          <span
            className={`text-lg font-bold font-mono ${
              data.total_quarantined > 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {data.total_quarantined}
          </span>
        </div>
        <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Retry Ceiling
          </span>
          <span className="text-lg font-bold font-mono text-gray-200">
            3 Attempts
          </span>
        </div>
        <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Poison Pill Policy
          </span>
          <span className="text-xs font-bold font-mono text-blue-400 block mt-1">
            Auto-Quarantine
          </span>
        </div>
        <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Auto-Scan Tick
          </span>
          <span className="text-lg font-bold font-mono text-gray-400 tabular-nums">
            {countdown}s
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {isError && (
        <div className="mb-4 text-xs text-red-400/90 border border-red-500/20 bg-red-500/5 px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>⚠ Dead-Letter Queue registry service unreachable.</span>
          <button
            onClick={fetchDLQ}
            className="underline hover:text-white transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Table or Empty State */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-gray-600 tracking-widest uppercase">
          Scanning Dead-Letter Queue stream...
        </div>
      ) : data.entries.length === 0 ? (
        <div className="p-8 text-center bg-gray-950/40 border border-gray-900 rounded-xl space-y-2">
          <div className="text-2xl">🛡️</div>
          <div className="text-white text-sm font-bold">
            Zero Quarantined Poison Pills
          </div>
          <p className="text-gray-500 text-xs max-w-md mx-auto leading-relaxed">
            All consumer workers are operating within nominal delivery thresholds. No toxic or unparseable payloads detected in the Redis Stream.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-[9px] text-gray-600 uppercase tracking-widest border-b border-gray-800">
                <th className="text-left pb-2 pr-3 font-normal">Ticker</th>
                <th className="text-left pb-2 pr-3 font-normal">Job UUID</th>
                <th className="text-left pb-2 pr-3 font-normal">Retries</th>
                <th className="text-left pb-2 pr-3 font-normal">Root Cause</th>
                <th className="text-left pb-2 pr-3 font-normal">Trace Waterfall</th>
                <th className="text-right pb-2 font-normal">Quarantined</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr
                  key={entry.dlq_id}
                  className="border-b border-gray-900/80 hover:bg-gray-900/30 transition-colors"
                >
                  {/* Ticker */}
                  <td className="py-3 pr-3 text-white font-bold tracking-wider">
                    <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700">
                      {entry.ticker}
                    </span>
                  </td>

                  {/* Job ID */}
                  <td className="py-3 pr-3 text-gray-400 font-mono">
                    <span
                      title={`Click to copy: ${entry.job_id}`}
                      className="cursor-pointer hover:text-white transition-colors"
                      onClick={() => navigator.clipboard.writeText(entry.job_id)}
                    >
                      {entry.job_id.slice(0, 8)}…
                    </span>
                  </td>

                  {/* Attempts */}
                  <td className="py-3 pr-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/30">
                      {entry.delivery_count} / 3 EXCEEDED
                    </span>
                  </td>

                  {/* Root Cause Error */}
                  <td className="py-3 pr-3">
                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="text-left max-w-xs truncate block text-gray-400 hover:text-amber-300 transition-colors underline decoration-dotted"
                      title={entry.error_reason}
                    >
                      {entry.error_reason}
                    </button>
                  </td>

                  {/* Trace Waterfall Link */}
                  <td className="py-3 pr-3">
                    {entry.trace_id ? (
                      <button
                        onClick={() => {
                          if (onSelectTrace && entry.trace_id) {
                            onSelectTrace(entry.trace_id);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors"
                        title="Open Distributed Trace Waterfall"
                      >
                        <span>⤢</span>
                        <span>{entry.trace_id.slice(0, 8)}…</span>
                      </button>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  {/* Quarantined Timestamp */}
                  <td
                    className="py-3 text-right text-gray-500 text-[11px]"
                    title={
                      mounted
                        ? new Date(entry.quarantined_at * 1000).toLocaleString()
                        : ""
                    }
                  >
                    {formatRelativeTime(entry.quarantined_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Diagnostics Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
          <div
            className="w-full max-w-xl bg-[#0a0a0a] border border-gray-800 rounded-xl shadow-2xl overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950">
              <div className="flex items-center gap-2">
                <span className="text-red-400">☠️</span>
                <span className="text-white text-sm font-bold tracking-wider">
                  Poison Pill Diagnostic Inspector
                </span>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-gray-500 hover:text-gray-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-gray-950 p-3 rounded border border-gray-900">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase block">
                    DLQ Stream ID
                  </span>
                  <span className="text-gray-300 font-mono text-[11px]">
                    {selectedEntry.dlq_id}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 uppercase block">
                    Original Stream ID
                  </span>
                  <span className="text-gray-300 font-mono text-[11px]">
                    {selectedEntry.original_message_id || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 uppercase block">
                    Job ID
                  </span>
                  <span className="text-gray-300 font-mono text-[11px] select-all">
                    {selectedEntry.job_id}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 uppercase block">
                    Target Equity
                  </span>
                  <span className="text-emerald-400 font-bold">
                    {selectedEntry.ticker}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-gray-500 uppercase block mb-1">
                  Root Cause Diagnostic Payload
                </span>
                <pre className="p-4 bg-black border border-gray-800 rounded-lg text-red-400 text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">
                  {selectedEntry.error_reason}
                </pre>
              </div>

              {selectedEntry.trace_id && (
                <div className="pt-2 flex items-center justify-between border-t border-gray-900">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 uppercase">
                      Trace:
                    </span>
                    <span className="text-blue-400 font-mono text-[11px]">
                      {selectedEntry.trace_id}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const tId = selectedEntry.trace_id!;
                      setSelectedEntry(null);
                      if (onSelectTrace) onSelectTrace(tId);
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs transition"
                  >
                    View Span Waterfall →
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-800 bg-gray-950 flex justify-end">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
