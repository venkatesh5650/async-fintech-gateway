"use client";
import React, { useState } from "react";

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
  { name: "Financials", tickers: ["JPM", "BAC", "GS", "MS", "WFC"] },
];

export default function ActionTriggers({
  ticker,
  onDispatch,
  onBatchDispatch,
  isProcessing,
  cooldown,
}: ActionTriggersProps) {
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
      onBatchDispatch(list.slice(0, 50));
    }
  };

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left mt-6 shadow-xl">
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
        <h3 className="text-gray-500 text-xs uppercase tracking-widest">
          Terminal Command Center
        </h3>

        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${
              mode === "single"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Single Asset
          </button>
          <button
            type="button"
            onClick={() => setMode("batch")}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${
              mode === "batch"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Multi-Asset Batch
          </button>
        </div>
      </div>

      {/* Mode 1: Single Ticker Mode */}
      {mode === "single" ? (
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => onDispatch(ticker)}
            disabled={isProcessing || !ticker || cooldown > 0}
            className={`flex-1 py-3 px-4 rounded font-bold uppercase tracking-widest transition-all duration-200 ${
              isProcessing || cooldown > 0
                ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]"
            }`}
          >
            {isProcessing
              ? "Executing AI Agent..."
              : cooldown > 0
              ? `Cooldown: ${cooldown}s`
              : `Dispatch ${ticker} Analysis`}
          </button>

          <button
            onClick={() => setOverrideActive(!overrideActive)}
            className={`px-6 py-3 rounded font-bold uppercase tracking-widest border transition-all duration-200 ${
              overrideActive
                ? "bg-red-500/10 border-red-500 text-red-500"
                : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            {overrideActive ? "Override: ACTIVE" : "Manual Override"}
          </button>
        </div>
      ) : (
        /* Mode 2: Multi-Asset Batch Mode */
        <div className="space-y-4">
          {/* Institutional Presets */}
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider block mb-2">
              Preset Institutional Baskets:
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_BASKETS.map((basket) => (
                <button
                  key={basket.name}
                  type="button"
                  disabled={isProcessing || cooldown > 0}
                  onClick={() => onBatchDispatch && onBatchDispatch(basket.tickers)}
                  className={`px-3 py-1.5 rounded text-xs border transition ${
                    isProcessing || cooldown > 0
                      ? "bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed"
                      : "bg-gray-900/80 border-gray-700 text-gray-300 hover:text-white hover:border-blue-500/50 hover:bg-blue-950/20"
                  }`}
                >
                  <span className="font-semibold">{basket.name}</span>
                  <span className="text-gray-500 text-[10px] ml-1.5 font-mono">
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
                placeholder="Enter tickers separated by commas (e.g. AAPL, NVDA, MSFT, TSLA)"
                disabled={isProcessing || cooldown > 0}
                className="flex-1 bg-gray-950 border border-gray-800 rounded px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isProcessing || cooldown > 0 || !customTickers.trim()}
                className={`px-6 py-2.5 rounded font-bold uppercase tracking-widest text-xs transition-all duration-200 ${
                  isProcessing || cooldown > 0 || !customTickers.trim()
                    ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                }`}
              >
                {isProcessing
                  ? "Queuing Batch..."
                  : cooldown > 0
                  ? `Cooldown (${cooldown}s)`
                  : "Dispatch Array"}
              </button>
            </div>
            <span className="text-[10px] text-gray-600 mt-1.5 block">
              Boundary: Max 50 US equity symbols per fan-out. Controlled concurrency: 5 workers.
            </span>
          </form>
        </div>
      )}
    </div>
  );
}