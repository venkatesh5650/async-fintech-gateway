"use client";
import React from "react";
import { BatchAssetStatus } from "@/types/api";

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
  if (!batchId || assets.length === 0) return null;

  const completedCount = assets.filter((a) => a.status === "completed").length;
  const failedCount = assets.filter((a) => a.status === "failed").length;
  const isAllDone = completedCount + failedCount === assets.length;

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left mt-8 shadow-2xl">
      {/* Batch Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 mb-6 gap-3">
        <div>
          <div className="flex items-center space-x-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            <h3 className="text-white text-sm font-bold tracking-wider uppercase">
              Multi-Asset Batch Execution
            </h3>
          </div>
          <span className="text-gray-500 text-xs mt-1 block">
            Batch Ref: <span className="text-gray-400 font-mono">{batchId}</span>
          </span>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-md">
            <span className="text-gray-400">Progress: </span>
            <span className="text-blue-400 font-bold">
              {completedCount}/{assets.length}
            </span>
            {isAllDone && (
              <span className="ml-2 text-emerald-400 font-bold">✓ DONE</span>
            )}
          </div>
          {onClearBatch && (
            <button
              onClick={onClearBatch}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-md text-xs transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Real-time Multi-Asset Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assets.map((asset) => {
          const isCompleted = asset.status === "completed";
          const isProcessing = asset.status === "processing" || asset.status === "queued";
          const isFailed = asset.status === "failed";
          const signal = asset.result?.signal || "PENDING";

          return (
            <div
              key={asset.job_id}
              onClick={() => onSelectAsset && onSelectAsset(asset.ticker)}
              className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                isCompleted
                  ? "bg-gray-950/80 border-gray-800 hover:border-gray-600 shadow-md"
                  : isProcessing
                  ? "bg-blue-950/10 border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                  : "bg-red-950/10 border-red-500/30"
              }`}
            >
              {/* Card Header: Ticker & Status Badge */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-bold text-white tracking-wide">
                  {asset.ticker}
                </span>

                {isCompleted ? (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                      signal === "BUY"
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                        : signal === "SELL"
                        ? "bg-red-500/10 border-red-500/40 text-red-400"
                        : signal === "HOLD"
                        ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-400"
                        : "bg-gray-800 border-gray-700 text-gray-400"
                    }`}
                  >
                    {signal}
                  </span>
                ) : isProcessing ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                    <span>REASONING</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400">
                    FAILED
                  </span>
                )}
              </div>

              {/* Card Body: Latency & Snippet */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-[11px] text-gray-500">
                  <span>Job UUID:</span>
                  <span className="text-gray-400 truncate max-w-[120px]">
                    {asset.job_id.slice(0, 8)}...
                  </span>
                </div>

                {isCompleted && asset.result && (
                  <>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>Latency:</span>
                      <span className="text-emerald-400 font-semibold">
                        {asset.result.execution_time_ms}ms
                      </span>
                    </div>
                    <p className="text-gray-400 text-[11px] line-clamp-2 mt-2 leading-relaxed font-sans">
                      {asset.result.analysis_report || asset.result.reasoning}
                    </p>
                  </>
                )}

                {isProcessing && (
                  <div className="pt-2">
                    <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1 block">
                      Executing multi-agent node...
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
