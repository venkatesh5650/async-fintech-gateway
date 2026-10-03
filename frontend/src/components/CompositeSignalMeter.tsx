"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { CompositeSignalResponse } from "@/types/api";

function useNumberTicker(value: number, duration: number = 1200) {
  const [current, setCurrent] = useState(value);
  const currentRef = useRef(value);

  useEffect(() => {
    let start = performance.now();
    const init = currentRef.current;
    const diff = value - init;
    if (diff === 0) {
      setCurrent(value);
      currentRef.current = value;
      return;
    }

    let animationFrameId: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const nextVal = init + diff * ease;
      setCurrent(nextVal);
      currentRef.current = nextVal;
      
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(tick);
      }
    };
    animationFrameId = requestAnimationFrame(tick);
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, duration]);

  return current;
}

interface CompositeSignalMeterProps {
  ticker: string;
  simulatedScore?: number | null;
}

export function CompositeSignalMeter({ ticker, simulatedScore }: CompositeSignalMeterProps) {
  const [data, setData] = useState<CompositeSignalResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComposite = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/analytics/composite/${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch composite signal (HTTP ${res.status})`);
      }
      const json: CompositeSignalResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load composite signal.");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchComposite();
  }, [fetchComposite]);

  const getRecommendationBadgeStyle = (rec?: string) => {
    if (rec === "STRONG_BUY") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]";
    if (rec === "BUY") return "bg-green-500/15 text-green-400 border-green-500/40 shadow-[0_0_8px_rgba(34,197,94,0.2)]";
    if (rec === "SELL") return "bg-amber-500/15 text-amber-400 border-amber-500/40";
    if (rec === "STRONG_SELL") return "bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.3)]";
    return "bg-cyan-500/15 text-cyan-400 border-cyan-500/40";
  };

  const getGaugeColor = (val: number) => {
    if (val >= 75) return "#10b981"; // emerald
    if (val >= 60) return "#22c55e"; // green
    if (val >= 40) return "#06b6d4"; // cyan
    if (val >= 25) return "#f59e0b"; // amber
    return "#f43f5e"; // rose
  };

  const score = data?.composite_score ?? 0;
  const animatedScore = useNumberTicker(score);
  const animatedSimulated = useNumberTicker(simulatedScore ?? score);
  const recommendation = data?.recommendation ?? "NEUTRAL";
  const components = data?.components;

  const arcRadius = 60;
  const arcLength = Math.PI * arcRadius;
  const strokeDashoffset = arcLength - (Math.min(Math.max(animatedScore, 0), 100) / 100) * arcLength;
  const ghostDashoffset = simulatedScore != null ? arcLength - (Math.min(Math.max(animatedSimulated, 0), 100) / 100) * arcLength : arcLength;

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-5 shadow-xl text-slate-200 border border-cyan-500/25">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
            Composite Technical Signal Fusion (0–100 Score)
          </h3>
        </div>
        <button
          onClick={fetchComposite}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
        >
          {loading ? "Fusing..." : "↻ Refresh"}
        </button>
      </div>

      {loading && !data ? (
        <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
          Fusing SMA, RSI, Bollinger Bands & Sharpe ratio into composite score...
        </div>
      ) : error ? (
        <div className="py-4 text-center text-xs text-rose-400 bg-rose-950/20 rounded-lg border border-rose-900/40">
          {error}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Semi-Circle Speed-Gauge Arc */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <div className="relative w-48 h-28 flex items-end justify-center">
              <svg className="w-48 h-28" viewBox="0 0 160 95">
                {/* Track Arc */}
                <path
                  d="M 20 80 A 60 60 0 0 1 140 80"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                {/* Ghost Value Fill Arc */}
                {simulatedScore != null && (
                  <path
                    d="M 20 80 A 60 60 0 0 1 140 80"
                    fill="none"
                    stroke={getGaugeColor(simulatedScore)}
                    strokeWidth="12"
                    strokeDasharray={arcLength}
                    strokeDashoffset={ghostDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out opacity-40 blur-[2px]"
                  />
                )}
                {/* Value Fill Arc */}
                <path
                  d="M 20 80 A 60 60 0 0 1 140 80"
                  fill="none"
                  stroke={getGaugeColor(simulatedScore != null ? simulatedScore : score)}
                  strokeWidth="12"
                  strokeDasharray={arcLength}
                  strokeDashoffset={simulatedScore != null ? ghostDashoffset : strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>

              <div className="absolute bottom-1 text-center">
                <div className="text-3xl font-black tracking-tight text-slate-100 font-mono flex items-baseline justify-center gap-2">
                  {simulatedScore != null ? (
                    <>
                      <span className="text-slate-500 line-through text-lg">{animatedScore.toFixed(1)}</span>
                      <span className="text-cyan-400">{animatedSimulated.toFixed(1)}</span>
                    </>
                  ) : (
                    animatedScore.toFixed(1)
                  )}
                </div>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">
                  {simulatedScore != null ? (
                    <span className={simulatedScore >= score ? "text-green-400" : "text-red-400"}>
                      DELTA: {simulatedScore >= score ? "+" : ""}{(animatedSimulated - animatedScore).toFixed(1)}
                    </span>
                  ) : "OUT OF 100"}
                </div>
              </div>
            </div>

            {/* Range Legend */}
            <div className="w-full flex justify-between px-6 text-[9px] text-slate-500 font-mono mt-1">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>

            <div className="mt-3">
              <span
                className={`text-xs font-black tracking-wider px-4 py-1 rounded-full border uppercase ${getRecommendationBadgeStyle(
                  recommendation
                )}`}
              >
                {recommendation.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Factor Contribution Breakdown (2 cols) */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* SMA Factor */}
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium uppercase mb-1">
                <span>SMA Crossover</span>
                <span className="text-slate-500 font-mono">Weight: 30%</span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-bold text-slate-200 font-mono">
                  {components?.sma_crossover?.score?.toFixed(1) ?? "50.0"}
                  <span className="text-[10px] text-slate-500 font-normal"> /100</span>
                </span>
                <span className="text-[10px] text-cyan-400 font-mono font-semibold">
                  {components?.sma_crossover?.signal?.replace(/_/g, " ") ?? "NEUTRAL"}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(Math.max(components?.sma_crossover?.score ?? 0, 0), 100)}%`,
                    backgroundColor: getGaugeColor(components?.sma_crossover?.score ?? 50)
                  }}
                />
              </div>
            </div>

            {/* RSI Factor */}
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium uppercase mb-1">
                <span>RSI (14-Day)</span>
                <span className="text-slate-500 font-mono">Weight: 25%</span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-bold text-slate-200 font-mono">
                  {components?.rsi_14?.score?.toFixed(1) ?? "50.0"}
                  <span className="text-[10px] text-slate-500 font-normal"> /100</span>
                </span>
                <span className="text-[10px] text-cyan-400 font-mono font-semibold">
                  {typeof components?.rsi_14?.val === "number" ? `RSI ${components.rsi_14.val.toFixed(1)}` : "NEUTRAL"}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(Math.max(components?.rsi_14?.score ?? 0, 0), 100)}%`,
                    backgroundColor: getGaugeColor(components?.rsi_14?.score ?? 50)
                  }}
                />
              </div>
            </div>

            {/* Bollinger Factor */}
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium uppercase mb-1">
                <span>Bollinger Bands</span>
                <span className="text-slate-500 font-mono">Weight: 25%</span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-bold text-slate-200 font-mono">
                  {components?.bollinger_bands?.score?.toFixed(1) ?? "50.0"}
                  <span className="text-[10px] text-slate-500 font-normal"> /100</span>
                </span>
                <span className="text-[10px] text-cyan-400 font-mono font-semibold">
                  {components?.bollinger_bands?.status?.replace(/_/g, " ") ?? "WITHIN BANDS"}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(Math.max(components?.bollinger_bands?.score ?? 0, 0), 100)}%`,
                    backgroundColor: getGaugeColor(components?.bollinger_bands?.score ?? 50)
                  }}
                />
              </div>
            </div>

            {/* Sharpe Factor */}
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium uppercase mb-1">
                <span>Sharpe / Risk</span>
                <span className="text-slate-500 font-mono">Weight: 20%</span>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-bold text-slate-200 font-mono">
                  {components?.sharpe_ratio?.score?.toFixed(1) ?? "50.0"}
                  <span className="text-[10px] text-slate-500 font-normal"> /100</span>
                </span>
                <span className="text-[10px] text-cyan-400 font-mono font-semibold">
                  {components?.sharpe_ratio?.rating ?? "SUBPAR"}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(Math.max(components?.sharpe_ratio?.score ?? 0, 0), 100)}%`,
                    backgroundColor: getGaugeColor(components?.sharpe_ratio?.score ?? 50)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
