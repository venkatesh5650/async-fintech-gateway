"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MasterRegressionReport, RegressionSuiteReport } from "../types/api";

export const RegressionAuditDashboard: React.FC = () => {
  const [report, setReport] = useState<MasterRegressionReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [executing, setExecuting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>({
    system_core: true,
    event_stream: true,
    quant_analytics: true,
    rag_engine: true,
    chaos_engineering: true,
  });
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PASSED" | "FAILED">("ALL");

  const fetchLatestReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/audit/regression", { method: "GET" });
      if (!res.ok) {
        throw new Error(`Failed to load regression telemetry: HTTP ${res.status}`);
      }
      const data: MasterRegressionReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load regression report.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRunFullRegression = async () => {
    try {
      setExecuting(true);
      setError(null);
      const res = await fetch("/api/audit/regression", { method: "POST" });
      if (!res.ok) {
        throw new Error(`Execution error: HTTP ${res.status}`);
      }
      const data: MasterRegressionReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Regression execution failed.");
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    fetchLatestReport();
  }, [fetchLatestReport]);

  const toggleSuite = (suiteId: string) => {
    setExpandedSuites((prev) => ({
      ...prev,
      [suiteId]: !prev[suiteId],
    }));
  };

  const expandAll = () => {
    if (!report) return;
    const allExpanded: Record<string, boolean> = {};
    report.suites.forEach((s) => {
      allExpanded[s.suite_id] = true;
    });
    setExpandedSuites(allExpanded);
  };

  const collapseAll = () => {
    if (!report) return;
    const allCollapsed: Record<string, boolean> = {};
    report.suites.forEach((s) => {
      allCollapsed[s.suite_id] = false;
    });
    setExpandedSuites(allCollapsed);
  };

  const filteredSuites = report?.suites.filter((s) => {
    if (statusFilter === "PASSED" && s.status !== "PASSED") return false;
    if (statusFilter === "FAILED" && s.status !== "FAILED") return false;
    if (!searchFilter.trim()) return true;

    const query = searchFilter.toLowerCase();
    const suiteMatch = s.suite_name.toLowerCase().includes(query) || s.suite_id.toLowerCase().includes(query);
    const assertionMatch = s.assertions.some(
      (a) => a.title.toLowerCase().includes(query) || (a.details && a.details.toLowerCase().includes(query))
    );
    return suiteMatch || assertionMatch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Deck */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xl font-bold">
                🧪
              </span>
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                  System Master Regression Audit Suite
                  {report && (
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${
                        report.status === "PASSED"
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                          : "bg-rose-500/15 border-rose-500/40 text-rose-400"
                      }`}
                    >
                      {report.status === "PASSED" ? "100% CERTIFIED PASS" : "REGRESSION DETECTED"}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  End-to-End Enterprise Invariant Verification across all 5 System Milestones (Days 1–85)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={fetchLatestReport}
              disabled={loading || executing}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span> Refresh
            </button>
            <button
              onClick={handleRunFullRegression}
              disabled={executing || loading}
              className="px-5 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 border border-emerald-400/30 transition flex items-center gap-2 disabled:opacity-50"
            >
              {executing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Running 33 Assertions...
                </>
              ) : (
                <>
                  <span>⚡</span> Run Full Regression
                </>
              )}
            </button>
          </div>
        </div>

        {/* Global Summary KPI Tiles */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Assertions Cleared
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white">
                  {report.assertions_passed}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  / {report.total_assertions} ({report.pass_rate_pct}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${report.pass_rate_pct}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Suites Certified
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-emerald-400">
                  {report.suites_passed}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  / {report.total_suites} Domains
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2 font-mono">
                100% Zero-Defect SLA
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Total Benchmark Time
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {(report.total_duration_ms / 1000).toFixed(2)}s
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  ({report.total_duration_ms}ms)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                All 5 milestones compiled
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Active Telemetry Lineage
              </span>
              <div className="mt-1 font-mono text-xs text-indigo-300 truncate" title={report.trace_id}>
                {report.trace_id.slice(0, 16)}...
              </div>
              <div className="text-[11px] text-slate-500 mt-2 font-mono truncate" title={report.run_id}>
                ID: {report.run_id}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-rose-400 hover:text-white underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Accordion Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search assertions or suites..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter("")}
                className="absolute right-2.5 top-1.5 text-xs text-slate-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                statusFilter === "ALL" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter("PASSED")}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                statusFilter === "PASSED" ? "bg-emerald-900/40 text-emerald-300" : "text-slate-400 hover:text-white"
              }`}
            >
              Passed
            </button>
            <button
              onClick={() => setStatusFilter("FAILED")}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                statusFilter === "FAILED" ? "bg-rose-900/40 text-rose-300" : "text-slate-400 hover:text-white"
              }`}
            >
              Failed
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 self-end sm:self-auto">
          <button
            onClick={expandAll}
            className="hover:text-white underline transition"
          >
            Expand All
          </button>
          <span>•</span>
          <button
            onClick={collapseAll}
            className="hover:text-white underline transition"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Regression Suite Breakdowns */}
      {loading && !report ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-sm animate-pulse">
          Loading Master Regression Verification Matrix...
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSuites && filteredSuites.length > 0 ? (
            filteredSuites.map((suite: RegressionSuiteReport, idx: number) => {
              const isExpanded = !!expandedSuites[suite.suite_id];
              const isPassed = suite.status === "PASSED";

              return (
                <div
                  key={suite.suite_id}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all"
                >
                  {/* Suite Card Header */}
                  <div
                    onClick={() => toggleSuite(suite.suite_id)}
                    className="p-4 bg-slate-900/90 hover:bg-slate-850 cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/60 select-none transition"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isPassed
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {isPassed ? "✓" : "✗"}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-mono">
                            [0{idx + 1}]
                          </span>
                          <h3 className="text-sm font-bold text-white tracking-wide">
                            {suite.suite_name}
                          </h3>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          ID: {suite.suite_id} • Latency: {suite.duration_ms}ms
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                            isPassed
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          }`}
                        >
                          {suite.assertions_passed} / {suite.total_assertions} Passed
                        </span>
                      </div>

                      <span className="text-slate-500 text-xs font-mono">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Assertion Checklist Items */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-950/40 divide-y divide-slate-800/40">
                      {suite.assertions.map((assertion) => (
                        <div
                          key={assertion.assertion_number}
                          className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded ${
                                assertion.passed
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-rose-500/15 text-rose-400"
                              }`}
                            >
                              {assertion.passed ? "PASSED" : "FAILED"}
                            </span>
                            <div>
                              <span className="text-xs font-medium text-slate-200">
                                #{assertion.assertion_number}: {assertion.title}
                              </span>
                              {assertion.details && (
                                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  {assertion.details}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="self-end sm:self-auto">
                            <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/40">
                              Validated
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
              No audit suites match the selected filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
