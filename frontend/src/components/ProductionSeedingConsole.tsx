"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  SeedStatusReport,
  TickerSeedSummary,
  SeedExecutionResponse,
} from "../types/api";

export const ProductionSeedingConsole: React.FC = () => {
  const [report, setReport] = useState<SeedStatusReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<SeedExecutionResponse | null>(null);
  const [daysHistory, setDaysHistory] = useState<number>(90);
  const [activeTab, setActiveTab] = useState<"FLEET" | "STATUS" | "JSON">("FLEET");
  const [copied, setCopied] = useState<boolean>(false);

  const fetchSeedStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/cloud/seed/status");
      if (!res.ok) {
        throw new Error(`Seed status API returned HTTP ${res.status}`);
      }
      const data: SeedStatusReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load seed status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeedStatus();
  }, [fetchSeedStatus]);

  const triggerSeed = async (specificTicker?: string) => {
    try {
      setSeeding(true);
      setError(null);

      const payload = {
        tickers: specificTicker ? [specificTicker] : undefined,
        days_history: daysHistory,
        seed_rag_passages: true,
        force_refresh: true,
      };

      const res = await fetch("/api/cloud/seed/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Seeding execution failed with HTTP ${res.status}`);
      }

      const execData: SeedExecutionResponse = await res.json();
      setLastExecution(execData);
      await fetchSeedStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Execution failed.");
    } finally {
      setSeeding(false);
    }
  };

  const copyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 border border-slate-800 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌱</span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Production Database Migration & Institutional Seeding
              </h2>
              {report && (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    report.is_seeded
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                      : "bg-amber-950 text-amber-400 border border-amber-500/30"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      report.is_seeded ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                  {report.is_seeded ? "100% SEEDED" : "PARTIAL / EMPTY"}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Deterministic historical market candles (OHLCV), technical oscillators (RSI, Bollinger), and SEC EDGAR 10-K RAG vector passages.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
            <select
              value={daysHistory}
              onChange={(e) => setDaysHistory(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none"
            >
              <option value={30}>30 Days History</option>
              <option value={60}>60 Days History</option>
              <option value={90}>90 Days History</option>
            </select>

            <button
              onClick={() => triggerSeed()}
              disabled={seeding}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg disabled:opacity-50 flex items-center gap-2"
            >
              <span className={seeding ? "animate-spin" : ""}>⚡</span>
              {seeding ? "Seeding Fleets..." : "Seed All 10 Equities"}
            </button>

            <button
              onClick={() => fetchSeedStatus()}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              Refresh
            </button>

            <div className="border-l border-slate-800 pl-3 flex gap-1">
              <button
                onClick={() => setActiveTab("FLEET")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  activeTab === "FLEET"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Fleet Grid
              </button>
              <button
                onClick={() => setActiveTab("JSON")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  activeTab === "JSON"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Inspect JSON
              </button>
            </div>
          </div>
        </div>

        {report && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-2">
            <div>
              <span>System: </span>
              <span className="text-slate-200">{report.system_name}</span>
            </div>
            <div>
              <span>Benchmark Equities: </span>
              <span className="text-emerald-400 font-bold">{report.total_tickers} Tracked</span>
            </div>
            <div>
              <span>Trace ID: </span>
              <span className="text-cyan-400 font-semibold">{report.trace_id}</span>
            </div>
            <div>
              <span>Last Sampled: </span>
              <span className="text-slate-300">
                {new Date(report.timestamp_iso).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Execution Alert Banner */}
      {lastExecution && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🎉</span>
            <div>
              <span className="font-bold">Execution Succeeded ({lastExecution.run_id}): </span>
              <span>
                Processed {lastExecution.seeded_tickers_count} tickers (+{lastExecution.total_candles_inserted} candles, +{lastExecution.total_signals_inserted} signals, +{lastExecution.total_chunks_inserted} RAG passages) in {lastExecution.duration_ms}ms.
              </span>
            </div>
          </div>
          <button
            onClick={() => setLastExecution(null)}
            className="text-emerald-400 hover:text-emerald-200 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchSeedStatus()}
            className="text-xs bg-rose-900/60 hover:bg-rose-800 px-3 py-1 rounded text-white font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !report && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-pulse">
          <div className="h-32 bg-slate-900/60 rounded-xl border border-slate-800" />
          <div className="h-32 bg-slate-900/60 rounded-xl border border-slate-800" />
          <div className="h-32 bg-slate-900/60 rounded-xl border border-slate-800" />
          <div className="h-32 bg-slate-900/60 rounded-xl border border-slate-800" />
        </div>
      )}

      {/* Main Content */}
      {report && (
        <>
          {/* Top Aggregated Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Institutional Equities
              </span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {report.total_tickers} Symbols
              </div>
              <span className="text-[11px] font-mono text-emerald-400 mt-1 block">
                Mega-Cap & Market Proxies
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Daily OHLCV Candles
              </span>
              <div className="text-2xl font-extrabold text-cyan-400 mt-1">
                {report.total_candles.toLocaleString()}
              </div>
              <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                90-Day Deterministic History
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Technical Signals
              </span>
              <div className="text-2xl font-extrabold text-indigo-400 mt-1">
                {report.total_signals.toLocaleString()}
              </div>
              <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                RSI 14 & Bollinger Bands
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                SEC EDGAR RAG Chunks
              </span>
              <div className="text-2xl font-extrabold text-purple-400 mt-1">
                {report.total_rag_chunks.toLocaleString()}
              </div>
              <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                1536-Dim Normalized Vectors
              </span>
            </div>
          </div>

          {/* TAB 1: Institutional Equity Fleet Grid */}
          {activeTab === "FLEET" && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🏛️</span> 10 Institutional Equity Benchmarks
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Deterministic time-series and semantic vector data density per asset.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {report.tickers.length} Assets Monitored
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {report.tickers.map((t: TickerSeedSummary) => (
                  <div
                    key={t.symbol}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded bg-slate-900 text-white font-mono font-black text-sm border border-slate-700">
                            {t.symbol}
                          </span>
                          <div>
                            <span className="text-sm font-bold text-slate-200 block">
                              {t.company_name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Latest Bar: {t.latest_candle_date || "None"}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            t.status === "SEEDED"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-950 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>

                      {/* Density Badges */}
                      <div className="grid grid-cols-3 gap-2 mt-4 text-xs font-mono text-center">
                        <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                          <span className="block text-slate-400 text-[10px]">CANDLES</span>
                          <span className="text-cyan-400 font-bold text-sm">
                            {t.candles_count}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                          <span className="block text-slate-400 text-[10px]">SIGNALS</span>
                          <span className="text-indigo-400 font-bold text-sm">
                            {t.signals_count}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                          <span className="block text-slate-400 text-[10px]">RAG CHUNKS</span>
                          <span className="text-purple-400 font-bold text-sm">
                            {t.rag_chunks_count}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">
                        {t.candles_count >= 60 ? "✓ Full Range Ready" : "⚠️ Needs Ingestion"}
                      </span>
                      <button
                        onClick={() => triggerSeed(t.symbol)}
                        disabled={seeding}
                        className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono transition disabled:opacity-50"
                      >
                        Re-Seed {t.symbol}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Raw JSON Inspector */}
          {activeTab === "JSON" && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📜</span> Machine-Readable Seed Status JSON
                </h3>
                <button
                  onClick={copyJson}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-medium transition flex items-center gap-1.5"
                >
                  <span>{copied ? "✓ Copied!" : "📋 Copy JSON"}</span>
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 text-slate-300 font-mono text-xs overflow-x-auto border border-slate-800 max-h-[500px]">
                {JSON.stringify(report, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};
