"use client";

import React, { useState } from "react";
import type { DocumentSearchResponse, DocumentSearchResultItem } from "@/types/api";

const PRESET_QUERIES = [
  "Gross margin and subscription revenue",
  "Item 1A Risk Factors and litigation",
  "Capital expenditures and datacenter buildout",
  "Supply chain disruptions and component sourcing",
  "Regulatory scrutiny and antitrust investigations",
];

const DEFAULT_TICKERS = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMD", "META"];

export const DocumentSearchPanel: React.FC<{ initialTicker?: string }> = ({
  initialTicker = "AAPL",
}) => {
  const [ticker, setTicker] = useState<string>(initialTicker.toUpperCase());
  const [query, setQuery] = useState<string>("");
  const [topK, setTopK] = useState<number>(5);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<DocumentSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;

    if (overrideQuery) setQuery(overrideQuery);

    setIsSearching(true);
    setError(null);

    try {
      const url = new URL("/api/documents/search", window.location.origin);
      url.searchParams.set("ticker", ticker);
      url.searchParams.set("query", q);
      url.searchParams.set("top_k", topK.toString());

      const res = await fetch(url.toString());
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Search failed with status ${res.status}`);
      }

      const data: DocumentSearchResponse = await res.json();
      setSearchResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search query failed");
    } finally {
      setIsSearching(false);
    }
  };

  const highlightQuery = (text: string, q: string) => {
    if (!q.trim()) return text;
    const words = q.trim().split(/\s+/).filter((w: string) => w.length > 2);
    if (!words.length) return text;
    const regex = new RegExp(`(${words.join("|")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part: string, i: number) =>
      regex.test(part) ? (
        <span key={i} className="bg-amber-500/20 text-amber-300 font-semibold px-0.5 rounded">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-2xl text-slate-200 font-sans space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
          <div>
            <h3 className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono">
              Semantic Cosine & Vector Search Engine
            </h3>
            <span className="text-[11px] text-slate-500 block">
              1536-dimensional L2 cosine ranking with hybrid lexical overlap scoring.
            </span>
          </div>
        </div>

        {/* Ticker Selector & Top-K */}
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

          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-[10px] text-slate-500">Top-K:</span>
            <input
              type="range"
              min="1"
              max="10"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-16 h-1 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
            />
            <span className="font-bold text-indigo-400">{topK}</span>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${ticker} SEC filings, 10-K risk factors, footnotes...`}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSearching ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Searching...
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Query Corpus
              </>
            )}
          </button>
        </form>

        {/* Quick Query Suggestions */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] text-slate-500 uppercase font-mono self-center mr-1">
            Quick Queries:
          </span>
          {PRESET_QUERIES.map((pq, idx) => (
            <button
              key={idx}
              onClick={() => handleSearch(pq)}
              className="text-[11px] bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/60 rounded px-2 py-0.5 transition-colors"
            >
              {pq}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* Search Results Display */}
      {searchResults && (
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Found <span className="font-mono font-bold text-slate-200">{searchResults.total_results}</span> ranked
              matches for &ldquo;<span className="text-cyan-300">{searchResults.query}</span>&rdquo;
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              Trace: {searchResults.trace_id.slice(0, 8)}...
            </span>
          </div>

          {searchResults.results.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
              No matching chunks found above threshold. Ingest or embed more filings for {ticker}.
            </div>
          ) : (
            <div className="space-y-2.5">
              {searchResults.results.map((hit: DocumentSearchResultItem) => {
                const isExpanded = expandedChunkId === hit.chunk_id;
                const scorePct = Math.round(hit.similarity_score * 100);

                return (
                  <div
                    key={hit.chunk_id}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-mono font-bold border ${
                            scorePct >= 70
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : scorePct >= 40
                              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                              : "bg-slate-800 border-slate-700 text-slate-400"
                          }`}
                        >
                          {scorePct}% match
                        </span>

                        <span className="rounded bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[11px] font-mono text-indigo-300">
                          {hit.doc_type}
                        </span>

                        <span className="text-[11px] font-mono text-slate-400">
                          {hit.source_file} : P.{hit.page_number}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                        <span>Tokens: {hit.token_count}</span>
                        <span>Vector: {(hit.vector_similarity * 100).toFixed(1)}%</span>
                        <span>Lexical: {(hit.lexical_overlap * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* Excerpt */}
                    <div
                      onClick={() => setExpandedChunkId(isExpanded ? null : hit.chunk_id)}
                      className="cursor-pointer text-xs text-slate-300 font-sans leading-relaxed bg-slate-900/60 p-2.5 rounded border border-slate-800/80 hover:bg-slate-900/90"
                    >
                      <p className={isExpanded ? "" : "line-clamp-3"}>
                        {highlightQuery(hit.content, searchResults.query)}
                      </p>
                      <span className="text-[10px] font-mono text-indigo-400 block mt-1">
                        {isExpanded ? "▲ Collapse passage" : "▼ Click to expand full passage"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
