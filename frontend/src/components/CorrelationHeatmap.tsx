"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CorrelationMatrixResponse } from "@/types/api";

interface CorrelationHeatmapProps {
  initialSymbols?: string[];
  activeTicker?: string;
}

const DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA"];

export function CorrelationHeatmap({ initialSymbols, activeTicker }: CorrelationHeatmapProps) {
  const [symbolsInput, setSymbolsInput] = useState<string>(() => {
    const syms = initialSymbols && initialSymbols.length > 0 ? initialSymbols : DEFAULT_TICKERS;
    if (activeTicker && !syms.includes(activeTicker.toUpperCase())) {
      return [activeTicker.toUpperCase(), ...syms.slice(0, 5)].join(", ");
    }
    return syms.join(", ");
  });

  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<CorrelationMatrixResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ a: string; b: string; val: number | null } | null>(null);

  const fetchCorrelation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const symQuery = encodeURIComponent(symbolsInput);
      const res = await fetch(`/api/analytics/correlation?symbols=${symQuery}&days=${days}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch correlation matrix (HTTP ${res.status})`);
      }
      const json: CorrelationMatrixResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load correlation matrix.");
    } finally {
      setLoading(false);
    }
  }, [symbolsInput, days]);

  useEffect(() => {
    fetchCorrelation();
  }, [fetchCorrelation]);

  const getCellBgColor = (val: number | null, isSelf: boolean) => {
    if (isSelf) return "bg-slate-800/80 text-slate-300 font-bold border-slate-700";
    if (val === null || isNaN(val)) return "bg-slate-900/40 text-slate-600 border-slate-800/60";

    if (val >= 0.7) return "bg-emerald-500/30 text-emerald-300 border-emerald-500/40 font-bold";
    if (val >= 0.3) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (val > 0.05) return "bg-emerald-500/10 text-emerald-400/90 border-slate-800";
    if (val <= -0.7) return "bg-rose-500/30 text-rose-300 border-rose-500/40 font-bold";
    if (val <= -0.3) return "bg-rose-500/20 text-rose-400 border-rose-500/30";
    if (val < -0.05) return "bg-rose-500/10 text-rose-400/90 border-slate-800";

    return "bg-slate-900/60 text-slate-400 border-slate-800";
  };

  const getRelationshipText = (val: number | null, isSelf: boolean) => {
    if (isSelf) return "Self Correlation (Identity)";
    if (val === null) return "Insufficient Data Points";
    if (val >= 0.7) return "Strong Positive Correlation (Moves Together)";
    if (val >= 0.3) return "Moderate Positive Correlation";
    if (val > -0.3 && val < 0.3) return "Uncorrelated / Independent Movements";
    if (val <= -0.7) return "Strong Inverse Correlation (Hedging Behavior)";
    if (val <= -0.3) return "Moderate Inverse Correlation";
    return "Weak Negative Relationship";
  };

  const symbols = data?.symbols || [];
  const matrix = data?.matrix || {};

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-5 shadow-xl text-slate-200 border border-cyan-500/25">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-3 mb-4 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
            Cross-Ticker Correlation Matrix (Pairwise SQL CORR)
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            value={symbolsInput}
            onChange={(e) => setSymbolsInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchCorrelation()}
            placeholder="e.g. AAPL, MSFT, NVDA, TSLA"
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500 font-mono flex-1 sm:w-64 min-w-[140px]"
          />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 font-mono focus:outline-none focus:border-cyan-500 shrink-0"
          >
            <option value={15}>15 Days</option>
            <option value={30}>30 Days</option>
            <option value={60}>60 Days</option>
            <option value={90}>90 Days</option>
          </select>
          <button
            onClick={fetchCorrelation}
            disabled={loading}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-bold rounded transition-colors disabled:opacity-50 shrink-0"
          >
            {loading ? "..." : "Compute"}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
          Executing PostgreSQL CORR() window computations across price vectors...
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-rose-400 bg-rose-950/20 rounded-lg border border-rose-900/40">
          {error}
        </div>
      ) : symbols.length > 0 ? (
        <div className="space-y-4 w-full max-w-full">
          <div className="w-full max-w-full overflow-x-auto scrollbar-none">
            <table className="w-full text-center border-collapse font-mono text-xs">
              <thead>
                <tr>
                  <th className="p-2 border border-slate-800 bg-slate-950 text-slate-400 font-bold uppercase">
                    Ticker
                  </th>
                  {symbols.map((sym: string) => (
                    <th
                      key={sym}
                      className={`p-2 border border-slate-800 bg-slate-950 font-bold ${
                        sym === activeTicker?.toUpperCase() ? "text-cyan-400" : "text-slate-300"
                      }`}
                    >
                      {sym}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbols.map((rowSym: string) => (
                  <tr key={rowSym}>
                    <td
                      className={`p-2 border border-slate-800 bg-slate-950 font-bold text-left ${
                        rowSym === activeTicker?.toUpperCase() ? "text-cyan-400" : "text-slate-300"
                      }`}
                    >
                      {rowSym}
                    </td>
                    {symbols.map((colSym: string) => {
                      const val = matrix[rowSym]?.[colSym] ?? null;
                      const isSelf = rowSym === colSym;
                      const isHovered = hoveredCell?.a === rowSym && hoveredCell?.b === colSym;

                      return (
                        <td
                          key={colSym}
                          onMouseEnter={() => setHoveredCell({ a: rowSym, b: colSym, val })}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`p-2 border transition-all duration-150 cursor-pointer ${getCellBgColor(
                            val,
                            isSelf
                          )} ${isHovered ? "ring-2 ring-cyan-400 scale-105 z-10" : ""}`}
                        >
                          {val !== null ? val.toFixed(2) : "N/A"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hover Status Legend Bar */}
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs font-mono gap-2">
            <div>
              {hoveredCell ? (
                <span>
                  <span className="text-cyan-400 font-bold">{hoveredCell.a}</span> vs{" "}
                  <span className="text-cyan-400 font-bold">{hoveredCell.b}</span>:{" "}
                  <strong className="text-slate-100">
                    {hoveredCell.val !== null ? hoveredCell.val.toFixed(4) : "N/A"}
                  </strong>{" "}
                  — <span className="text-slate-400">{getRelationshipText(hoveredCell.val, hoveredCell.a === hoveredCell.b)}</span>
                </span>
              ) : (
                <span className="text-slate-500">Hover over any matrix cell to inspect exact correlation score.</span>
              )}
            </div>

            <div className="flex items-center space-x-3 text-[10px]">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500/50" />
                <span className="text-emerald-400">Positive (+1.0)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-slate-700" />
                <span className="text-slate-400">Neutral (0.0)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500/50" />
                <span className="text-rose-400">Inverse (-1.0)</span>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
