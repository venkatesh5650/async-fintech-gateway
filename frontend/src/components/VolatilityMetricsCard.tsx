"use client";

import React, { useEffect, useState, useCallback } from "react";
import { VolatilityMetricsResponse } from "@/types/api";

interface VolatilityMetricsCardProps {
  ticker: string;
}

export function VolatilityMetricsCard({ ticker }: VolatilityMetricsCardProps) {
  const [data, setData] = useState<VolatilityMetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVolatility = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/analytics/volatility/${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch volatility metrics (HTTP ${res.status})`);
      }
      const json: VolatilityMetricsResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load volatility metrics.");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchVolatility();
  }, [fetchVolatility]);

  const getRiskBadgeStyle = (risk?: string) => {
    if (risk === "LOW_RISK") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    if (risk === "HIGH_RISK") return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    return "bg-amber-500/10 text-amber-400 border-amber-500/30";
  };

  const getSharpeBadgeStyle = (rating?: string) => {
    if (rating === "EXCELLENT") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    if (rating === "GOOD") return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
    if (rating === "NEGATIVE") return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    return "bg-slate-500/10 text-slate-400 border-slate-500/30";
  };

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-5 shadow-xl text-slate-200 border border-cyan-500/25">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
          <h3 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
            Risk & Volatility Profile (30-Day Rolling)
          </h3>
        </div>
        <button
          onClick={fetchVolatility}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-purple-400 transition-colors disabled:opacity-50"
        >
          {loading ? "Calculating..." : "↻ Refresh"}
        </button>
      </div>

      {loading && !data ? (
        <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
          Computing 30-day std dev, Sharpe ratio & maximum drawdown...
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-rose-400 bg-rose-950/20 rounded-lg border border-rose-900/40">
          {error}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Volatility Card */}
          <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Annualized Volatility
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRiskBadgeStyle(data.risk_level)}`}>
                {data.risk_level.replace(/_/g, " ")}
              </span>
            </div>
            <div className="my-2">
              <div className="text-3xl font-black tracking-tight text-slate-100">
                {typeof data.volatility_30d_pct === "number" ? `${data.volatility_30d_pct.toFixed(2)}%` : "N/A"}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">30-day rolling standard deviation (annualized)</div>
            </div>
          </div>

          {/* Sharpe Ratio Card */}
          <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Sharpe Ratio
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSharpeBadgeStyle(data.sharpe_rating)}`}>
                {data.sharpe_rating}
              </span>
            </div>
            <div className="my-2">
              <div className="text-3xl font-black tracking-tight text-slate-100">
                {typeof data.sharpe_ratio === "number" ? data.sharpe_ratio.toFixed(2) : "N/A"}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Risk-adjusted excess return vs 4.0% risk-free benchmark</div>
            </div>
          </div>

          {/* Max Drawdown Card */}
          <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Maximum Drawdown
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-rose-500/10 text-rose-400 border-rose-500/30">
                PEAK TO TROUGH
              </span>
            </div>
            <div className="my-2">
              <div className="text-3xl font-black tracking-tight text-rose-400">
                {typeof data.max_drawdown_pct === "number" ? `-${data.max_drawdown_pct.toFixed(2)}%` : "N/A"}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Maximum historical decline from local high point</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
