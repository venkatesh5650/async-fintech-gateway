"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TickerAnalyticsResponse } from "@/types/api";

interface TechnicalIndicatorPanelProps {
  ticker: string;
}

export function TechnicalIndicatorPanel({ ticker }: TechnicalIndicatorPanelProps) {
  const [data, setData] = useState<TickerAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch analytics (HTTP ${res.status})`);
      }
      const json: TickerAnalyticsResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load technical indicators.");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const getRsiBadgeStyle = (status?: string) => {
    if (status === "OVERBOUGHT") return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    if (status === "OVERSOLD") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
  };

  const getBollingerBadgeStyle = (status?: string) => {
    if (status === "ABOVE_UPPER") return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    if (status === "BELOW_LOWER") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    return "bg-slate-500/10 text-slate-400 border-slate-500/30";
  };

  const formatPrice = (val: number | null | undefined) => {
    if (typeof val !== "number" || isNaN(val)) return "N/A";
    return `$${val.toFixed(2)}`;
  };

  const rsiVal = data?.indicators?.rsi_14;
  const rsiStatus = data?.indicators?.rsi_status || "NEUTRAL";
  const bb = data?.indicators?.bollinger_bands;
  const bbStatus = bb?.status || "WITHIN_BANDS";

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-5 shadow-xl text-slate-200 border border-cyan-500/25">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
          <h3 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
            Technical Oscillators — RSI & Bollinger Bands
          </h3>
        </div>
        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-50"
        >
          {loading ? "Calculating..." : "↻ Refresh"}
        </button>
      </div>

      {loading && !data ? (
        <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
          Calculating 14-day RSI & 20-day Bollinger Bands...
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-rose-400 bg-rose-950/20 rounded-lg border border-rose-900/40">
          {error}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* RSI Gauge Section */}
          <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                14-Day RSI Gauge
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRsiBadgeStyle(rsiStatus)}`}>
                {rsiStatus}
              </span>
            </div>

            <div className="flex items-baseline justify-between my-2">
              <span className="text-3xl font-black tracking-tight text-slate-100">
                {typeof rsiVal === "number" ? rsiVal.toFixed(1) : "N/A"}
              </span>
              <span className="text-xs text-slate-500 font-mono">Range: 0 — 100</span>
            </div>

            {/* RSI Progress Bar */}
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden relative mt-2">
              <div
                className={`h-full transition-all duration-500 ${
                  typeof rsiVal === "number" && rsiVal >= 70
                    ? "bg-rose-500"
                    : typeof rsiVal === "number" && rsiVal <= 30
                    ? "bg-emerald-500"
                    : "bg-cyan-400"
                }`}
                style={{ width: `${Math.min(Math.max(typeof rsiVal === "number" ? rsiVal : 0, 0), 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
              <span>0 (Oversold ≤30)</span>
              <span>50</span>
              <span>100 (Overbought ≥70)</span>
            </div>
          </div>

          {/* Bollinger Bands Section */}
          <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Bollinger Bands (20, 2σ)
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getBollingerBadgeStyle(bbStatus)}`}>
                {bbStatus.replace(/_/g, " ")}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 my-2 text-center">
              <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                <div className="text-[9px] text-slate-400 uppercase font-medium">Lower (-2σ)</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5">
                  {formatPrice(bb?.lower)}
                </div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                <div className="text-[9px] text-slate-400 uppercase font-medium">Middle (SMA20)</div>
                <div className="text-xs font-bold text-slate-200 mt-0.5">
                  {formatPrice(bb?.middle)}
                </div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                <div className="text-[9px] text-slate-400 uppercase font-medium">Upper (+2σ)</div>
                <div className="text-xs font-bold text-rose-400 mt-0.5">
                  {formatPrice(bb?.upper)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>
                Bandwidth: <strong className="text-slate-300">{typeof bb?.bandwidth_pct === "number" ? `${bb.bandwidth_pct.toFixed(2)}%` : "N/A"}</strong>
              </span>
              <span>
                Current: <strong className="text-cyan-300">{formatPrice(data.current_price)}</strong>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
