"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { CacheInspectorResponse } from "@/types/api";

const DEFAULT_WATCHLIST = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL"];

interface CacheInspectorPanelProps {
  onSelectTrace?: (traceId: string) => void;
  initialTicker?: string;
}

export default function CacheInspectorPanel({
  onSelectTrace,
  initialTicker = "AAPL",
}: CacheInspectorPanelProps) {
  const [selectedTicker, setSelectedTicker] = useState<string>(initialTicker.toUpperCase());
  const [inputTicker, setInputTicker] = useState<string>("");
  const [data, setData] = useState<CacheInspectorResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEvicting, setIsEvicting] = useState<boolean>(false);
  const [evictMessage, setEvictMessage] = useState<string | null>(null);
  const [isPayloadOpen, setIsPayloadOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [localTtl, setLocalTtl] = useState<number>(0);

  const localTtlRef = useRef<number>(0);
  localTtlRef.current = localTtl;

  const fetchInspector = useCallback(async (ticker: string) => {
    setIsLoading(true);
    setEvictMessage(null);
    try {
      const res = await fetch(`/api/cache-inspector/${ticker}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json: CacheInspectorResponse = await res.json();
      setData(json);
      setLocalTtl(json.ttl_remaining_seconds);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInspector(selectedTicker);
  }, [selectedTicker, fetchInspector]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalTtl((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectTicker = (ticker: string) => {
    const clean = ticker.toUpperCase().trim();
    if (clean && clean !== selectedTicker) {
      setSelectedTicker(clean);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputTicker.toUpperCase().trim();
    if (clean && /^[A-Z]{1,5}$/.test(clean)) {
      setSelectedTicker(clean);
      setInputTicker("");
    }
  };

  const handleEvict = async () => {
    if (!selectedTicker) return;
    setIsEvicting(true);
    setEvictMessage(null);
    try {
      const res = await fetch(`/api/cache-invalidate/${selectedTicker}`, {
        method: "POST",
      });
      const resJson = await res.json().catch(() => ({}));
      if (res.ok) {
        setEvictMessage(`Key for ${selectedTicker} purged successfully.`);
        fetchInspector(selectedTicker);
      } else {
        setEvictMessage(resJson.error || `Eviction failed: ${res.status}`);
      }
    } catch {
      setEvictMessage("Network error during cache eviction.");
    } finally {
      setIsEvicting(false);
    }
  };

  const handleCopyPayload = () => {
    if (data?.raw_payload_preview) {
      navigator.clipboard.writeText(JSON.stringify(data.raw_payload_preview, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const ttlPercent = data && data.ttl_total_seconds > 0
    ? Math.min(100, Math.max(0, (localTtl / data.ttl_total_seconds) * 100))
    : 0;

  const getTtlColor = (ttl: number) => {
    if (ttl > 120) return "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]";
    if (ttl > 30) return "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.7)]";
    return "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.7)]";
  };

  const getOriginBadge = (origin?: string | null) => {
    if (!origin) return null;
    const clean = origin.toUpperCase();
    if (clean === "WRITE_THROUGH") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          ⚡ WRITE_THROUGH
        </span>
      );
    }
    if (clean === "MUTEX_WAIT") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          🔒 MUTEX_WAIT
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        📥 {clean}
      </span>
    );
  };

  return (
    <div className="bg-[#0b0f19] border border-gray-800/80 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-6">
      {/* Header & Watchlist Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <h2 className="text-sm font-mono font-bold tracking-wider uppercase text-gray-200">
              Distributed Cache Inspector & Key Lifecycle
            </h2>
          </div>
          <p className="text-xs text-gray-500 font-mono mt-1">
            Granular per-ticker memory footprint, live TTL decay progression, and payload introspection.
          </p>
        </div>

        {/* Watchlist Quick Pills & Custom Input */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          <div className="flex items-center gap-1 bg-gray-900/90 border border-gray-800 rounded-lg p-1 flex-wrap">
            {DEFAULT_WATCHLIST.map((ticker) => (
              <button
                key={ticker}
                onClick={() => handleSelectTicker(ticker)}
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded transition-colors ${
                  selectedTicker === ticker
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {ticker}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={inputTicker}
              onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
              placeholder="SYM..."
              maxLength={5}
              className="w-20 px-2 py-1 bg-gray-900 border border-gray-800 rounded text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs font-mono font-semibold transition-colors"
            >
              Go
            </button>
          </form>
        </div>
      </div>

      {/* Main Inspection Canvas */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 font-mono text-sm">
          <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mr-3" />
          Scanning Redis keyspace for cache:intel:{selectedTicker}...
        </div>
      ) : !data ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center text-xs font-mono text-red-400">
          Failed to query cache inspector for {selectedTicker}. Redis cluster may be unreachable.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Key State Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/60 border border-gray-800/80 rounded-xl p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">REDIS KEY:</span>
                <span className="text-sm font-mono font-bold text-white tracking-wide break-all">
                  cache:intel:{data.ticker}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                {data.is_cached ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    HOT IN-MEMORY CACHE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                    COLD / NOT CACHED
                  </span>
                )}
                {getOriginBadge(data.prime_origin)}
              </div>
            </div>

            {/* Invalidation & Refresh Action Cluster */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => fetchInspector(selectedTicker)}
                disabled={isLoading || isEvicting}
                className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-xs font-mono text-gray-300 transition-colors flex items-center gap-1.5"
              >
                <span>↻ Refresh</span>
              </button>
              {data.is_cached && (
                <button
                  onClick={handleEvict}
                  disabled={isEvicting}
                  className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-mono font-semibold text-rose-400 transition-colors flex items-center gap-1.5"
                >
                  {isEvicting ? (
                    <>
                      <span className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                      <span>Evicting...</span>
                    </>
                  ) : (
                    <>
                      <span>✕ Evict from Cache</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {evictMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 text-xs font-mono text-emerald-400">
              {evictMessage}
            </div>
          )}

          {/* Granular Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* TTL Decay Gauge */}
            <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-4 space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                  Remaining TTL Decay
                </span>
                <span className="text-xs font-mono font-bold text-white tabular-nums">
                  {localTtl}s / {data.ttl_total_seconds}s ({ttlPercent.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ease-linear rounded-full ${getTtlColor(
                    localTtl
                  )}`}
                  style={{ width: `${ttlPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
                <span>0s (Expired / Cold)</span>
                <span>Max TTL: {data.ttl_total_seconds}s</span>
              </div>
            </div>

            {/* Memory Size Footprint */}
            <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-4 space-y-2 flex flex-col justify-center">
              <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                Memory Footprint
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                  {data.payload_size_bytes.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-gray-500">bytes</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {(data.payload_size_bytes / 1024).toFixed(2)} KB allocated in Redis RAM
              </span>
            </div>
          </div>

          {/* Trace Correlation & Metadata Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Trace ID Lineage Card */}
            <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-4 space-y-2">
              <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                Execution Trace Lineage
              </span>
              {data.trace_id ? (
                <div className="space-y-1">
                  <div className="text-xs font-mono text-purple-300 break-all bg-purple-950/20 border border-purple-800/30 p-2 rounded">
                    {data.trace_id}
                  </div>
                  {onSelectTrace && (
                    <button
                      onClick={() => onSelectTrace(data.trace_id!)}
                      className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 pt-1 transition-colors"
                    >
                      <span>🔗 Launch Distributed Trace Waterfall</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs font-mono text-gray-500 italic">
                  No trace correlation linked to this cache entry.
                </div>
              )}
            </div>

            {/* Priming Timestamp */}
            <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-4 space-y-2">
              <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                Priming Timestamp
              </span>
              <div className="text-xs font-mono text-gray-300">
                {data.primed_at_iso
                  ? new Date(data.primed_at_iso).toLocaleString()
                  : "Not available (Cold state)"}
              </div>
              <div className="text-[10px] text-gray-500 font-mono">
                Server snapshot: {new Date(data.server_timestamp_ms).toLocaleTimeString()}
              </div>
            </div>
          </div>

          {/* Raw Payload Preview Accordion */}
          {data.is_cached && data.raw_payload_preview && (
            <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950/40">
              <button
                onClick={() => setIsPayloadOpen(!isPayloadOpen)}
                className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-4 py-3 bg-gray-900/60 hover:bg-gray-900 text-xs font-mono font-semibold text-gray-300 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span>{isPayloadOpen ? "▼" : "▶"}</span>
                  <span>Inspect Raw Cached JSON Payload</span>
                  <span className="text-gray-500 font-normal">
                    ({Object.keys(data.raw_payload_preview).length} fields)
                  </span>
                </div>
                <span className="text-[10px] text-gray-500">
                  {isPayloadOpen ? "Click to collapse" : "Click to expand"}
                </span>
              </button>

              {isPayloadOpen && (
                <div className="p-4 border-t border-gray-800 space-y-2">
                  <div className="flex justify-end">
                    <button
                      onClick={handleCopyPayload}
                      className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px] font-mono transition-colors"
                    >
                      {copied ? "✓ Copied" : "Copy JSON"}
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-emerald-400/90 bg-black/60 p-4 rounded-lg overflow-x-auto max-h-72 leading-relaxed border border-gray-800">
                    {JSON.stringify(data.raw_payload_preview, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
