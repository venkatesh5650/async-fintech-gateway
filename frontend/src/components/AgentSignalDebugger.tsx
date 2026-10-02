import React, { useState } from "react";

export interface QuantContextData {
  composite_score?: number;
  recommendation?: string;
  sub_scores?: Record<string, number>;
  volatility_30d_pct?: number;
  sharpe_ratio?: number;
  max_drawdown_pct?: number;
  risk_level?: string;
}

export interface AgentSignalDebuggerProps {
  quantContextInjected?: boolean;
  quantContext?: QuantContextData;
  llmSignal?: string;
  llmReport?: string;
}

export default function AgentSignalDebugger({
  quantContextInjected = false,
  quantContext,
  llmSignal,
  llmReport,
}: AgentSignalDebuggerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  if (!quantContext && !quantContextInjected) {
    return null;
  }

  const score = quantContext?.composite_score ?? null;
  const recommendation = quantContext?.recommendation || "UNKNOWN";
  const volatility = quantContext?.volatility_30d_pct ?? null;
  const sharpe = quantContext?.sharpe_ratio ?? null;
  const drawdown = quantContext?.max_drawdown_pct ?? null;
  const riskLevel = quantContext?.risk_level || "NEUTRAL";

  // Check consistency between Quant Recommendation and LLM output
  const isAligned =
    (recommendation.includes("BUY") && (llmSignal || "").includes("BUY")) ||
    (recommendation.includes("SELL") && (llmSignal || "").includes("SELL")) ||
    (recommendation.includes("NEUTRAL") && (llmSignal || "").includes("HOLD"));

  return (
    <div className="w-full hud-panel corner-reticle rounded-xl overflow-hidden font-mono mt-4 shadow-lg border border-cyan-500/25">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-cyan-500/20 text-left hover:bg-slate-900/60 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              quantContextInjected
                ? "bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                : "bg-amber-500"
            }`}
          />
          <span className="text-cyan-300 font-semibold text-xs tracking-wider uppercase">
            Quant Context Injector & Signal Debugger
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${
              quantContextInjected
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
          >
            {quantContextInjected ? "State Injected" : "Bypassed"}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {isAligned ? (
            <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded flex items-center gap-1">
              <span>✓</span> ALIGNED
            </span>
          ) : (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
              <span>⚠</span> DIVERGENT
            </span>
          )}
          <span className="text-gray-500 text-xs">{isOpen ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Left Column: Pre-computed Quantitative Engine Inputs */}
          <div className="bg-gray-950/60 p-3.5 rounded-lg border border-gray-800 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <span className="text-cyan-400">⚡</span> Quant Context (Engine Input)
              </span>
              <span className="text-cyan-400 font-bold">{recommendation}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-gray-300">
              <div className="bg-gray-900/70 p-2 rounded border border-gray-800/80">
                <div className="text-gray-500 text-[10px] uppercase">Composite Score</div>
                <div className="text-cyan-300 font-bold text-sm mt-0.5">
                  {score !== null ? `${score}/100` : "N/A"}
                </div>
              </div>

              <div className="bg-gray-900/70 p-2 rounded border border-gray-800/80">
                <div className="text-gray-500 text-[10px] uppercase">30D Volatility</div>
                <div className="text-purple-300 font-bold text-sm mt-0.5">
                  {volatility !== null ? `${volatility}%` : "N/A"}
                  <span className="text-[9px] text-gray-500 block font-normal">{riskLevel}</span>
                </div>
              </div>

              <div className="bg-gray-900/70 p-2 rounded border border-gray-800/80">
                <div className="text-gray-500 text-[10px] uppercase">Sharpe Ratio</div>
                <div className="text-emerald-300 font-bold text-sm mt-0.5">
                  {sharpe !== null ? sharpe : "N/A"}
                </div>
              </div>

              <div className="bg-gray-900/70 p-2 rounded border border-gray-800/80">
                <div className="text-gray-500 text-[10px] uppercase">Max Drawdown</div>
                <div className="text-rose-300 font-bold text-sm mt-0.5">
                  {drawdown !== null ? `-${drawdown}%` : "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: LangGraph LLM Rationale Output */}
          <div className="bg-gray-950/60 p-3.5 rounded-lg border border-gray-800 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <span className="text-purple-400">🤖</span> LLM Rationale (Agent Output)
              </span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[11px] border ${
                  (llmSignal || "").includes("BUY")
                    ? "text-green-400 bg-green-500/10 border-green-500/30"
                    : (llmSignal || "").includes("SELL")
                    ? "text-red-400 bg-red-500/10 border-red-500/30"
                    : "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
                }`}
              >
                {llmSignal || "NEUTRAL"}
              </span>
            </div>

            <div className="bg-gray-900/70 p-2.5 rounded border border-gray-800/80 text-gray-300 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap text-[11px]">
              {llmReport || "No rationale report returned from LLM agent."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
