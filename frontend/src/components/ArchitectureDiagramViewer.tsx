"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SystemArchitectureTopology, ArchitectureNode, ArchitectureSubsystem } from "../types/api";

export const ArchitectureDiagramViewer: React.FC = () => {
  const [topology, setTopology] = useState<SystemArchitectureTopology | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ArchitectureNode | null>(null);
  const [activeView, setActiveView] = useState<"VISUAL" | "MERMAID" | "SUBSYSTEMS">("VISUAL");
  const [copied, setCopied] = useState<boolean>(false);

  const fetchTopology = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/system/architecture");
      if (!res.ok) {
        throw new Error(`Failed to load architecture topology: HTTP ${res.status}`);
      }
      const data: SystemArchitectureTopology = await res.json();
      setTopology(data);
      if (data.subsystems.length > 0 && data.subsystems[0].nodes.length > 0) {
        setSelectedNode(data.subsystems[0].nodes[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load architecture topology.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  const copyMermaidCode = () => {
    if (!topology) return;
    navigator.clipboard.writeText(topology.mermaid_diagram);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalNodesCount = topology
    ? topology.subsystems.reduce((acc, sub) => acc + sub.nodes.length, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Operational Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 text-xl font-bold">
                📐
              </span>
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                  System Architecture Blueprint
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 font-semibold font-mono">
                    {topology?.version || "v0.9.0-rc"}
                  </span>
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  End-to-End Enterprise Microservice & Multi-Agent Data Plane Specification
                </p>
              </div>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-2 w-full md:w-auto bg-slate-950/80 border border-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveView("VISUAL")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeView === "VISUAL"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Interactive Data Flow
            </button>
            <button
              onClick={() => setActiveView("SUBSYSTEMS")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeView === "SUBSYSTEMS"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tier Catalog ({topology?.subsystems.length || 7})
            </button>
            <button
              onClick={() => setActiveView("MERMAID")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeView === "MERMAID"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Mermaid Blueprint
            </button>
          </div>
        </div>

        {/* Global Blueprint Metrics */}
        {topology && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                System Tiers
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-cyan-400">
                  {topology.subsystems.length}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  Architectural Layers
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono">
                Decoupled CQRS Topology
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Managed Micro-Nodes
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-emerald-400">
                  {totalNodesCount}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  Active Components
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono">
                Strict Boundary Isolation
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Directed Data Channels
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-amber-400">
                  {topology.edges.length}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  Async / Sync Edges
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono">
                Non-Blocking Hot Paths
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Topology Verification
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  {topology.status}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2 font-mono truncate" title={topology.trace_id}>
                Trace: {topology.trace_id.slice(0, 16)}...
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-300">
          ⚠️ {error}
        </div>
      )}

      {loading && !topology ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-sm animate-pulse">
          Compiling Institutional Architecture Topology Graph...
        </div>
      ) : (
        <>
          {/* VIEW MODE 1: VISUAL FLOWCHART & NODE INSPECTOR */}
          {activeView === "VISUAL" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Visual Flowchart Canvas */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
                  <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                    <span>⚡</span> End-to-End Enterprise Data Flow Path
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Click any node to inspect SLA specs
                  </span>
                </div>

                {/* Vertical Visual Flow Pipeline */}
                <div className="space-y-4">
                  {/* Step 1: Presentation Edge */}
                  <div className="bg-slate-950/60 border border-indigo-900/40 rounded-xl p-4 relative">
                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                      <span>Tier 1 · Presentation & Edge</span>
                      <span className="font-mono text-slate-500">HTTP/2 · WSS</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[0]?.nodes[0] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "client_ui"
                            ? "bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">🖥️ Trading Dashboard</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;16.6ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          React 19 Next.js 15 UI with WebSocket consumer
                        </p>
                      </div>

                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[0]?.nodes[1] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "bff_proxy"
                            ? "bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">🛡️ BFF Proxy Edge</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;15ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          Zero-trust HTTP cookie-to-bearer authentication bridge
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center text-slate-600 text-xs font-mono">
                    ↓ Zero-Trust Bearer Token · W3C Traceparent Header
                  </div>

                  {/* Step 2: Gateway & Ingestion */}
                  <div className="bg-slate-950/60 border border-emerald-900/40 rounded-xl p-4 relative">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                      <span>Tier 2 · Async Ingestion & Cache Guard</span>
                      <span className="font-mono text-slate-500">FastAPI ASGI</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[1]?.nodes[0] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "fastapi_gateway"
                            ? "bg-emerald-950/60 border-emerald-500 shadow-md shadow-emerald-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">⚡ FastAPI Gateway</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;25ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          Pydantic firewall, telemetry middleware, CQRS dispatcher
                        </p>
                      </div>

                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[5]?.nodes[1] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "redis_cache"
                            ? "bg-amber-950/60 border-amber-500 shadow-md shadow-amber-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">💾 Redis Cache-Aside</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;0.8ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          Write-through priming & SET NX EX stampede mutex
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center text-slate-600 text-xs font-mono">
                    ↓ XADD stream:intel_jobs · At-Least-Once Delivery
                  </div>

                  {/* Step 3: Message Broker & Workers */}
                  <div className="bg-slate-950/60 border border-purple-900/40 rounded-xl p-4 relative">
                    <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                      <span>Tier 3 & 4 · Redis Streams & Worker Daemon Pool</span>
                      <span className="font-mono text-slate-500">XREADGROUP · XAUTOCLAIM</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[2]?.nodes[0] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "redis_streams"
                            ? "bg-rose-950/60 border-rose-500 shadow-md shadow-rose-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">📬 Redis Streams Broker</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;1.5ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          PEL consumer groups, lag tracking, DLQ routing
                        </p>
                      </div>

                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[3]?.nodes[0] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "stream_consumer_worker"
                            ? "bg-purple-950/60 border-purple-500 shadow-md shadow-purple-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">⚙️ Stream Consumer Worker</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;500ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          Dynamic concurrency controller (3–10), crash self-healing
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center text-slate-600 text-xs font-mono">
                    ↓ Multi-Agent Invocation · Quantitative & Vector Query
                  </div>

                  {/* Step 4: Multi-Agent AI & Persistence */}
                  <div className="bg-slate-950/60 border border-blue-900/40 rounded-xl p-4 relative">
                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                      <span>Tier 5 & 6 · Multi-Agent Reasoning & Persistence</span>
                      <span className="font-mono text-slate-500">LangGraph · PostgreSQL · pgvector</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[4]?.nodes[0] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "langgraph_state_machine"
                            ? "bg-blue-950/60 border-blue-500 shadow-md shadow-blue-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">🧬 LangGraph</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;800ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          Qualitative + Quantitative deterministic signal fusion
                        </p>
                      </div>

                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[5]?.nodes[0] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "postgres_quant"
                            ? "bg-slate-800/80 border-cyan-500 shadow-md shadow-cyan-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">🏛️ PostgreSQL 16</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;20ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          SMA, EMA, VWAP, RSI, Bollinger, Sharpe window math
                        </p>
                      </div>

                      <div
                        onClick={() => setSelectedNode(topology?.subsystems[4]?.nodes[1] || null)}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedNode?.id === "pgvector_search"
                            ? "bg-slate-800/80 border-cyan-500 shadow-md shadow-cyan-900/30"
                            : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">🔍 pgvector Store</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                            &lt;35ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          1536-dim HNSW cosine distance + lexical hybrid ranking
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center text-slate-600 text-xs font-mono">
                    ↓ Broadcast Monotonic Frames · Sub-millisecond Dispatch
                  </div>

                  {/* Step 5: WebSocket Real-Time Dispatch */}
                  <div className="bg-slate-950/60 border border-teal-900/40 rounded-xl p-4 relative">
                    <div className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                      <span>Tier 7 · Real-Time Telemetry & Dispatch Edge</span>
                      <span className="font-mono text-slate-500">RFC 6455 WSS</span>
                    </div>
                    <div
                      onClick={() => setSelectedNode(topology?.subsystems[6]?.nodes[0] || null)}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        selectedNode?.id === "websocket_manager"
                          ? "bg-teal-950/60 border-teal-500 shadow-md shadow-teal-900/30"
                          : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">📡 WebSocket Broadcast Manager</span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                          &lt;5.0ms
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Monotonic sequence enforcement, gap recovery, client circuit-breaker keep-alive
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Col: Node Specification Inspector */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="border-b border-slate-800 pb-3 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                      Component Inspector
                    </span>
                    <h3 className="text-base font-bold text-white mt-1">
                      {selectedNode ? selectedNode.name : "Select an Architecture Node"}
                    </h3>
                  </div>

                  {selectedNode ? (
                    <div className="space-y-4">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Parent Architectural Tier
                        </span>
                        <p className="text-xs font-bold text-cyan-400 mt-0.5 uppercase tracking-wide">
                          {selectedNode.subsystem} Tier
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Institutional Responsibility
                        </span>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                          {selectedNode.role}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Technology Stack & Runtime
                        </span>
                        <p className="text-xs font-mono text-indigo-300 mt-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                          {selectedNode.tech_stack}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Protocol</span>
                          <p className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                            {selectedNode.protocol}
                          </p>
                        </div>

                        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Latency SLA</span>
                          <p className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
                            &lt;{selectedNode.latency_sla_ms}ms
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      Click any component in the visual pipeline to review its institutional contract.
                    </p>
                  )}
                </div>

                {/* System Invariant Principles Box */}
                <div className="mt-6 pt-4 border-t border-slate-800/80 bg-slate-950/40 p-3.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🛡️</span> Zero-Regression Invariant
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                    Quantitative mathematics execute exclusively in PostgreSQL. LLM reasoning never calculates financial indicators.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: SUBSYSTEM CATALOG */}
          {activeView === "SUBSYSTEMS" && topology && (
            <div className="space-y-4">
              {topology.subsystems.map((sub: ArchitectureSubsystem, idx: number) => (
                <div
                  key={sub.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-cyan-400 font-bold">
                          [Tier 0{idx + 1}]
                        </span>
                        <h3 className="text-sm font-bold text-white tracking-wide">
                          {sub.title}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {sub.description}
                      </p>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {sub.nodes.length} Components
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {sub.nodes.map((node: ArchitectureNode) => (
                      <div
                        key={node.id}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-1.5"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-white">{node.name}</span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">
                            SLA: &lt;{node.latency_sla_ms}ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal">
                          {node.role}
                        </p>
                        <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-slate-500">
                          <span className="text-indigo-400">{node.tech_stack}</span>
                          <span className="text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded">
                            {node.protocol}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VIEW MODE 3: MERMAID CODE BLUEPRINT */}
          {activeView === "MERMAID" && topology && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                    <span>📜</span> Canonical Mermaid Architecture Specification
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live system graph definition exportable to Markdown, GitHub, and Excalidraw
                  </p>
                </div>

                <button
                  onClick={copyMermaidCode}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5"
                >
                  {copied ? "✓ Copied!" : "📋 Copy Mermaid Code"}
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-x-auto">
                <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                  {topology.mermaid_diagram}
                </pre>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
};
