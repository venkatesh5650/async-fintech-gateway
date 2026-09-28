"use client";

import React, { useState } from "react";
import type { CitationItem } from "@/types/api";

interface CitationPanelProps {
  citations: CitationItem[];
  ticker: string;
}

export const CitationPanel: React.FC<CitationPanelProps> = ({ citations, ticker }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!citations || citations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500 font-mono">
        No qualitative document citations available for {ticker}.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3 font-sans">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/10 text-purple-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Qualitative SEC Citations (RAG)
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">
              Grounding sources for {ticker} multi-agent synthesis
            </span>
          </div>
        </div>

        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-mono font-bold text-purple-300 border border-purple-500/20">
          {citations.length} Sources Cited
        </span>
      </div>

      <div className="space-y-2">
        {citations.map((c, idx) => {
          const isExpanded = expandedIndex === idx;
          const scorePct = Math.round(c.similarity_score * 100);

          return (
            <div
              key={idx}
              className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-xs hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30 text-[11px]">
                    {c.citation_ref}
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {c.source_file} (Page {c.page_number})
                  </span>
                </div>

                <span className="font-mono text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                  {scorePct}% match
                </span>
              </div>

              <div
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                className="cursor-pointer bg-slate-900/50 p-2 rounded text-slate-300 text-[11px] leading-relaxed border border-slate-800/60"
              >
                <p className={isExpanded ? "" : "line-clamp-2"}>
                  &ldquo;{c.excerpt}&rdquo;
                </p>
                <span className="text-[9px] font-mono text-purple-400 block mt-1">
                  {isExpanded ? "▲ Collapse excerpt" : "▼ Read passage"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
