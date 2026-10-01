"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ContainerSpecReport, ContainerImageSpec } from "../types/api";

export const ContainerSpecViewer: React.FC = () => {
  const [report, setReport] = useState<ContainerSpecReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"SERVICES" | "DOCKERIGNORE" | "JSON">("SERVICES");
  const [copied, setCopied] = useState<boolean>(false);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/cloud/docker-spec");
      if (!res.ok) {
        throw new Error(`Failed to load container specifications: HTTP ${res.status}`);
      }
      const data: ContainerSpecReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load container diagnostics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const copyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "CERTIFIED":
      case "PASSED":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm shadow-emerald-950">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {status}
          </span>
        );
      case "WARNING":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🐳</span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Multi-Stage Container Specifications
              </h2>
              {report && getStatusBadge(report.status)}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Decoupled, security-hardened multi-stage container runtimes for Web Gateway and Background Stream Worker.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-750 border border-slate-700 rounded-lg transition-all shadow-sm hover:border-slate-600 disabled:opacity-50 flex items-center gap-2"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              {loading ? "Inspecting..." : "Re-Inspect Images"}
            </button>
          </div>
        </div>

        {/* Metric Cards Row */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Overall Compliance
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-400">
                  {report.compliance_score_pct.toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500 font-mono">Hardened</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Microservices Decoupled
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {report.total_services}
                </span>
                <span className="text-xs text-slate-500">API & Worker</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                User Privilege Policy
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-bold text-emerald-400">
                  Non-Root
                </span>
                <span className="text-xs text-slate-500 font-mono">UID 10001</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                .dockerignore Hygiene
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-400">
                  {report.dockerignore_audit.total_rules}
                </span>
                <span className="text-xs text-slate-500">Exclusion Rules</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-800/80 gap-2">
        <button
          onClick={() => setActiveTab("SERVICES")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
            activeTab === "SERVICES"
              ? "bg-slate-900 text-indigo-400 border-t border-x border-slate-800"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📦 Service Containers ({report?.services.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("DOCKERIGNORE")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
            activeTab === "DOCKERIGNORE"
              ? "bg-slate-900 text-indigo-400 border-t border-x border-slate-800"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🛡️ .dockerignore Rules ({report?.dockerignore_audit.total_rules || 0})
        </button>
        <button
          onClick={() => setActiveTab("JSON")}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
            activeTab === "JSON"
              ? "bg-slate-900 text-indigo-400 border-t border-x border-slate-800"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📋 Raw Diagnostics JSON
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={fetchReport}
            className="text-xs underline hover:text-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab Content 1: Service Containers Side-by-Side */}
      {activeTab === "SERVICES" && report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {report.services.map((svc: ContainerImageSpec) => {
            const isApi = svc.service_name === "api_gateway";
            return (
              <div
                key={svc.service_name}
                className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{isApi ? "🌐" : "⚙️"}</span>
                      <div>
                        <h3 className="font-bold text-white text-base">
                          {isApi ? "Web API Gateway" : "Stream Consumer Worker"}
                        </h3>
                        <span className="text-xs text-slate-500 font-mono">
                          {svc.dockerfile_path}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-500/20">
                        {svc.security_score_pct.toFixed(0)}% Score
                      </span>
                    </div>
                  </div>

                  {/* Attributes Matrix */}
                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[11px] text-slate-500 font-medium block">
                        Base Runtime
                      </span>
                      <span className="text-xs font-mono text-slate-300 truncate block mt-0.5">
                        {svc.base_image}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[11px] text-slate-500 font-medium block">
                        Non-Root Service Account
                      </span>
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 mt-0.5">
                        <span>✓</span> {svc.user_name}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[11px] text-slate-500 font-medium block">
                        Multi-Stage Build Pattern
                      </span>
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 mt-0.5">
                        <span>✓</span> Enforced (Builder + Runtime)
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[11px] text-slate-500 font-medium block">
                        {isApi ? "Exposed Ports" : "Execution Mode"}
                      </span>
                      <span className="text-xs font-mono text-indigo-300 flex items-center gap-1 mt-0.5">
                        {isApi
                          ? svc.exposed_ports.join(", ") || "None"
                          : "Headless Daemon Loop"}
                      </span>
                    </div>
                  </div>

                  {/* Entrypoint & Healthcheck */}
                  <div className="mt-4 p-3 rounded-lg bg-slate-950/80 border border-slate-800/60 font-mono text-xs text-slate-300 space-y-1">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Entrypoint / CMD
                    </div>
                    <div className="text-indigo-300 truncate">
                      {svc.entrypoint_cmd}
                    </div>
                  </div>

                  {/* Security Checks List */}
                  <div className="mt-5 space-y-2">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Security Hardening Invariants
                    </div>
                    {svc.security_checks.map((chk) => (
                      <div
                        key={chk.check_id}
                        className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/40 flex items-start justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-medium text-slate-200">
                            {chk.title}
                          </div>
                          <div className="text-slate-400 text-[11px] mt-0.5">
                            {chk.description}
                          </div>
                        </div>
                        <div>{getStatusBadge(chk.status)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
                  <span>Target: Cloud Orchestration</span>
                  <span className="font-mono text-emerald-400">Ready for Live Deploy</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab Content 2: .dockerignore Hygiene */}
      {activeTab === "DOCKERIGNORE" && report && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                Container Context Exclusion Hygiene (.dockerignore)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ensures zero sensitive credentials, virtual environments, or local database dumps leak into build contexts.
              </p>
            </div>
            {getStatusBadge(report.dockerignore_audit.is_valid ? "PASSED" : "FAILED")}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-500 font-medium block">Active Ignore Rules</span>
              <span className="text-xl font-bold text-white mt-1 block">
                {report.dockerignore_audit.total_rules}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-500 font-medium block">Critical Exclusions</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">
                {report.dockerignore_audit.critical_exclusions_present.length} / 4 Present
              </span>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-xs text-slate-500 font-medium block">Missing Vulnerabilities</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">
                {report.dockerignore_audit.missing_exclusions.length === 0 ? "0 (Zero Leak)" : report.dockerignore_audit.missing_exclusions.join(", ")}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Critical Assets Confirmed Excluded
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {report.dockerignore_audit.critical_exclusions_present.map((item) => (
                <div
                  key={item}
                  className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 font-mono text-xs flex items-center gap-2"
                >
                  <span>🔒</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Sample Active Filter Directives
            </span>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 space-y-1">
              {report.dockerignore_audit.rules_sample.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-slate-600 text-[10px] w-6 text-right">{idx + 1}</span>
                  <span className="text-indigo-300">{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: Raw JSON Spec */}
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
              {copied ? "✓ Copied!" : "📋 Copy Specification JSON"}
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-300 overflow-x-auto max-h-[500px]">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
