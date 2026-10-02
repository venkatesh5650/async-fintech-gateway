"use client";

import React, { useState } from "react";
import Link from "next/link";
import CyberTopNav from "@/components/CyberTopNav";
import LiveMarketTickerTape from "@/components/LiveMarketTickerTape";
import HolographicHeroTerminal from "@/components/HolographicHeroTerminal";
import TickerSearchModal from "@/components/TickerSearchModal";
import { ArrowRight, ShieldCheck, Zap, Database, Cpu, Activity, Award, Search, TrendingUp } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";
import { useBikeTransition } from "@/context/BikeTransitionContext";

export default function Home() {
  const { playClick } = useSoundFX();
  const { launchBikeTransition } = useBikeTransition();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <main className="min-h-screen bg-transparent text-slate-100 font-sans selection:bg-cyan-500 selection:text-black relative overflow-hidden flex flex-col justify-between">
      {/* Background Subtle Gradient Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00f0ff06_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff06_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Top Futuristic Navigation Bar */}
      <CyberTopNav />

      {/* Real-Time Market Ticker Ribbon */}
      <LiveMarketTickerTape />

      {/* Hero Section Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 w-full relative z-10">
        <div className="text-center max-w-4xl mx-auto mb-12">
          {/* Zero-Trust Badge */}
          <div className="inline-flex items-center space-x-2 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1 rounded-full text-xs font-mono text-cyan-400 mb-6 shadow-[0_0_15px_rgba(0,240,255,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="tracking-wider">AUTONOMOUS MULTI-AGENT SWARM</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300">ENTERPRISE EDITION v0.9.0</span>
          </div>

          {/* Hero Main Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Autonomous Swarm{" "}
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(0,240,255,0.3)]">
              Equity Intelligence
            </span>
          </h1>

          <p className="text-slate-400 text-base sm:text-xl leading-relaxed font-sans max-w-2xl mx-auto">
            Zero-hallucination institutional research platform. Quantitative indicators computed in <span className="text-emerald-400 font-mono">PostgreSQL CTEs</span>, synthesized with qualitative <span className="text-purple-400 font-mono">SEC EDGAR 10-K embeddings</span> across a multi-agent <span className="text-cyan-400 font-mono">LangGraph state machine</span>.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => {
                playClick();
                setIsSearchOpen(true);
              }}
              className="w-full sm:w-auto px-7 py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-sm font-bold uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(0,240,255,0.5)] transition-all duration-200 text-center flex items-center justify-center space-x-2.5 group"
            >
              <Search className="w-4 h-4 text-slate-950 group-hover:scale-110 transition-transform" />
              <span>Search Any Online Ticker</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] bg-slate-950/20 border border-slate-950/40 rounded font-bold">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => launchBikeTransition("AAPL")}
              className="w-full sm:w-auto px-6 py-4 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white font-mono text-sm font-semibold uppercase tracking-wider rounded-xl border border-slate-700/80 hover:border-cyan-500/50 transition-all duration-200 text-center flex items-center justify-center space-x-2 shadow-[0_0_15px_rgba(0,0,0,0.5)] group active:scale-95"
            >
              <span>Quick Deck (AAPL)</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-cyan-400" />
            </button>

            <Link
              href="/capstone"
              onClick={() => playClick()}
              className="w-full sm:w-auto px-6 py-4 bg-slate-950/80 hover:bg-slate-900 text-slate-400 hover:text-white font-mono text-sm font-semibold uppercase tracking-wider rounded-xl border border-slate-800 hover:border-amber-500/40 transition-all duration-200 text-center flex items-center justify-center space-x-2"
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>Sign-Off (93/93)</span>
            </Link>
          </div>

          {/* Trending Ticker Quick Launch Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
            <span className="text-slate-500 flex items-center gap-1 text-[11px] uppercase tracking-wider mr-1">
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>Instant Launch:</span>
            </span>
            {[
              { sym: "NVDA", name: "NVIDIA" },
              { sym: "TSLA", name: "Tesla" },
              { sym: "MSFT", name: "Microsoft" },
              { sym: "AAPL", name: "Apple" },
              { sym: "AMZN", name: "Amazon" },
              { sym: "BTC-USD", name: "Bitcoin" },
            ].map((t) => (
              <button
                key={t.sym}
                type="button"
                onClick={() => launchBikeTransition(t.sym)}
                className="px-2.5 py-1 rounded-lg bg-slate-950/80 hover:bg-cyan-950/60 border border-slate-800/80 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 transition-all active:scale-95 flex items-center gap-1"
              >
                <span className="font-bold">{t.sym}</span>
                <span className="text-[10px] text-slate-500 hidden xs:inline">({t.name})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3D Tilt Interactive Terminal Preview */}
        <HolographicHeroTerminal />

        {/* Live System Operational Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <div className="hud-panel corner-reticle rounded-xl p-4 text-center">
            <span className="text-3xl sm:text-4xl font-extrabold text-cyan-400 block tracking-tight font-mono text-glow-cyan">
              &lt; 15ms
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mt-1 font-mono">
              Ingestion P99 Latency
            </span>
          </div>

          <div className="hud-panel corner-reticle rounded-xl p-4 text-center">
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-400 block tracking-tight font-mono text-glow-emerald">
              100%
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mt-1 font-mono">
              Deterministic Math (0 Hallucination)
            </span>
          </div>

          <div className="hud-panel corner-reticle rounded-xl p-4 text-center">
            <span className="text-3xl sm:text-4xl font-extrabold text-amber-400 block tracking-tight font-mono">
              93 / 93
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mt-1 font-mono">
              Sealed Test Suites (v0.9.0)
            </span>
          </div>

          <div className="hud-panel corner-reticle rounded-xl p-4 text-center">
            <span className="text-3xl sm:text-4xl font-extrabold text-purple-400 block tracking-tight font-mono text-glow-violet">
              1536-dim
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mt-1 font-mono">
              pgvector Cosine Search
            </span>
          </div>
        </div>

        {/* 4 Core Architectural Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="hud-panel corner-reticle p-5 rounded-xl border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mb-3 shadow-[0_0_12px_rgba(0,240,255,0.2)]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-sm mb-1.5 font-mono">Zero-Trust Perimeter</h3>
            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              Strict Pydantic V2 boundary validation, JWT cookie auth gatekeeper, and edge error sanitization masking backend stack traces.
            </p>
          </div>

          <div className="hud-panel corner-reticle p-5 rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
            <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-3 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-sm mb-1.5 font-mono">Deterministic SQL CTEs</h3>
            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              Zero LLM math calculations. SMA, EMA, VWAP, 14D RSI, Bollinger Bands, and Sharpe ratio are calculated mathematically in PostgreSQL.
            </p>
          </div>

          <div className="hud-panel corner-reticle p-5 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-all">
            <div className="w-9 h-9 rounded-lg bg-purple-950/60 border border-purple-500/40 flex items-center justify-center text-purple-400 mb-3 shadow-[0_0_12px_rgba(168,85,247,0.2)]">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-sm mb-1.5 font-mono">Event-Driven Streams</h3>
            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              Redis 7 consumer group workers, XAUTOCLAIM crash recovery, poison-pill DLQ isolation, and persistent WebSocket broadcasting.
            </p>
          </div>

          <div className="hud-panel corner-reticle p-5 rounded-xl border border-amber-500/20 hover:border-amber-500/40 transition-all">
            <div className="w-9 h-9 rounded-lg bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-3 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-sm mb-1.5 font-mono">Multi-Agent LangGraph</h3>
            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              Cognitive state graph orchestrating quantitative metrics, semantic filing embeddings, and circuit-breaker risk consensus.
            </p>
          </div>
        </div>
      </div>

      {/* Global Interactive Ticker Search Modal */}
      <TickerSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </main>
  );
}
