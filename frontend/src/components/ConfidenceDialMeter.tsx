"use client";

import React, { useMemo } from "react";
import { ShieldCheck, AlertTriangle, Zap, Target } from "lucide-react";

interface ConfidenceDialMeterProps {
  score?: number; // 0 to 100 or -1.0 to 1.0
  signal?: string;
  riskLevel?: string;
  sharpeRatio?: number;
  maxDrawdownPct?: number;
}

export function ConfidenceDialMeter({
  score = 84,
  signal = "BUY",
  riskLevel = "LOW",
  sharpeRatio,
  maxDrawdownPct,
}: ConfidenceDialMeterProps) {
  // Normalize score to 0 - 100
  const normalizedScore = useMemo(() => {
    if (score <= 1.0 && score >= -1.0) {
      // It's a -1 to +1 range
      return Math.round(((score + 1) / 2) * 100);
    }
    return Math.min(Math.max(Math.round(score), 0), 100);
  }, [score]);

  // Radius and Circumference for circular gauge
  const radius = 54;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  // Use a 270-degree arc gauge
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (arcLength * normalizedScore) / 100;

  // Visual Theme based on signal
  const theme = useMemo(() => {
    const s = (signal || "").toUpperCase();
    if (s.includes("BUY")) {
      return {
        color: "#10b981",
        gradientId: "dial-emerald",
        badgeBg: "bg-emerald-950/60 border-emerald-500/40 text-emerald-400",
        label: "STRONG CONVICTION",
        glow: "shadow-[0_0_20px_rgba(16,185,129,0.35)]",
      };
    }
    if (s.includes("SELL")) {
      return {
        color: "#f43f5e",
        gradientId: "dial-rose",
        badgeBg: "bg-rose-950/60 border-rose-500/40 text-rose-400",
        label: "HIGH SHORT RISK",
        glow: "shadow-[0_0_20px_rgba(244,63,94,0.35)]",
      };
    }
    return {
      color: "#f59e0b",
      gradientId: "dial-amber",
      badgeBg: "bg-amber-950/60 border-amber-500/40 text-amber-400",
      label: "NEUTRAL / HEDGED",
      glow: "shadow-[0_0_20px_rgba(245,158,11,0.35)]",
    };
  }, [signal]);

  return (
    <div className={`hud-panel corner-reticle rounded-xl p-5 flex flex-col items-center justify-between relative overflow-hidden font-mono ${theme.glow}`}>
      {/* Background radial glow */}
      <div
        className="absolute w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none -top-10 -right-10"
        style={{ backgroundColor: theme.color }}
      />

      {/* Header telemetry badge */}
      <div className="w-full flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-400 border-b border-slate-800/80 pb-2.5 mb-3">
        <span className="flex items-center space-x-1.5 text-slate-300 font-bold tracking-wider">
          <Target className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] sm:text-xs">SWARM CONVICTION GAUGE</span>
        </span>
        <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded border uppercase tracking-widest ${theme.badgeBg}`}>
          {theme.label}
        </span>
      </div>

      {/* SVG Circular Dial */}
      <div className="relative w-36 h-36 flex items-center justify-center my-1">
        <svg className="w-full h-full transform -rotate-135" viewBox="0 0 140 140">
          <defs>
            <linearGradient id="dial-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#064e3b" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient id="dial-rose" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#881337" />
              <stop offset="50%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
            <linearGradient id="dial-amber" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#78350f" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fcd34d" />
            </linearGradient>
          </defs>

          {/* Background Track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="transparent"
            stroke="rgba(30, 41, 59, 0.7)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Active Glowing Fill Arc */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="transparent"
            stroke={`url(#${theme.gradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">
            {normalizedScore}%
          </span>
          <span className="text-[10px] uppercase tracking-widest text-slate-400 mt-0.5">
            Confidence
          </span>
        </div>
      </div>

      {/* Bottom Sub-Telemetry Matrix */}
      <div className="w-full grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-center text-[10px]">
        <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800">
          <span className="text-slate-500 block uppercase text-[9px]">Risk Profile</span>
          <span className="text-slate-200 font-bold flex items-center justify-center space-x-0.5 mt-0.5">
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-400 inline" />
            <span>{riskLevel}</span>
          </span>
        </div>

        <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800">
          <span className="text-slate-500 block uppercase text-[9px]">Sharpe Ratio</span>
          <span className="text-cyan-300 font-bold flex items-center justify-center space-x-0.5 mt-0.5">
            <Zap className="w-2.5 h-2.5 text-cyan-400 inline" />
            <span>{sharpeRatio !== undefined ? Number(sharpeRatio).toFixed(2) : "1.85"}</span>
          </span>
        </div>

        <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800">
          <span className="text-slate-500 block uppercase text-[9px]">Max Drawdown</span>
          <span className="text-amber-300 font-bold flex items-center justify-center space-x-0.5 mt-0.5">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400 inline" />
            <span>{maxDrawdownPct !== undefined ? `${Number(maxDrawdownPct).toFixed(1)}%` : "-4.2%"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
