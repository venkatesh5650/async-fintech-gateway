"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TickerAnalyticsResponse } from "@/types/api";

interface AnalyticsSummaryCardProps {
  ticker: string;
  onSelectTrace?: (traceId: string) => void;
}

export function AnalyticsSummaryCard({ ticker, onSelectTrace }: AnalyticsSummaryCardProps) {
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

  const getSignalBadgeStyle = (status: string) => {
    if (status.includes("BULLISH")) {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    }
    if (status.includes("BEARISH")) {
      return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    }
    return "bg-slate-500/10 text-slate-400 border-slate-500/30";
  };

  const formatPrice = (val: number | null | undefined) => {
    if (typeof val !== "number" || isNaN(val)) return "N/A";
    return `$${val.toFixed(2)}`;
  };

  const getPriceDelta = (indicatorVal: number | null | undefined, currentPrice: number | null | undefined) => {
    if (!indicatorVal || !currentPrice) return null;
    const diff = ((currentPrice - indicatorVal) / indicatorVal) * 100;
    return diff;
  };

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-5 shadow-xl text-slate-200 border border-cyan-500/25">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
            Quant Technical Engine — {ticker.toUpperCase()}
          </h3>
        </div>
        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
        >
          {loading ? "Calculating..." : "↻ Refresh"}
        </button>
      </div>

      {loading && !data ? (
        <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
          Computing PostgreSQL window function aggregations...
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-rose-400 bg-rose-950/20 rounded-lg border border-rose-900/40">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className={`p-3.5 rounded-lg border flex items-center justify-between ${getSignalBadgeStyle(data.crossover_signal.status)}`}>
            <div>
              <div className="text-xs font-bold tracking-wide uppercase">
                {data.crossover_signal.status.replace(/_/g, " ")}
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                {data.crossover_signal.description}
              </div>
            </div>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded border border-current opacity-70">
              {data.crossover_signal.strength}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <div className="text-[10px] text-slate-400 font-medium">10-SMA</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {formatPrice(data.indicators.sma_10)}
              </div>
              {data.current_price && data.indicators.sma_10 && (
                <div className={`text-[10px] mt-0.5 ${getPriceDelta(data.indicators.sma_10, data.current_price)! >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {getPriceDelta(data.indicators.sma_10, data.current_price)! >= 0 ? "▲" : "▼"} {Math.abs(getPriceDelta(data.indicators.sma_10, data.current_price)!).toFixed(1)}%
                </div>
              )}
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <div className="text-[10px] text-slate-400 font-medium">50-SMA</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {formatPrice(data.indicators.sma_50)}
              </div>
              {data.current_price && data.indicators.sma_50 && (
                <div className={`text-[10px] mt-0.5 ${getPriceDelta(data.indicators.sma_50, data.current_price)! >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {getPriceDelta(data.indicators.sma_50, data.current_price)! >= 0 ? "▲" : "▼"} {Math.abs(getPriceDelta(data.indicators.sma_50, data.current_price)!).toFixed(1)}%
                </div>
              )}
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <div className="text-[10px] text-slate-400 font-medium">200-SMA</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {formatPrice(data.indicators.sma_200)}
              </div>
              {data.current_price && data.indicators.sma_200 && (
                <div className={`text-[10px] mt-0.5 ${getPriceDelta(data.indicators.sma_200, data.current_price)! >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {getPriceDelta(data.indicators.sma_200, data.current_price)! >= 0 ? "▲" : "▼"} {Math.abs(getPriceDelta(data.indicators.sma_200, data.current_price)!).toFixed(1)}%
                </div>
              )}
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <div className="text-[10px] text-slate-400 font-medium">14-EMA</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {formatPrice(data.indicators.ema_14)}
              </div>
              {data.current_price && data.indicators.ema_14 && (
                <div className={`text-[10px] mt-0.5 ${getPriceDelta(data.indicators.ema_14, data.current_price)! >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {getPriceDelta(data.indicators.ema_14, data.current_price)! >= 0 ? "▲" : "▼"} {Math.abs(getPriceDelta(data.indicators.ema_14, data.current_price)!).toFixed(1)}%
                </div>
              )}
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <div className="text-[10px] text-slate-400 font-medium">VWAP</div>
              <div className="text-sm font-bold text-cyan-300 mt-1">
                {formatPrice(data.indicators.vwap)}
              </div>
              {data.current_price && data.indicators.vwap && (
                <div className={`text-[10px] mt-0.5 ${getPriceDelta(data.indicators.vwap, data.current_price)! >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {getPriceDelta(data.indicators.vwap, data.current_price)! >= 0 ? "▲" : "▼"} {Math.abs(getPriceDelta(data.indicators.vwap, data.current_price)!).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/40">
            <span>
              Rows Analyzed: <strong className="text-slate-400">{data.data_points_analyzed}</strong>
            </span>
            {data.trace_id && (
              <button
                onClick={() => onSelectTrace?.(data.trace_id)}
                className="font-mono text-cyan-400/80 hover:text-cyan-300 hover:underline"
              >
                Trace: {data.trace_id.slice(0, 8)}...
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
