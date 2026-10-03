"use client";

import React, { useState } from "react";
import { Activity, DollarSign, TrendingDown, Zap } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

interface MacroSimulatorPanelProps {
  onSimulate?: (params: {
    fedRate: number;
    vixSpike: number;
    earningsRevision: number;
  }) => void;
  isSimulating?: boolean;
}

export default function MacroSimulatorPanel({
  onSimulate,
  isSimulating = false,
}: MacroSimulatorPanelProps) {
  const [fedRate, setFedRate] = useState(0);
  const [vixSpike, setVixSpike] = useState(10);
  const [earningsRevision, setEarningsRevision] = useState(0);

  const { playClick, playPipelineWarp } = useSoundFX();

  const handleRun = () => {
    if (onSimulate) {
      playPipelineWarp();
      onSimulate({ fedRate, vixSpike, earningsRevision });
    }
  };

  return (
    <div className="w-full bg-gray-950/60 border border-gray-800/80 rounded-2xl p-6 backdrop-blur-xl shadow-2xl overflow-hidden relative mt-6">
      <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-950/50 rounded-lg border border-cyan-900/50">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-white font-mono font-bold tracking-wide">Macro Stress Simulator</h3>
            <p className="text-xs text-gray-500 font-mono">Inject dynamic market shocks to recalculate AI conviction.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-gray-400 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-green-400"/> Fed Funds Rate</span>
            <span className="text-white font-bold">{fedRate > 0 ? `+${fedRate}` : fedRate} bps</span>
          </div>
          <input
            type="range"
            min="-200"
            max="200"
            step="25"
            value={fedRate}
            onChange={(e) => {
              setFedRate(Number(e.target.value));
              playClick();
            }}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-[10px] text-gray-600 font-mono">
            <span>-200bps</span>
            <span>+200bps</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-gray-400 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-orange-400"/> VIX Spike</span>
            <span className="text-white font-bold">+{vixSpike}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="10"
            value={vixSpike}
            onChange={(e) => {
              setVixSpike(Number(e.target.value));
              playClick();
            }}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <div className="flex justify-between text-[10px] text-gray-600 font-mono">
            <span>+10%</span>
            <span>+100%</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-gray-400 flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-red-400"/> Earnings Revisions</span>
            <span className="text-white font-bold">{earningsRevision > 0 ? `+${earningsRevision}` : earningsRevision}%</span>
          </div>
          <input
            type="range"
            min="-20"
            max="20"
            step="5"
            value={earningsRevision}
            onChange={(e) => {
              setEarningsRevision(Number(e.target.value));
              playClick();
            }}
            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-red-500"
          />
          <div className="flex justify-between text-[10px] text-gray-600 font-mono">
            <span>-20%</span>
            <span>+20%</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-gray-800/80 pt-4 mt-2">
        <button
          onClick={handleRun}
          disabled={isSimulating}
          className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-sm font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(8,145,178,0.4)] hover:shadow-[0_0_25px_rgba(8,145,178,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSimulating ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Zap className="w-4 h-4 fill-white" />
          )}
          <span>{isSimulating ? "Simulating Scenario..." : "Run Stress Test"}</span>
        </button>
      </div>
    </div>
  );
}
