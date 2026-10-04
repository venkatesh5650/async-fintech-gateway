import React from "react";
import { Database, Search, Cpu, Activity } from "lucide-react";

export function InfrastructureTelemetry() {
  return (
    <div className="mt-4 pt-3 border-t border-slate-800/80 bg-slate-950/40 rounded-b-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:divide-x divide-slate-800/60 font-mono text-[9px] uppercase tracking-wider text-slate-400">
        <div className="flex items-center gap-2 px-3 py-1.5 sm:py-0">
          <Database className="w-3 h-3 text-cyan-500" />
          <div className="flex flex-col">
            <span className="text-slate-500">PostgreSQL Math</span>
            <span className="text-slate-300 font-semibold">12ms <span className="text-emerald-500/70">($0.000)</span></span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 sm:py-0">
          <Search className="w-3 h-3 text-indigo-400" />
          <div className="flex flex-col">
            <span className="text-slate-500">pgvector Search</span>
            <span className="text-slate-300 font-semibold">18ms <span className="text-emerald-500/70">($0.000)</span></span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 sm:py-0">
          <Cpu className="w-3 h-3 text-purple-400" />
          <div className="flex flex-col">
            <span className="text-slate-500">LLM Reasoning</span>
            <span className="text-slate-300 font-semibold">280ms <span className="text-emerald-500/70">($0.0004 / 312 tokens)</span></span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 sm:py-0 sm:ml-auto">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
          <div className="flex flex-col">
            <span className="text-slate-500">Total Execution</span>
            <span className="text-emerald-400 font-bold">310ms (Zero-Latency SLA Met)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
