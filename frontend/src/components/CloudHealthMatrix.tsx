"use client";

import React, { useState, useEffect, useCallback } from "react";
import { TieredHealthMatrixReport, SubsystemProbe } from "../types/api";

export const CloudHealthMatrix: React.FC = () => {
  const [report, setReport] = useState<TieredHealthMatrixReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"MATRIX" | "JSON">("MATRIX");

  const fetchHealthMatrix = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/cloud/health-probes");
      if (!res.ok) {
        throw new Error(`Health probe endpoint returned HTTP ${res.status}`);
      }
      const data: TieredHealthMatrixReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to query health probes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthMatrix();
  }, [fetchHealthMatrix]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchHealthMatrix();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealthMatrix]);

  const copyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = Math.floor(seconds % 60);
    if (mins < 60) return `${mins}m ${remainingSecs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  const getSubsystemIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case "postgresql":
        return "🐘";
      case "redis":
        return "⚡";
      case "pgvector":
        return "🧬";
      case "stream_worker":
        return "⚙️";
      default:
        return "🔌";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 border border-slate-800 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🩺</span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Cloud-Native Tiered Health Probes
              </h2>
              {report && (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    report.overall_status === "HEALTHY"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                      : report.overall_status === "DEGRADED"
                      ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                      : "bg-rose-950 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      report.overall_status === "HEALTHY"
                        ? "bg-emerald-400 animate-pulse"
                        : "bg-rose-400 animate-ping"
                    }`}
                  />
                  {report.overall_status}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Real-time Kubernetes / Render deployment probes: sub-5ms liveness, deep dependency readiness, and cold-start startup validation.
            </p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${
                autoRefresh
                  ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  autoRefresh ? "bg-emerald-400 animate-ping" : "bg-slate-500"
                }`}
              />
              Auto-poll (5s)
            </button>

            <button
              onClick={() => fetchHealthMatrix()}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-2 shadow"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              Refresh Probes
            </button>

            <div className="border-l border-slate-800 pl-3 flex gap-1">
              <button
                onClick={() => setViewMode("MATRIX")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  viewMode === "MATRIX"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setViewMode("JSON")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  viewMode === "JSON"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Inspect JSON
              </button>
            </div>
          </div>
        </div>

        {report && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-2">
            <div>
              <span>System: </span>
              <span className="text-slate-200">{report.system_name}</span>
            </div>
            <div>
              <span>Trace ID: </span>
              <span className="text-cyan-400 font-semibold">{report.trace_id}</span>
            </div>
            <div>
              <span>Sampled: </span>
              <span className="text-slate-300">
                {new Date(report.timestamp_iso).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchHealthMatrix()}
            className="text-xs bg-rose-900/60 hover:bg-rose-800 px-3 py-1 rounded text-white font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !report && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800" />
          <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800" />
          <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800" />
        </div>
      )}

      {/* Main Content */}
      {report && viewMode === "MATRIX" && (
        <div className="space-y-6">
          {/* Three Tiered Probes Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Liveness Probe Card */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    Liveness Probe
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                      report.liveness.status === "HEALTHY"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-950 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {report.liveness.status}
                  </span>
                </div>
                <div className="text-xl font-bold text-white mt-2 flex items-center gap-2">
                  <span>🟢</span>
                  <span>Process Live</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Kubernetes SLA: Restarts deadlocked ASGI containers immediately.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Process Uptime:</span>
                  <span className="text-emerald-400 font-semibold">
                    {formatUptime(report.liveness.uptime_seconds)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Event Loop Lag:</span>
                  <span
                    className={
                      report.liveness.event_loop_healthy
                        ? "text-emerald-400 font-semibold"
                        : "text-rose-400 font-semibold"
                    }
                  >
                    {report.liveness.event_loop_healthy ? "UNBLOCKED" : "STARVED"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Probe Endpoint:</span>
                  <span className="text-slate-300">GET /health/liveness</span>
                </div>
              </div>
            </div>

            {/* Readiness Probe Card */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    Readiness Probe
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                      report.readiness.status === "READY"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-950 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {report.readiness.status}
                  </span>
                </div>
                <div className="text-xl font-bold text-white mt-2 flex items-center gap-2">
                  <span>⚡</span>
                  <span>Traffic Ingress</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Ingress SLA: Gates client traffic if PostgreSQL or Redis is unreachable.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Probe Latency:</span>
                  <span className="text-cyan-400 font-semibold">
                    {report.readiness.total_latency_ms.toFixed(2)} ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Critical Subsystems:</span>
                  <span className="text-slate-200">
                    {report.readiness.subsystems.filter((s) => s.is_critical).length} Monitored
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Probe Endpoint:</span>
                  <span className="text-slate-300">GET /health/readiness</span>
                </div>
              </div>
            </div>

            {/* Startup Probe Card */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    Startup Probe
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                      report.startup.status === "INITIALIZED"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-950 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {report.startup.status}
                  </span>
                </div>
                <div className="text-xl font-bold text-white mt-2 flex items-center gap-2">
                  <span>🚀</span>
                  <span>Cold-Start Guard</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Cold-Start SLA: Grants 90s grace period for migration and table verification.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Database Schema:</span>
                  <span
                    className={
                      report.startup.schema_ready
                        ? "text-emerald-400 font-semibold"
                        : "text-rose-400 font-semibold"
                    }
                  >
                    {report.startup.schema_ready ? "SYNCHRONIZED" : "PENDING"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Verified Tables:</span>
                  <span className="text-cyan-400 font-semibold">
                    {report.startup.tables_found.length} Core Tables
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Probe Endpoint:</span>
                  <span className="text-slate-300">GET /health/startup</span>
                </div>
              </div>
            </div>
          </div>

          {/* Subsystems Deep Inspection Section */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🔍</span> Subsystem Dependency Matrix
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Individual health check probes executed concurrently across infrastructure dependencies.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {report.readiness.subsystems.length} Subsystems Monitored
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {report.readiness.subsystems.map((sub: SubsystemProbe) => (
                <div
                  key={sub.name}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{getSubsystemIcon(sub.name)}</span>
                      <div>
                        <span className="text-sm font-bold text-slate-200 capitalize">
                          {sub.name.replace("_", " ")}
                        </span>
                        {sub.is_critical && (
                          <span className="block text-[10px] font-mono text-rose-400/90 font-medium">
                            CRITICAL PATH
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                        sub.status === "HEALTHY"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-950 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {sub.status}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Probe Latency:</span>
                    <span
                      className={`font-semibold ${
                        sub.latency_ms < 50
                          ? "text-emerald-400"
                          : sub.latency_ms < 200
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {sub.latency_ms.toFixed(2)} ms
                    </span>
                  </div>

                  {sub.details && (
                    <div className="mt-2 text-[11px] font-mono text-slate-400 truncate bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {sub.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Database Verified Tables Section */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🗄️</span> Verified Storage Tables
            </h3>
            <p className="text-xs text-slate-400">
              Core relational and vector tables verified during the cold-start startup inspection:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {report.startup.tables_found.map((tbl) => (
                <span
                  key={tbl}
                  className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 flex items-center gap-2 shadow-inner"
                >
                  <span className="text-emerald-400">✓</span>
                  <span>{tbl}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* JSON Inspection Mode */}
      {report && viewMode === "JSON" && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📜</span> Raw Health Matrix JSON Payload
            </h3>
            <button
              onClick={copyJson}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-medium transition flex items-center gap-1.5"
            >
              <span>{copied ? "✓ Copied!" : "📋 Copy JSON"}</span>
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 text-slate-300 font-mono text-xs overflow-x-auto border border-slate-800 max-h-[500px]">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
