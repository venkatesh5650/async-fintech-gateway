"use client";

import React, { useState } from "react";
import { Bot, Cpu, Database, Shield, Zap, Sparkles, Activity, Layers } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

export type AgentRole = "quant" | "rag" | "orchestrator" | "gatekeeper";

export interface AgentPersona {
  id: string;
  name: string;
  role: AgentRole;
  title: string;
  subsystem: string;
  status: "ACTIVE" | "COMPUTING" | "STANDBY" | "VALIDATED";
  latencyMs: number;
  engine: string;
  description: string;
  theme: {
    color: string;
    border: string;
    bg: string;
    glow: string;
    badge: string;
  };
}

export function AgentSwarmDeck() {
  const { playClick, playBlip } = useSoundFX();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("sentinel");

  const agents: AgentPersona[] = [
    {
      id: "sentinel",
      name: "Sentinel-Q",
      role: "quant",
      title: "Quantitative Mathematical Engine",
      subsystem: "storage_quant",
      status: "COMPUTING",
      latencyMs: 14.2,
      engine: "PostgreSQL 16 CTE / asyncpg",
      description: "Computes 50D SMA, 14D RSI, 20D Bollinger, and Sharpe ratio deterministically in SQL window functions.",
      theme: {
        color: "#10b981",
        border: "border-emerald-500/40",
        bg: "bg-emerald-950/20",
        glow: "hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]",
        badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      },
    },
    {
      id: "lexicon",
      name: "Lexicon-X",
      role: "rag",
      title: "Qualitative SEC EDGAR Scout",
      subsystem: "vector_rag",
      status: "ACTIVE",
      latencyMs: 38.5,
      engine: "pgvector 1536-dim / HNSW",
      description: "Extracts 10-K/10-Q filing chunks, generating normalized embeddings and semantic passage scoring.",
      theme: {
        color: "#a855f7",
        border: "border-purple-500/40",
        bg: "bg-purple-950/20",
        glow: "hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]",
        badge: "text-purple-400 bg-purple-500/10 border-purple-500/30",
      },
    },
    {
      id: "arbiter",
      name: "Arbiter Core",
      role: "orchestrator",
      title: "LangGraph Swarm Orchestrator",
      subsystem: "langgraph_state",
      status: "ACTIVE",
      latencyMs: 62.0,
      engine: "LangGraph StateGraph / Groq",
      description: "Directs multi-agent cognitive consensus, routing deterministic math and semantic filings into alpha signals.",
      theme: {
        color: "#00f0ff",
        border: "border-cyan-500/40",
        bg: "bg-cyan-950/20",
        glow: "hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]",
        badge: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
      },
    },
    {
      id: "gatekeeper",
      name: "Gatekeeper Prime",
      role: "gatekeeper",
      title: "Consensus & Circuit Breaker Guard",
      subsystem: "perimeter_defense",
      status: "VALIDATED",
      latencyMs: 3.1,
      engine: "Redis DLQ / Sliding Window Limiter",
      description: "Validates strict Pydantic V2 contracts, monitors LLM breaker trips, and quarantines poison-pill jobs.",
      theme: {
        color: "#f59e0b",
        border: "border-amber-500/40",
        bg: "bg-amber-950/20",
        glow: "hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]",
        badge: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      },
    },
  ];

  return (
    <div className="w-full space-y-4 font-mono">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5 text-cyan-400 animate-pulse" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Autonomous Swarm Persona Deck
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            4 AGENTS ENGAGED
          </span>
        </div>

        <div className="text-[11px] text-slate-500 flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>SWARM TOPOLOGY: CQRS ASYNC</span>
        </div>
      </div>

      {/* Grid of 4 Living Agent Personas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {agents.map((agent) => {
          const isSelected = selectedAgentId === agent.id;

          return (
            <div
              key={agent.id}
              onClick={() => {
                setSelectedAgentId(agent.id);
                playBlip();
              }}
              className={`hud-panel corner-reticle rounded-xl p-4 cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                agent.theme.border
              } ${agent.theme.bg} ${agent.theme.glow} ${
                isSelected ? "ring-1 ring-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.2)]" : ""
              }`}
            >
              {/* Background Ambient Aura */}
              <div
                className="absolute w-24 h-24 rounded-full blur-2xl opacity-15 pointer-events-none -top-4 -right-4"
                style={{ backgroundColor: agent.theme.color }}
              />

              {/* Persona Top Info */}
              <div>
                <div className="flex items-start justify-between mb-3">
                  {/* Living Holographic Robot Avatar Ring */}
                  <div className="relative w-11 h-11 rounded-lg bg-slate-900/90 border border-slate-700/80 flex items-center justify-center">
                    {agent.role === "quant" && <Database className="w-5 h-5 text-emerald-400" />}
                    {agent.role === "rag" && <Cpu className="w-5 h-5 text-purple-400" />}
                    {agent.role === "orchestrator" && <Zap className="w-5 h-5 text-cyan-400" />}
                    {agent.role === "gatekeeper" && <Shield className="w-5 h-5 text-amber-400" />}

                    {/* Animated Pulsing Status Halo */}
                    <span
                      className="absolute -inset-0.5 rounded-lg border opacity-60 animate-ping pointer-events-none"
                      style={{ borderColor: agent.theme.color }}
                    />
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider font-bold ${agent.theme.badge}`}
                  >
                    ● {agent.status}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-white font-bold text-sm tracking-wide">
                      {agent.name}
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    {agent.title}
                  </p>
                </div>

                <p className="text-[10px] text-slate-400/90 mt-2.5 leading-relaxed">
                  {agent.description}
                </p>
              </div>

              {/* Persona Bottom Telemetry Strip */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                <span className="text-slate-500 truncate max-w-[120px]">
                  {agent.engine}
                </span>
                <span className="font-bold text-slate-300">
                  {agent.latencyMs}ms
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
