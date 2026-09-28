"use client";

import React, { useState } from "react";
import { AnalyticsSummaryCard } from "@/components/AnalyticsSummaryCard";
import { VolatilityMetricsCard } from "@/components/VolatilityMetricsCard";
import { CorrelationHeatmap } from "@/components/CorrelationHeatmap";
import BacktestResultsPanel from "@/components/BacktestResultsPanel";
import SectorHeatmap from "@/components/SectorHeatmap";
import SignalVersionDiff from "@/components/SignalVersionDiff";

const DEFAULT_TICKERS = ["AAPL", "NVDA", "TSLA", "AMD", "MSFT", "GOOGL", "AMZN", "META"];

export default function UnifiedAnalyticsWorkspacePage() {
  const [activeTab, setActiveTab] = useState<"indicators" | "risk" | "backtest" | "sectors" | "audit">("indicators");
  const [selectedTicker, setSelectedTicker] = useState<string>("AAPL");

  return (
    <div className="min-h-screen bg-black text-gray-100 font-mono p-4 sm:p-8 space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="h-3.5 w-3.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-cyan-300 uppercase">
              Quantitative Analytics Workspace
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl">
            Native PostgreSQL window-function analytics engine, multi-factor composite alpha scoring, strategy backtesting, sector rotation & signal audit versioning.
          </p>
        </div>

        {/* Global Asset Selector */}
        <div className="flex items-center space-x-3">
          <span className="text-xs text-gray-400 uppercase tracking-widest">Active Equity:</span>
          <select
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="bg-gray-900 border border-cyan-500/40 text-cyan-300 font-bold text-sm rounded px-4 py-2 focus:outline-none focus:border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
          >
            {DEFAULT_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-3">
        <button
          onClick={() => setActiveTab("indicators")}
          className={`px-4 py-2 text-xs font-bold rounded transition-all flex items-center gap-2 ${
            activeTab === "indicators"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
              : "bg-gray-900/60 text-gray-400 hover:text-gray-200 border border-gray-800"
          }`}
        >
          <span>📈</span> Technical Indicators & Composite Signal
        </button>

        <button
          onClick={() => setActiveTab("risk")}
          className={`px-4 py-2 text-xs font-bold rounded transition-all flex items-center gap-2 ${
            activeTab === "risk"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
              : "bg-gray-900/60 text-gray-400 hover:text-gray-200 border border-gray-800"
          }`}
        >
          <span>🛡️</span> Risk, Volatility & Correlation Matrix
        </button>

        <button
          onClick={() => setActiveTab("backtest")}
          className={`px-4 py-2 text-xs font-bold rounded transition-all flex items-center gap-2 ${
            activeTab === "backtest"
              ? "bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
              : "bg-gray-900/60 text-gray-400 hover:text-gray-200 border border-gray-800"
          }`}
        >
          <span>📊</span> Strategy Backtester
        </button>

        <button
          onClick={() => setActiveTab("sectors")}
          className={`px-4 py-2 text-xs font-bold rounded transition-all flex items-center gap-2 ${
            activeTab === "sectors"
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.2)]"
              : "bg-gray-900/60 text-gray-400 hover:text-gray-200 border border-gray-800"
          }`}
        >
          <span>🌐</span> Sector Rotation
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 text-xs font-bold rounded transition-all flex items-center gap-2 ${
            activeTab === "audit"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
              : "bg-gray-900/60 text-gray-400 hover:text-gray-200 border border-gray-800"
          }`}
        >
          <span>📜</span> Signal Version Audit
        </button>
      </div>

      {/* Tab Content Display */}
      <div className="pt-2">
        {activeTab === "indicators" && (
          <div className="space-y-6">
            <AnalyticsSummaryCard ticker={selectedTicker} />
          </div>
        )}

        {activeTab === "risk" && (
          <div className="space-y-6">
            <VolatilityMetricsCard ticker={selectedTicker} />
            <CorrelationHeatmap />
          </div>
        )}

        {activeTab === "backtest" && (
          <div>
            <BacktestResultsPanel initialTicker={selectedTicker} />
          </div>
        )}

        {activeTab === "sectors" && (
          <div>
            <SectorHeatmap />
          </div>
        )}

        {activeTab === "audit" && (
          <div>
            <SignalVersionDiff initialTicker={selectedTicker} />
          </div>
        )}
      </div>
    </div>
  );
}
