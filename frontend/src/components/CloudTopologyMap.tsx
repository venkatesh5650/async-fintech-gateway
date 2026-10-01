"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CloudTopologyReport, CloudResourceNode, CloudDependencyEdge } from "../types/api";

export const CloudTopologyMap: React.FC = () => {
  const [report, setReport] = useState<CloudTopologyReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"GRAPH" | "YAML" | "JSON">("GRAPH");
  const [copied, setCopied] = useState<boolean>(false);

  const fetchTopology = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/cloud/topology");
      if (!res.ok) {
        throw new Error(`Failed to load cloud topology: HTTP ${res.status}`);
      }
      const data: CloudTopologyReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load cloud topology.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  const copyYaml = () => {
    if (!report?.raw_yaml_spec) return;
    navigator.clipboard.writeText(report.raw_yaml_spec);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getProtocolBadge = (protocol: string) => {
    switch (protocol.toUpperCase()) {
      case "REDIS_STREAM":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-500/30">
            STREAM (XADD/XREAD)
          </span>
        );
      case "SQL":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
            POSTGRESQL + PGVECTOR
          </span>
        );
      case "HTTP":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
            HTTP REST / SSE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-950/80 text-indigo-400 border border-indigo-500/30">
            {protocol}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-sky-950/30 to-slate-900 border border-slate-800 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">☁️</span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Render Cloud Infrastructure & Dual-Service Topology
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm shadow-emerald-950">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ORCHESTRATED (render.yaml)
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Declarative Infrastructure-as-Code topology governing Web Gateway, Background Worker, Managed Redis 7, and PostgreSQL 15.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchTopology}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-750 border border-slate-700 rounded-lg transition-all shadow-sm hover:border-slate-600 disabled:opacity-50 flex items-center gap-2"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              {loading ? "Inspecting..." : "Re-Inspect Topology"}
            </button>
          </div>
        </div>

        {/* Metric Cards Row */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Compute Services
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-sky-400">
                  {report.total_services}
                </span>
                <span className="text-xs text-slate-500">API & Worker</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Managed Data Stores
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-indigo-400">
                  {report.total_datastores}
                </span>
                <span className="text-xs text-slate-500">Postgres + Redis</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Dependency Linkages
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-400">
                  {report.total_edges}
                </span>
                <span className="text-xs text-slate-500">Active Pipelines</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                IaC Specification
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-bold text-white font-mono">
                  {report.iac_spec_path}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-800/80 gap-2">
        <button
          onClick={() => setActiveTab("GRAPH")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
            activeTab === "GRAPH"
              ? "bg-slate-900 text-sky-400 border-t border-x border-slate-800"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🗺️ Topology Architecture Graph
        </button>
        <button
          onClick={() => setActiveTab("YAML")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
            activeTab === "YAML"
              ? "bg-slate-900 text-sky-400 border-t border-x border-slate-800"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📄 Infrastructure Manifest (render.yaml)
        </button>
        <button
          onClick={() => setActiveTab("JSON")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
            activeTab === "JSON"
              ? "bg-slate-900 text-sky-400 border-t border-x border-slate-800"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📋 Machine Schema JSON
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={fetchTopology}
            className="text-xs underline hover:text-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab Content 1: Visual Topology Graph & Resource Nodes */}
      {activeTab === "GRAPH" && report && (
        <div className="space-y-6">
          {/* Resource Nodes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {report.nodes.map((node: CloudResourceNode) => {
              const isWeb = node.resource_type === "web_service";
              const isWorker = node.resource_type === "background_worker";
              const isDb = node.resource_type === "managed_database";
              const isCache = node.resource_type === "managed_cache";

              const icon = isWeb ? "🌐" : isWorker ? "⚙️" : isDb ? "🐘" : "⚡";
              const typeColor = isWeb
                ? "text-sky-400 border-sky-500/20 bg-sky-950/40"
                : isWorker
                ? "text-purple-400 border-purple-500/20 bg-purple-950/40"
                : isDb
                ? "text-cyan-400 border-cyan-500/20 bg-cyan-950/40"
                : "text-rose-400 border-rose-500/20 bg-rose-950/40";

              return (
                <div
                  key={`${node.id}-${node.name}`}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{icon}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold border ${typeColor}`}>
                        {node.resource_type.replace("_", " ")}
                      </span>
                    </div>

                    <h3 className="font-bold text-white text-base mt-3">
                      {node.name}
                    </h3>
                    <span className="text-xs font-mono text-slate-500">
                      Tier: {node.plan.toUpperCase()} | Runtime: {node.runtime}
                    </span>

                    <div className="mt-4 space-y-2 text-xs">
                      {node.dockerfile_path && (
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-850 font-mono text-[11px] text-slate-300">
                          <span className="text-slate-500 block text-[10px]">DOCKERFILE</span>
                          {node.dockerfile_path}
                        </div>
                      )}
                      {node.health_check_path && (
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-850 font-mono text-[11px] text-emerald-400">
                          <span className="text-slate-500 block text-[10px]">HEALTHCHECK PATH</span>
                          {node.health_check_path}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>Auto-Deploy:</span>
                        <span className={node.auto_deploy ? "text-emerald-400 font-semibold" : "text-slate-500"}>
                          {node.auto_deploy ? "ENABLED" : "N/A"}
                        </span>
                      </div>
                      {node.env_vars_count > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Injected Env Vars:</span>
                          <span className="text-slate-200 font-mono font-semibold">
                            {node.env_vars_count} keys
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-mono">{node.id}</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {node.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interconnect Pipeline Edges */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Distributed Cloud Interconnect Pipelines
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  High-throughput message broker streaming and zero-trust transactional database channels.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {report.edges.length} Active Linkages
              </span>
            </div>

            <div className="space-y-3">
              {report.edges.map((edge: CloudDependencyEdge, idx: number) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-xs text-white font-bold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                      {edge.source_id}
                    </div>
                    <span className="text-sky-400 font-mono text-sm font-bold">
                      ───▶
                    </span>
                    <div className="font-mono text-xs text-white font-bold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                      {edge.target_id}
                    </div>
                  </div>

                  <div className="flex-1 md:px-4">
                    <div className="text-xs text-slate-300 font-medium">
                      {edge.purpose}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getProtocolBadge(edge.protocol)}
                    {edge.is_critical && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/60 text-amber-400 border border-amber-500/20">
                        CRITICAL SLA
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: Raw render.yaml Viewer */}
      {activeTab === "YAML" && report && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-slate-400">
              Manifest: <span className="text-sky-400">render.yaml</span>
            </div>
            <button
              onClick={copyYaml}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all"
            >
              {copied ? "✓ Copied!" : "📋 Copy YAML Manifest"}
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-300 overflow-x-auto max-h-[550px] leading-relaxed">
            {report.raw_yaml_spec}
          </pre>
        </div>
      )}

      {/* Tab Content 3: Machine JSON Spec */}
      {activeTab === "JSON" && report && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-slate-400">
              Trace ID: <span className="text-indigo-400">{report.trace_id}</span>
            </div>
            <button
              onClick={copyJson}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all"
            >
              {copied ? "✓ Copied!" : "📋 Copy JSON Specification"}
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-300 overflow-x-auto max-h-[550px]">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
