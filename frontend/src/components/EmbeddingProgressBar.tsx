"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { EmbeddingJobResponse, EmbeddingProgressResponse } from "@/types/api";

interface EmbeddingProgressBarProps {
  documentId: string;
  ticker: string;
  totalChunks: number;
  initialEmbedded?: number;
  onEmbeddingComplete?: () => void;
}

export const EmbeddingProgressBar: React.FC<EmbeddingProgressBarProps> = ({
  documentId,
  ticker,
  totalChunks,
  initialEmbedded = 0,
  onEmbeddingComplete,
}) => {
  const [status, setStatus] = useState<"IDLE" | "IN_PROGRESS" | "COMPLETED" | "FAILED">(
    initialEmbedded >= totalChunks && totalChunks > 0 ? "COMPLETED" : "IDLE"
  );
  const [embeddedCount, setEmbeddedCount] = useState<number>(initialEmbedded);
  const [percentage, setPercentage] = useState<number>(
    totalChunks > 0 ? Math.round((initialEmbedded / totalChunks) * 100) : 0
  );
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [polling, setPolling] = useState<boolean>(false);

  const pollProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/embed`);
      if (!res.ok) return;
      const data: EmbeddingProgressResponse = await res.json();
      setEmbeddedCount(data.embedded_chunks);
      setPercentage(data.percentage);
      if (data.status === "COMPLETED") {
        setStatus("COMPLETED");
        setPolling(false);
        onEmbeddingComplete?.();
      } else if (data.status === "FAILED") {
        setStatus("FAILED");
        setPolling(false);
      }
    } catch {
      // transient poll failure
    }
  }, [documentId, onEmbeddingComplete]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(pollProgress, 1200);
    return () => clearInterval(interval);
  }, [polling, pollProgress]);

  const handleTriggerEmbed = async () => {
    setStatus("IN_PROGRESS");
    setErrorMessage(null);
    setPolling(true);

    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/embed`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Embedding trigger failed");
      }

      const job: EmbeddingJobResponse = await res.json();
      setEmbeddedCount(job.chunks_embedded);
      setDurationMs(job.duration_ms);
      setPercentage(100);
      setStatus("COMPLETED");
      setPolling(false);
      onEmbeddingComplete?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Vector embedding failed");
      setStatus("FAILED");
      setPolling(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3 font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m16-6h2m-2 6h2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Vector Embedding Engine
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-cyan-400 border border-cyan-500/20">
                1536-dim L2
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              Target: {ticker} | Doc: {documentId}
            </p>
          </div>
        </div>

        {status === "IDLE" && (
          <button
            onClick={handleTriggerEmbed}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Embed Vectors
          </button>
        )}

        {status === "IN_PROGRESS" && (
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-indigo-400">
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Vectorizing...
          </div>
        )}

        {status === "COMPLETED" && (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-400 font-medium">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Vectorized
          </div>
        )}

        {status === "FAILED" && (
          <button
            onClick={handleTriggerEmbed}
            className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Retry
          </button>
        )}
      </div>

      {/* Progress Track */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">
            Chunks Embedded:{" "}
            <span className="font-mono text-slate-200">
              {embeddedCount} / {totalChunks}
            </span>
          </span>
          <span className="font-mono font-medium text-indigo-400">
            {percentage.toFixed(0)}%
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              status === "COMPLETED"
                ? "bg-gradient-to-r from-indigo-500 to-emerald-400"
                : status === "FAILED"
                ? "bg-rose-500"
                : "bg-gradient-to-r from-indigo-500 to-cyan-400"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>
      </div>

      {/* Latency & Status Footer */}
      {(durationMs !== null || errorMessage) && (
        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/60">
          {durationMs !== null && (
            <span className="text-slate-400">
              Embedding Latency: <span className="font-mono text-slate-300">{durationMs.toFixed(1)}ms</span>
            </span>
          )}
          {errorMessage && (
            <span className="text-rose-400 font-medium">{errorMessage}</span>
          )}
        </div>
      )}
    </div>
  );
};
