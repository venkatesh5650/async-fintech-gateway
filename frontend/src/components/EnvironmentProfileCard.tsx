"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  EnvironmentAuditReport,
  SecurityCheckItem,
  SecretRedactionItem,
} from "../types/api";

export const EnvironmentProfileCard: React.FC = () => {
  const [report, setReport] = useState<EnvironmentAuditReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"CHECKS" | "SECRETS" | "JSON">("CHECKS");
  const [copied, setCopied] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const fetchAuditReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/cloud/env-audit");
      if (!res.ok) {
        throw new Error(`Environment audit API returned HTTP ${res.status}`);
      }
      const data: EnvironmentAuditReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load environment audit.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditReport();
  }, [fetchAuditReport]);

  const copyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getProfileBadge = (profile: string) => {
    switch (profile.toUpperCase()) {
      case "PRODUCTION":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            PRODUCTION
          </span>
        );
      case "STAGING":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-950 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            STAGING
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-sky-950 text-sky-400 border border-sky-500/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            DEVELOPMENT
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PASS":
      case "CERTIFIED":
      case "SECURE":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
            {status}
          </span>
        );
      case "WARN":
      case "REQUIRES_HARDENING":
      case "DEFAULT_WARNING":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950/80 text-amber-400 border border-amber-500/30">
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-500/30">
            {status}
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "SECRETS":
        return "bg-purple-950/80 text-purple-400 border-purple-500/30";
      case "DATABASE":
        return "bg-cyan-950/80 text-cyan-400 border-cyan-500/30";
      case "CORS":
        return "bg-indigo-950/80 text-indigo-400 border-indigo-500/30";
      case "TRANSPORT":
        return "bg-sky-950/80 text-sky-400 border-sky-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  const filteredChecks = report?.checks.filter((c) =>
    categoryFilter === "ALL" ? true : c.category === categoryFilter
  ) || [];

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900 border border-slate-800 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Multi-Environment Promotion Engine & Zero-Leak Redaction
              </h2>
              {report && getProfileBadge(report.profile)}
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Zero-trust environment verification: enforcing non-default secrets, SSL transports, CORS whitelisting, and zero secret entropy leakage.
            </p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={() => fetchAuditReport()}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-2 shadow"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              Audit Environment
            </button>

            <div className="border-l border-slate-800 pl-3 flex gap-1">
              <button
                onClick={() => setActiveTab("CHECKS")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  activeTab === "CHECKS"
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Invariants ({report?.total_checks_count || 10})
              </button>
              <button
                onClick={() => setActiveTab("SECRETS")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  activeTab === "SECRETS"
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Zero-Leak Ledger
              </button>
              <button
                onClick={() => setActiveTab("JSON")}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  activeTab === "JSON"
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                JSON Spec
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
              <span>Status: </span>
              {getStatusBadge(report.status)}
            </div>
            <div>
              <span>Trace ID: </span>
              <span className="text-cyan-400 font-semibold">{report.trace_id}</span>
            </div>
            <div>
              <span>Audit Timestamp: </span>
              <span className="text-slate-300">
                {new Date(report.timestamp_iso).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Error Notification */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchAuditReport()}
            className="text-xs bg-rose-900/60 hover:bg-rose-800 px-3 py-1 rounded text-white font-medium"
          >
            Retry Audit
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
      {report && (
        <>
          {/* Top Metrics Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Compliance Score Card */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Security Compliance Score
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-extrabold text-white">
                    {report.compliance_score_pct.toFixed(1)}%
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">
                    10-Point Institutional SLA
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      report.compliance_score_pct >= 90
                        ? "bg-emerald-500"
                        : report.compliance_score_pct >= 70
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(100, report.compliance_score_pct)}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs font-mono">
                <span className="text-slate-400">Readiness Assessment:</span>
                <span className="font-semibold text-slate-200">{report.status}</span>
              </div>
            </div>

            {/* Invariant Verification Card */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Perimeter Invariant Guards
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-extrabold text-cyan-400">
                    {report.total_checks_passed} / {report.total_checks_count}
                  </span>
                  <span className="text-xs font-mono text-slate-400">Checks Passed</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Guarantees secrets entropy, connection isolation, and non-root execution.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs font-mono">
                <span className="text-slate-400">Categories:</span>
                <span className="text-slate-300">Secrets, DB, CORS, Transport</span>
              </div>
            </div>

            {/* Perimeter Isolation Card */}
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Perimeter Security Controls
                </span>
                <div className="mt-2 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">SSL/TLS Transport:</span>
                    <span
                      className={
                        report.ssl_required ? "text-emerald-400 font-bold" : "text-slate-300"
                      }
                    >
                      {report.ssl_required ? "ENFORCED" : "INTERNAL NETWORK"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">CORS Whitelist:</span>
                    <span className="text-cyan-400 font-bold">
                      {report.allowed_origins.length} Explicit Domain(s)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Wildcard '*' CORS:</span>
                    <span
                      className={
                        report.allowed_origins.includes("*")
                          ? "text-rose-400 font-bold"
                          : "text-emerald-400 font-bold"
                      }
                    >
                      {report.allowed_origins.includes("*") ? "DETECTED (INSECURE)" : "PROHIBITED"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs font-mono">
                <span className="text-slate-400">Redacted Secrets:</span>
                <span className="text-slate-200">{report.redacted_secrets.length} Vaulted</span>
              </div>
            </div>
          </div>

          {/* TAB 1: 10-Point Security Invariants Checklist */}
          {activeTab === "CHECKS" && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>📋</span> 10-Point Production Security Invariant Matrix
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Automated security gates evaluated prior to deploying into staging or production.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {["ALL", "SECRETS", "DATABASE", "CORS", "COMPUTE", "TRANSPORT"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition ${
                        categoryFilter === cat
                          ? "bg-indigo-500/30 text-indigo-300 border border-indigo-500/40"
                          : "text-slate-400 hover:text-slate-200 bg-slate-800/60"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {filteredChecks.map((item: SecurityCheckItem, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getCategoryBadge(
                            item.category
                          )}`}
                        >
                          {item.category}
                        </span>
                        <span className="text-sm font-bold text-slate-200">{item.name}</span>
                      </div>
                      <p className="text-xs text-slate-400">{item.description}</p>
                      {item.remediation && (
                        <p className="text-xs text-amber-400/90 font-mono mt-1">
                          💡 Remediation: {item.remediation}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">{getStatusBadge(item.status)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Zero-Leak Redacted Secrets Ledger */}
          {activeTab === "SECRETS" && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🔒</span> Zero-Leak Redacted Credentials Ledger
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Safe masked signatures and Shannon entropy metrics. Zero sensitive credential entropy is ever exposed.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {report.redacted_secrets.length} Credentials Vaulted
                </span>
              </div>

              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-semibold">CREDENTIAL KEY</th>
                      <th className="pb-3 font-semibold">STATUS</th>
                      <th className="pb-3 font-semibold">MASKED VALUE</th>
                      <th className="pb-3 font-semibold">SHANNON ENTROPY</th>
                      <th className="pb-3 font-semibold">SECURITY AUDIT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {report.redacted_secrets.map((sec: SecretRedactionItem) => (
                      <tr key={sec.key_name} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 font-bold text-slate-200">{sec.key_name}</td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              sec.is_configured
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {sec.is_configured ? "CONFIGURED" : "MISSING"}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className="px-2.5 py-1 rounded bg-slate-950 text-cyan-300 font-mono text-xs border border-slate-800 select-all">
                            {sec.masked_value}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300 font-semibold">
                              {sec.entropy_bits.toFixed(1)} bits
                            </span>
                            <span
                              className={`text-[10px] font-bold ${
                                sec.entropy_bits > 80
                                  ? "text-emerald-400"
                                  : sec.entropy_bits > 40
                                  ? "text-amber-400"
                                  : "text-slate-500"
                              }`}
                            >
                              {sec.entropy_bits > 80
                                ? "(High)"
                                : sec.entropy_bits > 40
                                ? "(Medium)"
                                : "(Low)"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3">{getStatusBadge(sec.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Raw JSON Inspector */}
          {activeTab === "JSON" && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📜</span> Machine-Readable Audit Report JSON
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
        </>
      )}
    </div>
  );
};
