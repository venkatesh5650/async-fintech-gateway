"use client";

import React from "react";

// This interface must match your FastAPI backend's Pydantic response schema
interface IntelligenceData {
  ticker?: string;
  signal?: string;
  reasoning?: string;
  execution_time_ms?: number;
  [key: string]: any; // Fallback for dynamic AI outputs
}

export default function IntelligenceCard({ data }: { data: IntelligenceData }) {
  if (!data) return null;

  // Dynamically color-code the trading signal
  const getSignalColor = (signal?: string) => {
    if (!signal) return "text-gray-400";
    const s = signal.toUpperCase();
    if (s.includes("BUY") || s.includes("BULLISH")) return "text-green-500 bg-green-500/10 border-green-500/20";
    if (s.includes("SELL") || s.includes("BEARISH")) return "text-red-500 bg-red-500/10 border-red-500/20";
    return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
  };

  const signalStyle = getSignalColor(data.signal);

  return (
    <div className="w-full bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden font-mono">
      {/* Card Header */}
      <div className="flex justify-between items-center bg-black px-6 py-4 border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-gray-400 text-sm tracking-widest uppercase">System Status: Optimal</span>
        </div>
        {data.execution_time_ms && (
          <span className="text-gray-500 text-xs">
            Latency: {data.execution_time_ms}ms
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="p-6 space-y-6">
        {/* Signal Banner */}
        <div className={`p-4 rounded-lg border ${signalStyle} flex justify-between items-center`}>
          <span className="text-sm uppercase tracking-widest opacity-80">Computed Alpha Signal</span>
          <span className="text-2xl font-bold">{data.signal || "NEUTRAL"}</span>
        </div>

        {/* Reasoning Section */}
        <div>
          <h3 className="text-gray-500 text-xs uppercase tracking-widest mb-3 border-b border-gray-800 pb-2">
            LangGraph Reasoning Engine
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
            {data.reasoning || JSON.stringify(data, null, 2)}
          </p>
        </div>
      </div>
    </div>
  );
}