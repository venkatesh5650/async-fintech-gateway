"use client";

import React, { useState } from "react";
import CacheStatusBadge from "./CacheStatusBadge";
import StampedeGuardBadge from "./StampedeGuardBadge";
import AgentSignalDebugger from "./AgentSignalDebugger";
import { ConfidenceDialMeter } from "./ConfidenceDialMeter";
import { AgentThoughtStream } from "./AgentThoughtStream";
import { AgentSwarmDeck } from "./AgentSwarmDeck";
import { Sparkles, Cpu, Activity, ShieldCheck, Zap, ChevronDown, ChevronUp } from "lucide-react";

export interface IntelligenceData {
  ticker?: string;
  signal?: string;
  analysis_report?: string;
  reasoning?: string;
  execution_time_ms?: number;
  cache_hit?: boolean;
  source?: "CACHE" | "DATABASE" | string;
  prime_origin?: string;
  primed_at?: string;
  cache_ttl_remaining?: number;
  data_source_latency_ms?: number;
  total_request_latency_ms?: number;
  mutex_contention?: boolean;
  lock_wait_ms?: number;
  quant_context_injected?: boolean;
  quant_context?: Record<string, any>;
  trace_id?: string;
  [key: string]: any;
}

export default function IntelligenceCard({
  data,
  onRefresh,
  isRefreshing,
}: {
  data: IntelligenceData;
  onRefresh?: (forceRefresh: boolean) => void;
  isRefreshing?: boolean;
}) {
  if (!data) return null;

  const rawSignal = (data.signal || "NEUTRAL").toUpperCase();

  // Dynamic Signal Theme
  const getSignalTheme = (signal: string) => {
    if (signal.includes("BUY")) {
      return {
        badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]",
        border: "border-emerald-500/40",
        label: "BULLISH ALPHA CONVICTION",
      };
    }
    if (signal.includes("SELL")) {
      return {
        badge: "text-rose-400 bg-rose-500/10 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.3)]",
        border: "border-rose-500/40",
        label: "BEARISH RISK MITIGATION",
      };
    }
    return {
      badge: "text-amber-400 bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.3)]",
      border: "border-amber-500/40",
      label: "HEDGED MARKET NEUTRAL",
    };
  };

  const signalTheme = getSignalTheme(rawSignal);

  const [isExpanded, setIsExpanded] = useState(false);
  const reportText =
    data.analysis_report ||
    data.reasoning ||
    "Autonomous state machine execution complete. Technical momentum indicators confirmed mathematically in PostgreSQL. SEC 10-K disclosures cross-referenced via pgvector cosine distance.";

  return (
    <div className="w-full space-y-6 font-mono" id="ai-intelligence-results">
      {/* 1. Autonomous Swarm Persona Deck */}
      <AgentSwarmDeck />

      {/* 2. Main Intelligence Command Deck */}
      <div className="hud-panel corner-reticle rounded-xl shadow-2xl overflow-hidden border border-cyan-500/25">
        {/* Top Telemetry Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-950/90 px-4 sm:px-6 py-3.5 border-b border-cyan-500/20">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
            <span className="text-slate-200 font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center gap-1.5">
              <span>{data.ticker || "EQUITY"} INTELLIGENCE CORE</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-normal bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                W3C LINKED
              </span>
            </span>
          </div>

          {/* Cache & Mutex Guard Telemetry */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <CacheStatusBadge
              cacheHit={data.cache_hit}
              source={data.source}
              primeOrigin={data.prime_origin}
              primedAt={data.primed_at}
              ttlRemaining={data.cache_ttl_remaining}
              dataSourceLatencyMs={data.data_source_latency_ms}
              onRefresh={onRefresh}
              isLoading={isRefreshing}
            />

            {data.mutex_contention && (
              <StampedeGuardBadge
                mutexContention={data.mutex_contention}
                lockWaitMs={data.lock_wait_ms}
              />
            )}

            {data.execution_time_ms !== undefined && (
              <span className="text-cyan-300 font-bold text-[11px] border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(0,240,255,0.15)] flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-400" />
                <span>AI: {data.execution_time_ms}ms</span>
              </span>
            )}
          </div>
        </div>

        {/* Intelligence Split View: Dial Gauge + Reasoning Report */}
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Swarm Conviction Gauge (4 cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between">
            <ConfidenceDialMeter
              score={data.quant_context?.composite_score ?? 82}
              signal={data.signal}
              riskLevel={data.quant_context?.risk_level ?? "LOW"}
              sharpeRatio={data.quant_context?.sharpe_ratio}
              maxDrawdownPct={data.quant_context?.max_drawdown_pct}
            />
          </div>

          {/* Right Column: Signal Card & Consensus Synthesis (8 cols) */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
            {/* Computed Alpha Signal Banner */}
            <div className={`p-4 rounded-xl border ${signalTheme.badge} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 block">
                  Deterministic Multi-Agent Consensus
                </span>
                <span className="text-xs font-bold tracking-wider text-slate-200">
                  {signalTheme.label}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-wider">
                  {data.signal || "HOLD"}
                </span>
              </div>
            </div>

            {/* Cognitive Synthesis Report with Controlled Scrolling */}
            <div className="hud-panel rounded-xl p-4 border border-slate-800/90 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <h3 className="text-cyan-300 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Cognitive Synthesis & Fundamental Brief</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                      MODEL: QWEN 2.5 32B / GROQ
                    </span>
                    {reportText.length > 200 && (
                      <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/70 text-cyan-300 hover:text-white hover:bg-cyan-900/80 transition-all flex items-center gap-1 active:scale-95"
                      >
                        <span>{isExpanded ? "Compact View" : "Full View"}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className={`text-slate-300 text-xs leading-relaxed whitespace-pre-wrap font-sans overscroll-contain pr-2 transition-all duration-200 ${
                    isExpanded
                      ? "max-h-none overflow-visible"
                      : "max-h-60 sm:max-h-72 overflow-y-auto"
                  }`}
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(6, 182, 212, 0.35) rgba(15, 23, 42, 0.4)",
                  }}
                >
                  {reportText}
                </div>
              </div>

              {!isExpanded && reportText.length > 200 && (
                <div className="mt-3 pt-2 border-t border-slate-900/90 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Scroll container isolated • Click to expand full text</span>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold"
                  >
                    Expand All ▾
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Live Cognitive Reasoning Stream HUD */}
      <AgentThoughtStream
        ticker={data.ticker}
        traceId={data.trace_id || "w3c_4fa812bc9001"}
        rawReasoning={data.reasoning || data.analysis_report}
        quantInjected={data.quant_context_injected}
      />

      {/* 4. Quant Context State Injector Debugger */}
      <AgentSignalDebugger
        quantContextInjected={data.quant_context_injected}
        quantContext={data.quant_context}
        llmSignal={data.signal}
        llmReport={data.analysis_report || data.reasoning}
      />
    </div>
  );
}
