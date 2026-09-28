"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { RAGContextResponse } from "@/types/api";
import { CitationPanel } from "./CitationPanel";

const DEFAULT_TICKERS = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMD", "META"];

export const RAGContextViewer: React.FC<{ initialTicker?: string }> = ({
  initialTicker = "AAPL",
}) => {
  const [ticker, setTicker] = useState<string>(initialTicker.toUpperCase());
  const [data, setData] = useState<RAGContextResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRAGContext = useCallback(async (sym: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intelligence/rag-context/${encodeURIComponent(sym)}`);
      if (!res.ok) {
        throw new Error(`Failed to load RAG context (${res.status})`);
      }
      const json: RAGContextResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching RAG context");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRAGContext(ticker);
  }, [ticker, fetchRAGContext]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-2xl text-slate-200 font-sans space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
          <div>
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono">
              LangGraph RAG Context & Qualitative Signal Fusion
            </h3>
            <span className="text-[11px] text-slate-500 block">
              Multi-agent state machine context injection with canonical SEC citations.
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="bg-slate-950 border border-slate-700 text-cyan-300 font-bold px-3 py-1.5 rounded focus:outline-none focus:border-cyan-500"
          >
            {DEFAULT_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            onClick={() => fetchRAGContext(ticker)}
            disabled={isLoading}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* State Machine Status Banner */}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-mono">LangGraph Injection Status:</span>
            <span
              className={`rounded px-2.5 py-0.5 font-mono font-bold border ${
                data.rag_injected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}
            >
              {data.rag_injected ? "✓ INJECTED INTO AGENT STATE" : "⚠️ DEGRADED (NO FILINGS)"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
            <span>Citations: {data.total_citations}</span>
            <span>Trace: {data.trace_id ? `${data.trace_id.slice(0, 8)}...` : "N/A"}</span>
          </div>
        </div>
      )}

      {/* Citation Component */}
      {data && <CitationPanel citations={data.citations} ticker={ticker} />}
    </div>
  );
};
