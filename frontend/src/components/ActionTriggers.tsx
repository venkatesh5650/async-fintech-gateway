"use client";
import React, { useState } from "react";

interface ActionTriggersProps {
  ticker: string;
  onDispatch: (ticker: string) => void;
  isProcessing: boolean;
  cooldown: number; // 
}

export default function ActionTriggers({ ticker, onDispatch, isProcessing, cooldown }: ActionTriggersProps) {
  const [overrideActive, setOverrideActive] = useState(false);

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left mt-6">
      <h3 className="text-gray-500 text-xs uppercase tracking-widest mb-4 border-b border-gray-800 pb-2">
        Terminal Command Center
      </h3>
      
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
    </div>
  );
}