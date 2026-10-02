"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { Play, Sparkles, Terminal, Activity, CheckCircle2, Cpu, Database, Shield, Zap, ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";
import { useSoundFX } from "@/hooks/useSoundFX";

export default function HolographicHeroTerminal() {
  const { playClick, playBlip, playConsensus } = useSoundFX();
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 3D tilt state
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  // Simulation execution state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState<number>(0);
  const [simFinished, setSimFinished] = useState<boolean>(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rX = ((y - centerY) / centerY) * -5;
    const rY = ((x - centerX) / centerX) * 5;

    setRotateX(rX);
    setRotateY(rY);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  const runSimulation = () => {
    if (isSimulating) return;
    playClick();
    setIsSimulating(true);
    setSimFinished(false);
    setSimStep(1);

    setTimeout(() => {
      playBlip();
      setSimStep(2);
    }, 900);

    setTimeout(() => {
      playBlip();
      setSimStep(3);
    }, 1800);

    setTimeout(() => {
      playBlip();
      setSimStep(4);
    }, 2700);

    setTimeout(() => {
      playConsensus();
      setIsSimulating(false);
      setSimFinished(true);

      // Trigger crisp celebration confetti
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#00f0ff", "#10b981", "#a855f7"],
      });
    }, 3600);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        transition: "transform 0.15s ease-out",
      }}
      className="max-w-4xl mx-auto hud-panel corner-reticle rounded-2xl overflow-hidden shadow-2xl font-mono text-sm mb-16 border border-cyan-500/30 relative group"
    >
      {/* Top Laser Scan Accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-laser-scan pointer-events-none" />

      {/* Terminal Title Bar */}
      <div className="bg-slate-950/95 px-4 py-3 border-b border-cyan-500/20 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-2.5">
          <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
          <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span className="ml-2 font-mono text-slate-300 font-bold text-[11px] sm:text-xs">
            autonomous-swarm@gateway ~ interactive-preview
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-emerald-400 font-mono text-[11px] flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">WS TELEMETRY:</span>
            <span>12ms</span>
          </span>

          {/* Interactive Trigger Button */}
          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className={`px-3 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-all ${
              isSimulating
                ? "bg-cyan-950/80 text-cyan-300 border border-cyan-500/40"
                : "bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_15px_rgba(0,240,255,0.5)] cursor-pointer"
            }`}
          >
            {isSimulating ? (
              <>
                <Cpu className="w-3.5 h-3.5 animate-spin" />
                <span>Simulating...</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Test Live Swarm</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Terminal Main Body */}
      <div className="p-6 space-y-5 text-left bg-slate-950/40 backdrop-blur-md">
        {/* Target Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <span className="text-slate-500 text-[10px] uppercase tracking-widest block font-bold">
              Target Equity Surveillance
            </span>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-2xl font-extrabold text-white tracking-wide">AAPL</span>
              <span className="text-slate-400 text-xs font-sans">Apple Inc. · NASDAQ</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                $330.32 (+1.42%)
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest block">
                Consensus Output
              </span>
              <span
                className={`font-extrabold px-3 py-1 rounded text-xs tracking-wider border inline-block mt-0.5 ${
                  simFinished
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                    : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                }`}
              >
                {simFinished ? "BUY · 94% CONVICTION" : "SIGNAL: STRONG BUY"}
              </span>
            </div>
          </div>
        </div>

        {/* 4 Agent Execution Timeline / Progress Track */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          {/* Agent 1 */}
          <div
            className={`p-2.5 rounded-lg border text-xs transition-all ${
              simStep >= 1
                ? "bg-emerald-950/40 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                : "bg-slate-900/40 border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-emerald-400 flex items-center space-x-1">
                <Database className="w-3 h-3 inline" />
                <span>SENTINEL-Q</span>
              </span>
              {simStep >= 1 && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              PostgreSQL 50D SMA, RSI & Bollinger Math
            </p>
          </div>

          {/* Agent 2 */}
          <div
            className={`p-2.5 rounded-lg border text-xs transition-all ${
              simStep >= 2
                ? "bg-purple-950/40 border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.25)]"
                : "bg-slate-900/40 border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-purple-400 flex items-center space-x-1">
                <Cpu className="w-3 h-3 inline" />
                <span>LEXICON-X</span>
              </span>
              {simStep >= 2 && <CheckCircle2 className="w-3 h-3 text-purple-400" />}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              1536-dim pgvector SEC 10-K Semantic Scan
            </p>
          </div>

          {/* Agent 3 */}
          <div
            className={`p-2.5 rounded-lg border text-xs transition-all ${
              simStep >= 3
                ? "bg-amber-950/40 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                : "bg-slate-900/40 border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-amber-400 flex items-center space-x-1">
                <Shield className="w-3 h-3 inline" />
                <span>GATEKEEPER</span>
              </span>
              {simStep >= 3 && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Zero-Trust Guard & Breaker Quarantine
            </p>
          </div>

          {/* Agent 4 */}
          <div
            className={`p-2.5 rounded-lg border text-xs transition-all ${
              simStep >= 4
                ? "bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_12px_rgba(0,240,255,0.25)]"
                : "bg-slate-900/40 border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-cyan-400 flex items-center space-x-1">
                <Zap className="w-3 h-3 inline" />
                <span>ARBITER</span>
              </span>
              {simStep >= 4 && <CheckCircle2 className="w-3 h-3 text-cyan-400" />}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              LangGraph Multi-Agent Signal Synthesis
            </p>
          </div>
        </div>

        {/* Live Reasoning Feed Banner */}
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
              Cognitive Consensus Report
            </span>
            <span className="text-[10px] text-cyan-400 flex items-center space-x-1">
              <Sparkles className="w-3 h-3" />
              <span>Trace: w3c_8fa194be_capstone</span>
            </span>
          </div>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed font-sans">
            {simStep === 0 &&
              "Deterministic fundamental synthesis completed. 50-day SMA ($330.32) confirmation calculated mathematically in PostgreSQL. Multi-agent LangGraph consensus indicates strong upward momentum with low volatility drawdown risk."}
            {simStep === 1 && "⚡ Sentinel-Q active: PostgreSQL CTE window functions computing rolling Sharpe & VWAP..."}
            {simStep === 2 && "🧠 Lexicon-X active: Cosine distance scan across Apple FY25 10-K filing chunks..."}
            {simStep === 3 && "🛡️ Gatekeeper active: Zero-Trust schema verification complete. DLQ error count: 0..."}
            {simStep >= 4 && "🏆 Arbiter Core: High-conviction alpha generated. Broadcasted monotonic JSON frame over WebSockets!"}
          </p>
        </div>

        {/* Action Link to Full Terminal */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-4 text-xs text-slate-500">
            <span className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Redis Streams Broker</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>pgvector Cosine Search</span>
            </span>
          </div>

          <Link
            href="/dashboard/AAPL"
            onClick={() => playClick()}
            className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400 rounded-lg text-xs font-mono font-bold tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-[0_0_12px_rgba(0,240,255,0.15)]"
          >
            <span>Launch Research Terminal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
