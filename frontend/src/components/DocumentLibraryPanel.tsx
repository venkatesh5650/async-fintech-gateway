"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { TickerDocumentMeta } from "@/types/api";

const TRACKED_TICKERS = ["ALL", "AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMD", "META"];

interface EdgarSyncFiling {
  ticker: string;
  document_id: string;
  doc_type: string;
  filename: string;
  chunks_generated: number;
  total_tokens: number;
  latency_ms: number;
  status: string;
}

interface EdgarSyncResponse {
  status: string;
  synced_count: number;
  total_chunks: number;
  total_tokens: number;
  filings: EdgarSyncFiling[];
  latency_ms: number;
  trace_id: string;
}

export const DocumentLibraryPanel: React.FC<{
  onNavigateToSearch?: (ticker: string) => void;
  onNavigateToRAG?: (ticker: string) => void;
}> = ({ onNavigateToSearch, onNavigateToRAG }) => {
  const [selectedTicker, setSelectedTicker] = useState<string>("ALL");
  const [documents, setDocuments] = useState<TickerDocumentMeta[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<EdgarSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const tickersToFetch =
      selectedTicker === "ALL"
        ? TRACKED_TICKERS.filter((t) => t !== "ALL")
        : [selectedTicker];

    try {
      const allDocs: TickerDocumentMeta[] = [];
      await Promise.all(
        tickersToFetch.map(async (sym) => {
          try {
            const res = await fetch(`/api/documents/${encodeURIComponent(sym)}`);
            if (res.ok) {
              const data = await res.json();
              if (data.documents && Array.isArray(data.documents)) {
                allDocs.push(...data.documents);
              }
            }
          } catch {
            // degrade gracefully for single ticker
          }
        })
      );
      setDocuments(allDocs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading document catalog");
    } finally {
      setIsLoading(false);
    }
  }, [selectedTicker]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleTriggerEdgarSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const formData = new FormData();
      if (selectedTicker !== "ALL") {
        formData.append("ticker", selectedTicker);
      }
      formData.append("doc_type", "10-K");

      const res = await fetch("/api/documents/edgar/sync", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Sync failed (${res.status})`);
      }

      const data: EdgarSyncResponse = await res.json();
      setSyncResult(data);
      fetchDocuments();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "SEC EDGAR sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-2xl text-slate-200 font-sans space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          <div>
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono">
              SEC EDGAR Repository & Autonomous Ingestion Library
            </h3>
            <span className="text-[11px] text-slate-500 block">
              Autonomous daemon surveillance of 10-K/10-Q filings with continuous vector indexing.
            </span>
          </div>
        </div>

        {/* Sync Button & Refresh */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDocuments}
            disabled={isLoading}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors font-mono"
          >
            ↻ Refresh
          </button>

          <button
            onClick={handleTriggerEdgarSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm font-mono"
          >
            {isSyncing ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Syncing EDGAR...
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                Poll EDGAR Daemon
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
        <span className="text-[10px] text-slate-500 uppercase mr-1">Filter:</span>
        {TRACKED_TICKERS.map((sym) => (
          <button
            key={sym}
            onClick={() => setSelectedTicker(sym)}
            className={`px-2.5 py-1 rounded font-bold transition-colors ${
              selectedTicker === sym
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {sym}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Sync Banner Notification */}
      {syncResult && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between font-mono">
            <span className="font-bold text-emerald-400">
              ✓ SEC EDGAR Ingestion Sync Complete
            </span>
            <span className="text-slate-400 text-[11px]">
              {syncResult.latency_ms.toFixed(1)}ms | Trace: {syncResult.trace_id.slice(0, 8)}...
            </span>
          </div>
          <p className="text-slate-300 text-[11px]">
            Synchronized {syncResult.synced_count} filings ({syncResult.total_chunks} chunks,{" "}
            {syncResult.total_tokens.toLocaleString()} tokens vectorized into PostgreSQL).
          </p>
        </div>
      )}

      {/* Document Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>
            Total Indexed Filings: <span className="font-bold text-slate-200">{documents.length}</span>
          </span>
          <span>Storage: PostgreSQL + pgvector 1536-dim</span>
        </div>

        {documents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
            No filings registered for {selectedTicker}. Click &ldquo;Poll EDGAR Daemon&rdquo; above to automatically fetch and index SEC filings.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {documents.map((doc, idx) => (
              <div
                key={doc.document_id || idx}
                className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30 text-xs">
                      {doc.ticker}
                    </span>
                    <span className="font-mono text-xs font-semibold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                      {doc.doc_type}
                    </span>
                  </div>

                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 font-medium">
                    ✓ Vectorized
                  </span>
                </div>

                <div className="text-xs text-slate-300 font-mono truncate" title={doc.filename}>
                  {doc.filename}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono bg-slate-900/50 p-2 rounded border border-slate-800/80">
                  <div>
                    <div className="text-slate-500 uppercase">Pages</div>
                    <div className="font-bold text-slate-200">{doc.total_pages}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase">Chunks</div>
                    <div className="font-bold text-indigo-300">{doc.total_chunks}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase">Tokens</div>
                    <div className="font-bold text-purple-300">{doc.total_tokens.toLocaleString()}</div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
                  {onNavigateToSearch && (
                    <button
                      onClick={() => onNavigateToSearch(doc.ticker)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
                    >
                      Search →
                    </button>
                  )}
                  {onNavigateToRAG && (
                    <button
                      onClick={() => onNavigateToRAG(doc.ticker)}
                      className="text-[11px] text-purple-400 hover:text-purple-300 font-mono transition-colors"
                    >
                      RAG Context →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
