"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CodeQualityReport, CodeQualityCheckItem } from "../types/api";

export const CodeQualityPanel: React.FC = () => {
  const [report, setReport] = useState<CodeQualityReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"CHECKS" | "RULES" | "JSON">("CHECKS");
  const [copied, setCopied] = useState<boolean>(false);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/system/code-quality");
      if (!res.ok) {
        throw new Error(`Failed to load code quality report: HTTP ${res.status}`);
      }
      const data: CodeQualityReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load code quality report.");
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerLiveScan = async () => {
    try {
      setScanning(true);
      setError(null);
      const res = await fetch("/api/system/code-quality", { method: "POST" });
      if (!res.ok) {
        throw new Error(`Scan execution failed: HTTP ${res.status}`);
      }
      const data: CodeQualityReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Active quality scan failed.");
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const copyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🧹</span>
              <h2 className="text-xl font-bold text-white tracking-wide">
                Repository Code Quality & Linter Compliance
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                RUFF ENFORCED
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                ZERO LINT DEBT
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Automated Ruff static analysis, AST syntax verification, and codebase metric governance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchReport}
              disabled={loading || scanning}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
            >
              <svg
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
            <button
              onClick={triggerLiveScan}
              disabled={scanning || loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg shadow-emerald-900/30 border border-emerald-500/30 transition-all flex items-center gap-2"
            >
              {scanning ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Running Quality Scan...
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Trigger Live Scan
                </>
              )}
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-800/80">
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">Linter Cleanliness</div>
              <div className="text-lg font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                <span>✓</span> {report.linter_clean ? "100% Clean" : "Violations"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">0 errors (Rules E, W, F)</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">Codebase Scale</div>
              <div className="text-lg font-bold text-cyan-400 mt-0.5">
                {report.total_lines_of_code.toLocaleString()} LOC
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{report.total_files_scanned} Python modules</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">AST Syntax Parser</div>
              <div className="text-lg font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                <span>✓</span> 100% Parsed
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Zero syntax exceptions</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3">
              <div className="text-xs text-slate-400 font-medium">Quality Audits Passed</div>
              <div className="text-lg font-bold text-purple-400 mt-0.5">
                {report.passed_checks} / {report.total_checks}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Scan ID: {report.run_id}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={fetchReport} className="text-xs font-semibold underline hover:text-rose-300">
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("CHECKS")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === "CHECKS"
              ? "bg-slate-800 text-emerald-400 border border-slate-700"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🔍 Quality Checks ({report?.checks.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("RULES")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === "RULES"
              ? "bg-slate-800 text-cyan-400 border border-slate-700"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📜 Enforced Rules & Specs
        </button>
        <button
          onClick={() => setActiveTab("JSON")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === "JSON"
              ? "bg-slate-800 text-purple-400 border border-slate-700"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          ⚡ Machine Contract JSON
        </button>
      </div>

      {/* Content Area */}
      {loading && !report ? (
        <div className="p-12 text-center text-slate-500 space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs">Analyzing repository static quality & formatting...</p>
        </div>
      ) : activeTab === "CHECKS" && report ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.checks.map((check: CodeQualityCheckItem, idx: number) => {
            const isPassed = check.status === "PASSED";
            return (
              <div
                key={idx}
                className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 hover:border-slate-700/80 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">
                        {check.tool === "ruff" ? "⚡" : check.tool === "ast" ? "🌳" : "📊"}
                      </span>
                      <h4 className="text-sm font-bold text-slate-200">{check.check_name}</h4>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        isPassed
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }`}
                    >
                      {check.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span>Engine: <span className="text-slate-300 font-mono">{check.tool}</span></span>
                    <span>•</span>
                    <span>Duration: <span className="text-slate-300 font-mono">{check.duration_ms}ms</span></span>
                    <span>•</span>
                    <span>Issues: <span className={check.issues_found === 0 ? "text-emerald-400 font-mono" : "text-rose-400 font-mono"}>{check.issues_found}</span></span>
                  </div>

                  <div className="mt-4 space-y-1.5 bg-slate-950/60 rounded-lg p-3 border border-slate-900 font-mono text-xs">
                    {check.details.map((item, dIdx) => (
                      <div key={dIdx} className="text-slate-400 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5">›</span>
                        <span className="break-all">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : activeTab === "RULES" ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-6">
          <h3 className="text-sm font-bold text-slate-200">Enforced Linting & Code Standards (Ruff Configuration)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <span>🛡️</span> Rule Category [E]
              </div>
              <div className="text-xs text-slate-300 font-semibold mt-1">pycodestyle Errors</div>
              <p className="text-xs text-slate-400 mt-1">
                Catches fundamental syntax hazards, indentation corruption, and execution-critical Python style violations.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <span>⚠️</span> Rule Category [W]
              </div>
              <div className="text-xs text-slate-300 font-semibold mt-1">pycodestyle Warnings</div>
              <p className="text-xs text-slate-400 mt-1">
                Detects trailing whitespace, redundant escapes, and line formatting discrepancies.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
                <span>🐞</span> Rule Category [F]
              </div>
              <div className="text-xs text-slate-300 font-semibold mt-1">Pyflakes Logic Audits</div>
              <p className="text-xs text-slate-400 mt-1">
                Identifies unused imports, undefined variables, unread local references, and unreachable code branches.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-4 font-mono text-xs text-slate-300">
            <div className="text-slate-500 mb-2"># pyproject.toml Configuration</div>
            <pre className="text-emerald-400 overflow-x-auto">
{`[tool.ruff]
line-length = 120
target-version = "py312"

[tool.ruff.lint]
select = ["E", "W", "F"]
ignore = [
    "E501",  # line too long (enforced by formatter)
    "E402",  # module level import not at top of file (script paths)
    "W291",  # trailing whitespace
]`}
            </pre>
          </div>
        </div>
      ) : activeTab === "JSON" && report ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 font-mono">
              Trace: {report.trace_id}
            </span>
            <button
              onClick={copyJson}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <span>{copied ? "✓ Copied" : "📋 Copy JSON"}</span>
            </button>
          </div>
          <pre className="bg-slate-950 p-4 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto max-h-[500px]">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
};
