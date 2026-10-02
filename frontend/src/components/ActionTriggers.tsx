"use client";

import React, { useState } from "react";
import { Zap, Layers, Sparkles, Terminal, Sliders, Cpu, Play } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

interface ActionTriggersProps {
  ticker: string;
  onDispatch: (ticker: string) => void;
  onBatchDispatch?: (tickers: string[]) => void;
  isProcessing: boolean;
  cooldown: number;
}

const PRESET_BASKETS = [
  { name: "Mega-Cap Tech", tickers: ["AAPL", "MSFT", "NVDA", "GOOGL", "META"] },
  { name: "Semiconductors", tickers: ["NVDA", "AMD", "TSM", "INTC", "AVGO"] },
  { name: "Wall St. Financials", tickers: ["JPM", "BAC", "GS", "MS", "WFC"] },
];

export default function ActionTriggers({
  ticker,
  onDispatch,
  onBatchDispatch,
  isProcessing,
  cooldown,
}: ActionTriggersProps) {
  const { playClick, playBlip } = useSoundFX();
  const [overrideActive, setOverrideActive] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [customTickers, setCustomTickers] = useState("");

  const handleCustomBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onBatchDispatch || cooldown > 0 || isProcessing) return;

    const list = customTickers
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && t.length <= 5);

    if (list.length > 0) {
      playClick();
      onBatchDispatch(list.slice(0, 50));
    }
  };

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-4 sm:p-6 font-mono text-left mt-6 shadow-2xl border border-cyan-500/25">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-500/20 pb-3 mb-5">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-slate-200 text-xs font-bold uppercase tracking-widest">
            Tactical Action Command Deck
          </h3>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              playBlip();
              setMode("single");
            }}
            className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center space-x-1.5 transition ${
              mode === "single"
                ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>Single Asset</span>
          </button>
          <button
            type="button"
            onClick={() => {
              playBlip();
              setMode("batch");
            }}
            className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center space-x-1.5 transition ${
              mode === "batch"
                ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Multi-Asset Batch</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Single Ticker Mode */}
      {mode === "single" ? (
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => {
              playClick();
              onDispatch(ticker);
            }}
            disabled={isProcessing || !ticker || cooldown > 0}
            className={`flex-1 py-3.5 px-6 rounded-xl font-bold uppercase tracking-widest text-xs transition-all duration-200 flex items-center justify-center space-x-2 ${
              isProcessing || cooldown > 0
                ? "bg-slate-900 text-slate-500 cursor-not-allowed border border-slate-800"
                : "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(0,240,255,0.4)] cursor-pointer"
            }`}
          >
            {isProcessing ? (
              <>
                <Cpu className="w-4 h-4 animate-spin" />
                <span>Executing Multi-Agent Swarm...</span>
              </>
            ) : cooldown > 0 ? (
              <span>Rate Limit Cooldown: {cooldown}s</span>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Dispatch {ticker} Intelligence Pipeline</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              playClick();
              setOverrideActive(!overrideActive);
            }}
            className={`px-6 py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs border transition-all duration-200 flex items-center justify-center space-x-1.5 ${
              overrideActive
                ? "bg-rose-950/40 border-rose-500 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{overrideActive ? "Override: ACTIVE" : "Manual Override"}</span>
          </button>
        </div>
      ) : (
        /* Mode 2: Multi-Asset Batch Mode */
        <div className="space-y-4">
          {/* Institutional Presets */}
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-2 font-bold">
              Preset Institutional Baskets:
            </span>
            <div className="flex flex-wrap gap-2.5">
              {PRESET_BASKETS.map((basket) => (
                <button
                  key={basket.name}
                  type="button"
                  disabled={isProcessing || cooldown > 0}
                  onClick={() => {
                    playClick();
                    onBatchDispatch && onBatchDispatch(basket.tickers);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs border transition-all duration-200 ${
                    isProcessing || cooldown > 0
                      ? "bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed"
                      : "bg-slate-900/80 border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-950/20 shadow-sm"
                  }`}
                >
                  <span className="font-bold">{basket.name}</span>
                  <span className="text-slate-500 text-[10px] ml-1.5 font-mono">
                    ({basket.tickers.join(", ")})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Array Input Form */}
          <form onSubmit={handleCustomBatchSubmit} className="pt-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customTickers}
                onChange={(e) => setCustomTickers(e.target.value)}
                placeholder="Enter tickers separated by commas (e.g. AAPL, NVDA, MSFT, TSLA, GOOGL)"
                disabled={isProcessing || cooldown > 0}
                className="flex-1 bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isProcessing || cooldown > 0 || !customTickers.trim()}
                className={`px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all duration-200 flex items-center justify-center space-x-1.5 ${
                  isProcessing || cooldown > 0 || !customTickers.trim()
                    ? "bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800"
                    : "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(0,240,255,0.4)] cursor-pointer"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {isProcessing
                    ? "Queuing..."
                    : cooldown > 0
                    ? `Cooldown (${cooldown}s)`
                    : "Dispatch Array"}
                </span>
              </button>
            </div>
            <span className="text-[10px] text-slate-500 mt-2 block">
              Boundary: Max 50 US equity symbols per fan-out. Controlled concurrency: 5 worker stream consumers.
            </span>
          </form>
        </div>
      )}
    </div>
  );
}