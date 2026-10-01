"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  GrafanaDashboardSpec,
  SloStatusReport,
  AlertDispatchTestResponse,
} from "../types/api";

export function GrafanaDashboardSpecPanel() {
  const [dashboardSpec, setDashboardSpec] = useState<GrafanaDashboardSpec | null>(null);
  const [sloReport, setSloReport] = useState<SloStatusReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [selectedAlertToTest, setSelectedAlertToTest] = useState<string>("P99LatencyBreach");
  const [testResult, setTestResult] = useState<AlertDispatchTestResponse | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"slos" | "panels" | "alerts" | "json">("slos");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [specRes, sloRes] = await Promise.all([
        fetch("/api/cloud/grafana/spec", { cache: "no-store" }),
        fetch("/api/cloud/slo/status", { cache: "no-store" }),
      ]);

      if (!specRes.ok || !sloRes.ok) {
        throw new Error("Failed fetching Grafana specifications or SLO status");
      }

      const specData: GrafanaDashboardSpec = await specRes.json();
      const sloData: SloStatusReport = await sloRes.json();

      setDashboardSpec(specData);
      setSloReport(sloData);
      setError(null);
    } catch (err: any) {
      console.error("Failed loading Grafana/SLO data:", err);
      setError(err?.message || "Failed to load Grafana dashboard and SLO telemetry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleTestAlert = async () => {
    setDispatching(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cloud/alerts/test-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_name: selectedAlertToTest,
          severity: selectedAlertToTest.includes("Starvation") || selectedAlertToTest.includes("HighHttp") ? "CRITICAL" : "WARNING",
          message: `Manual test drill for alert '${selectedAlertToTest}' triggered via Operations Console.`,
        }),
      });
      if (!res.ok) throw new Error(`Dispatch failed HTTP ${res.status}`);
      const data: AlertDispatchTestResponse = await res.json();
      setTestResult(data);
      setTimeout(() => setTestResult(null), 5000);
    } catch (err: any) {
      setError(err?.message || "Alert dispatch test failed");
    } finally {
      setDispatching(false);
    }
  };

  const handleCopyJson = () => {
    if (!dashboardSpec) return;
    navigator.clipboard.writeText(JSON.stringify(dashboardSpec, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-mono text-xl shadow-inner">
                📈
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white tracking-wide">
                    Grafana Dashboards & SRE SLI/SLO Specifications
                  </h2>
                  <span className="px-2.5 py-0.5 text-xs font-mono font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    SLO COMPLIANCE {sloReport ? `${sloReport.overall_compliance_score.toFixed(0)}%` : "100%"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  UID: <code className="text-orange-300 font-mono">fintech-gateway-core</code> · 4 Golden Signals JSON Model, Error Budget Burn Rates & Prometheus Alert Rules
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-1.5"
            >
              🔄 Refresh
            </button>

            <button
              onClick={handleCopyJson}
              className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30 hover:border-orange-500/50 transition-all flex items-center gap-1.5"
            >
              {copySuccess ? "✓ Copied JSON!" : "📋 Copy Grafana JSON"}
            </button>

            <button
              onClick={handleTestAlert}
              disabled={dispatching}
              className="px-3.5 py-1.5 text-xs font-mono font-medium rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-lg shadow-orange-600/20 border border-orange-400/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              🚨 Dispatch Test Alert
            </button>
          </div>
        </div>

        {testResult && (
          <div className="mt-3 text-xs font-mono px-3.5 py-2 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 animate-fadeIn flex items-center justify-between">
            <span>
              ✓ Dispatched simulated alert <strong>{testResult.alert_name}</strong> to: {testResult.dispatched_to.join(", ")}
            </span>
            <span className="text-[10px] text-emerald-400/80">HTTP 200 OK</span>
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs font-mono px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800/50 text-rose-300">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Main Tabbed Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => setActiveTab("slos")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "slos"
                  ? "bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🎯 SRE SLI/SLO Agreements ({sloReport?.slos.length || 4})
            </button>
            <button
              onClick={() => setActiveTab("panels")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "panels"
                  ? "bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📊 4 Golden Signals Panels ({dashboardSpec?.panels.length || 6})
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "alerts"
                  ? "bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🔔 Prometheus Alert Rules ({sloReport?.alert_rules.length || 4})
            </button>
            <button
              onClick={() => setActiveTab("json")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "json"
                  ? "bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📄 Raw Dashboard JSON Spec
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">Target Drill:</span>
            <select
              value={selectedAlertToTest}
              onChange={(e) => setSelectedAlertToTest(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="P99LatencyBreach">P99LatencyBreach (Warning)</option>
              <option value="HighHttpErrorRate">HighHttpErrorRate (Critical)</option>
              <option value="RedisStreamQueueLagHigh">RedisStreamQueueLagHigh (Warning)</option>
              <option value="AsgiEventLoopStarvation">AsgiEventLoopStarvation (Critical)</option>
            </select>
          </div>
        </div>

        {/* Tab 1: SRE SLI/SLO Agreements Matrix */}
        {activeTab === "slos" && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sloReport?.slos.map((slo, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white font-mono">{slo.name}</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${
                          slo.status === "COMPLIANT"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : slo.status === "WARNING"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        }`}
                      >
                        {slo.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">{slo.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-4 gap-2 text-xs font-mono">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Target</div>
                      <div className="text-slate-300 font-semibold">{slo.target}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Current</div>
                      <div className="text-orange-400 font-bold">{slo.current_value}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Error Budget</div>
                      <div className="text-cyan-400 font-semibold">{slo.error_budget_remaining_pct}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">1h Burn Rate</div>
                      <div className="text-amber-400 font-semibold">{slo.burn_rate_1h}x</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: 4 Golden Signals Panels */}
        {activeTab === "panels" && (
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboardSpec?.panels.map((panel) => (
                <div
                  key={panel.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-semibold text-slate-300">
                        Panel #{panel.id}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-orange-400 border border-slate-700">
                        {panel.type}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white font-mono">{panel.title}</h3>
                  </div>

                  <div className="mt-3 bg-slate-900/90 border border-slate-800 rounded p-2.5 space-y-1.5 font-mono text-[11px]">
                    <div className="text-slate-500 text-[10px] uppercase">PromQL Target:</div>
                    <div className="text-emerald-400 break-all bg-black/40 p-1.5 rounded border border-slate-800/80">
                      {panel.targets[0]?.expr || "—"}
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[10px] pt-1">
                      <span>Unit: <strong className="text-slate-300">{panel.options.unit || "none"}</strong></span>
                      <span>Grid: <strong className="text-slate-300">W:{panel.gridPos.w} H:{panel.gridPos.h}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Prometheus Alerting Rules */}
        {activeTab === "alerts" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Alert Name</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">For Duration</th>
                  <th className="py-2.5 px-3">PromQL Trigger Expression</th>
                  <th className="py-2.5 px-4">Remediation Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sloReport?.alert_rules.map((rule, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">
                      {rule.alert}
                      <div className="text-[10px] text-slate-400 font-normal">{rule.summary}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rule.severity === "CRITICAL"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-300">{rule.for}</td>
                    <td className="py-3 px-3 text-emerald-400 break-all max-w-xs">
                      <code>{rule.expr}</code>
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-sm">
                      {rule.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Raw Grafana JSON Spec */}
        {activeTab === "json" && (
          <div className="p-4">
            <pre className="text-xs font-mono bg-slate-950 p-4 rounded-lg text-orange-300 overflow-x-auto max-h-[500px] border border-slate-800 leading-relaxed">
              {dashboardSpec ? JSON.stringify(dashboardSpec, null, 2) : "// Loading Grafana specification..."}
            </pre>
          </div>
        )}
      </div>

      {/* Footer Metadata */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-500 px-1">
        <div>
          W3C Trace Lineage: <code className="text-orange-400">{sloReport?.trace_id || dashboardSpec?.trace_id || "—"}</code>
        </div>
        <div>
          Dashboard UID: <code className="text-slate-300">{dashboardSpec?.uid || "fintech-gateway-core"}</code> · Grafana Schema v{dashboardSpec?.schemaVersion || 38}
        </div>
      </div>
    </div>
  );
}

export default GrafanaDashboardSpecPanel;
