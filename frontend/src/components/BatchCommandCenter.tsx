"use client";

import React from "react";
import { BatchAssetStatus } from "@/types/api";
import { Layers, CheckCircle2, Clock, AlertTriangle, ArrowUpRight, X } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

interface BatchCommandCenterProps {
  batchId: string | null;
  assets: BatchAssetStatus[];
  onSelectAsset?: (ticker: string) => void;
  onClearBatch?: () => void;
}

export default function BatchCommandCenter({
  batchId,
  assets,
  onSelectAsset,
  onClearBatch,
}: BatchCommandCenterProps) {
  const { playClick, playBlip } = useSoundFX();

  if (!batchId || assets.length === 0) return null;

  const completedCount = assets.filter((a) => a.status === "completed").length;
  const failedCount = assets.filter((a) => a.status === "failed").length;
  const progressPercent = Math.round((completedCount / assets.length) * 100);
  const isAllDone = completedCount + failedCount === assets.length;

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-4 sm:p-6 font-mono text-left mt-8 shadow-2xl border border-cyan-500/25">
      {/* Batch Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-cyan-500/20 pb-4 mb-5 gap-3">
        <div>
          <div className="flex items-center space-x-2.5">
            <Layers className="w-4 h-4 text-cyan-400 animate-pulse" />
            <h3 className="text-white text-sm font-bold tracking-wider uppercase">
              Multi-Asset Batch Surveillance Matrix
            </h3>
          </div>
          <span className="text-slate-500 text-xs mt-1 block">
            Batch Reference: <span className="text-slate-400 font-mono break-all">{batchId}</span>
          </span>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center space-x-2">
            <span className="text-slate-400">Progress:</span>
            <span className="text-cyan-400 font-bold">
              {completedCount} / {assets.length}
            </span>
            <span className="text-slate-600">({progressPercent}%)</span>
            {isAllDone && (
              <span className="ml-1.5 text-emerald-400 font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5 inline" />
                <span>ALL COMPLETE</span>
              </span>
            )}
          </div>

          {onClearBatch && (
            <button
              onClick={() => {
                playClick();
                onClearBatch();
              }}
              title="Clear Batch Matrix"
              className="p-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 rounded-lg text-xs transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Track */}
      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden mb-6 border border-slate-800">
        <div
          className="bg-gradient-to-r from-cyan-500 via-indigo-400 to-emerald-400 h-full transition-all duration-500 shadow-[0_0_12px_rgba(0,240,255,0.5)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Real-time Multi-Asset Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {assets.map((asset) => {
          const isCompleted = asset.status === "completed";
          const isProcessing = asset.status === "processing" || asset.status === "queued";
          const isFailed = asset.status === "failed";
          const signal = (asset.result?.signal || "PENDING").toUpperCase();

          return (
            <div
              key={asset.job_id}
              onClick={() => {
                playBlip();
                onSelectAsset && onSelectAsset(asset.ticker);
              }}
              className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer group relative overflow-hidden ${
                isCompleted
                  ? "bg-slate-950/60 border-slate-800 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(0,240,255,0.15)]"
                  : isProcessing
                  ? "bg-cyan-950/20 border-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.1)]"
                  : "bg-rose-950/20 border-rose-500/30"
              }`}
            >
              {/* Card Header: Ticker & Status Badge */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-extrabold text-white tracking-wide group-hover:text-cyan-300 transition-colors flex items-center space-x-1.5">
                  <span>{asset.ticker}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                </span>

                {isCompleted ? (
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      signal.includes("BUY")
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                        : signal.includes("SELL")
                        ? "bg-rose-500/10 border-rose-500/40 text-rose-400"
                        : signal.includes("HOLD")
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                        : "bg-slate-800 border-slate-700 text-slate-400"
                    }`}
                  >
                    ● {signal}
                  </span>
                ) : isProcessing ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-cyan-500/10 border-cyan-500/40 text-cyan-400 flex items-center space-x-1">
                    <Clock className="w-2.5 h-2.5 animate-spin" />
                    <span>REASONING</span>
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider bg-rose-500/10 border-rose-500/40 text-rose-400 flex items-center space-x-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>FAILED</span>
                  </span>
                )}
              </div>

              {/* Snippet / Metadata */}
              <p className="text-[11px] text-slate-400 truncate">
                {asset.result?.analysis_report ||
                  asset.result?.reasoning ||
                  "LangGraph multi-agent synthesis in flight..."}
              </p>

              {/* Sub-footer */}
              <div className="mt-2.5 pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] text-slate-500">
                <span>Job: {asset.job_id.slice(0, 10)}...</span>
                <span className="text-slate-400 font-mono">
                  {asset.result?.execution_time_ms ? `+${asset.result.execution_time_ms}ms` : "Active"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
