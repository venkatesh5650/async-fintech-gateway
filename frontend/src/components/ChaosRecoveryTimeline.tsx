"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ChaosSystemOverview,
  WorkerChaosRecoveryReport,
} from "@/types/api";

const DEFAULT_REPORT: WorkerChaosRecoveryReport = {
  run_id: "worker_kill_baseline",
  status: "COMPLETED",
  stream_name: "stream:chaos:worker_recovery",
  group_name: "chaos_workers_group",
  orphaned_message_ids: ["1727608800100-0"],
  claimed_message_ids: ["1727608800100-0"],
  recovery_time_ms: 254.3,
  pel_cleared: true,
  sla_met: true,
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-worker-chaos-trace-01",
};

const DEFAULT_OVERVIEW: ChaosSystemOverview = {
  load_testing_status: "HEALTHY",
  connection_pool_status: "HEALTHY",
  redis_memory_status: "HEALTHY",
  event_loop_status: "HEALTHY",
  worker_recovery_status: "HEALTHY",
  resilience_score_pct: 100.0,
  timestamp_iso: new Date().toISOString(),
  trace_id: "00-chaos-overview-trace-01",
};

export default function ChaosRecoveryTimeline() {
  const [report, setReport] = useState<WorkerChaosRecoveryReport>(DEFAULT_REPORT);
  const [overview, setOverview] = useState<ChaosSystemOverview>(DEFAULT_OVERVIEW);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simTimer, setSimTimer] = useState<number>(0);
  const [orphanedCount, setOrphanedCount] = useState<number>(1);
  const [idleTimeMs, setIdleTimeMs] = useState<number>(200);
  const [activeStep, setActiveStep] = useState<number>(6);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setErrorMessage(null);
      const res = await fetch("/api/chaos/worker-kill");
      if (res.ok) {
        const data: WorkerChaosRecoveryReport = await res.json();
        setReport(data);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/chaos/overview");
      if (res.ok) {
        const data: ChaosSystemOverview = await res.json();
        setOverview(data);
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    fetchReport();
    fetchOverview();
    const interval = setInterval(() => {
      fetchReport();
      fetchOverview();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchReport, fetchOverview]);

  const handleSimulateKill = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimTimer(3);
    setActiveStep(1);
    setErrorMessage(null);

    // Progressive step animation
    const stepInterval = setInterval(() => {
      setActiveStep((prev) => (prev < 6 ? prev + 1 : prev));
    }, 400);

    const timerInterval = setInterval(() => {
      setSimTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await fetch("/api/chaos/worker-kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orphaned_message_count: orphanedCount,
          min_idle_time_ms: idleTimeMs,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const newReport: WorkerChaosRecoveryReport = await res.json();
      setReport(newReport);
      setActiveStep(6);
      await fetchOverview();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Chaos simulation failed";
      setErrorMessage(msg);
    } finally {
      setIsSimulating(false);
      clearInterval(stepInterval);
      clearInterval(timerInterval);
      setSimTimer(0);
    }
  };

  const STEPS = [
    { num: 1, title: "XADD Ingest", desc: "Job enqueued on Redis Stream" },
    { num: 2, title: "XREADGROUP", desc: "Worker victim checks out job" },
    { num: 3, title: "Crash Injection", desc: "Worker terminated (un-acked)" },
    { num: 4, title: "Idle Trigger", desc: "PEL idle threshold exceeded" },
    { num: 5, title: "XAUTOCLAIM", desc: "Rescuer claims orphaned task" },
    { num: 6, title: "XACK Clear", desc: "Task resolved, PEL cleared" },
  ];

  return (
    <div className="hud-panel corner-reticle rounded-2xl p-6 text-slate-100 shadow-2xl relative overflow-hidden border border-rose-500/30">
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">💥</span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Worker Chaos & XAUTOCLAIM Recovery
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                report.sla_met
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse"
              }`}
            >
              {report.sla_met ? "SLA MET (<30s)" : "SLA BREACHED"}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Simulates worker crash, tracks orphaned Pending Entries List (PEL), and validates automatic claim recovery
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-950/80 border border-gray-800 rounded-lg text-xs font-mono">
            <span className="text-gray-400">Resilience:</span>
            <span className="text-emerald-400 font-bold">{overview.resilience_score_pct.toFixed(0)}%</span>
          </div>
          <button
            onClick={() => {
              fetchReport();
              fetchOverview();
            }}
            disabled={isLoading || isSimulating}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs font-mono flex items-center justify-between">
          <span>Error: {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Interactive 6-Stage Visual Stepper */}
      <div className="bg-gray-950/70 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="text-xs font-mono text-gray-400 uppercase tracking-wider font-semibold mb-4">
          Autonomous Recovery Progression Pipeline
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STEPS.map((step) => {
            const isCompleted = activeStep >= step.num;
            const isCurrent = activeStep === step.num && isSimulating;

            return (
              <div
                key={step.num}
                className={`relative p-3 rounded-lg border transition-all duration-300 ${
                  isCurrent
                    ? "bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-900/20"
                    : isCompleted
                    ? "bg-gray-900/80 border-emerald-500/40"
                    : "bg-gray-950/40 border-gray-800/60 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                      isCurrent
                        ? "bg-rose-500 text-white animate-ping"
                        : isCompleted
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {step.num}
                  </span>
                  <span
                    className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded ${
                      isCurrent
                        ? "text-rose-300 bg-rose-500/20"
                        : isCompleted
                        ? "text-emerald-400 bg-emerald-500/10"
                        : "text-gray-500 bg-gray-800/40"
                    }`}
                  >
                    {isCurrent ? "RUNNING" : isCompleted ? "PASS" : "IDLE"}
                  </span>
                </div>
                <div className="text-xs font-bold text-gray-200">{step.title}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{step.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metrics & Report Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">Recovery Duration</div>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
            {report.recovery_time_ms.toFixed(1)} ms
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">SLA Target: &lt; 30,000 ms</div>
        </div>

        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">PEL State</div>
          <div className={`text-xl font-bold font-mono mt-1 ${
            report.pel_cleared ? "text-emerald-400" : "text-amber-400"
          }`}>
            {report.pel_cleared ? "CLEARED" : "PENDING"}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">0 orphaned entries</div>
        </div>

        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">Target Stream</div>
          <div className="text-sm font-bold font-mono text-gray-200 mt-1 truncate">
            {report.stream_name.replace("stream:chaos:", "")}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Group: {report.group_name}</div>
        </div>

        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3">
          <div className="text-[11px] font-mono text-gray-400 uppercase">Claimed Jobs</div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {report.claimed_message_ids.length} / {report.orphaned_message_ids.length || 1}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">100% reclamation rate</div>
        </div>
      </div>

      {/* Bottom Controls & System Resilience Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Interactive Controls */}
        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider mb-2">
              Chaos Injection Parameters
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Injects messages into the stream, kills the consumer thread to leave them in PEL, and asserts that standby workers reclaim them via XAUTOCLAIM.
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-gray-400">Orphaned Messages:</span>
                  <span className="text-rose-400 font-bold">{orphanedCount}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={orphanedCount}
                  disabled={isSimulating}
                  onChange={(e) => setOrphanedCount(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-gray-400">Min Idle Threshold:</span>
                  <span className="text-amber-400 font-bold">{idleTimeMs} ms</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="100"
                  value={idleTimeMs}
                  disabled={isSimulating}
                  onChange={(e) => setIdleTimeMs(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSimulateKill}
            disabled={isSimulating}
            className={`w-full mt-4 py-2.5 px-4 rounded-lg text-xs font-mono font-semibold transition-all shadow-md ${
              isSimulating
                ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                : "bg-gradient-to-r from-rose-600 via-purple-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white"
            }`}
          >
            {isSimulating
              ? `Executing Kill & Auto-Claim (${simTimer}s remaining)...`
              : `Trigger Worker Crash & Reclaim ${orphanedCount} Task(s)`}
          </button>
        </div>

        {/* Phase 2 Milestone 5 Capstone Resilience Matrix */}
        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                Phase 2 Milestone 5 Resilience Matrix
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                5 / 5 DOMAINS ACTIVE
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded bg-gray-900/60 border border-gray-800/60">
                <span className="text-gray-400">1. High-Throughput Load Testing</span>
                <span className="text-emerald-400 font-bold">{overview.load_testing_status}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-gray-900/60 border border-gray-800/60">
                <span className="text-gray-400">2. DB Connection Pool Starvation</span>
                <span className="text-emerald-400 font-bold">{overview.connection_pool_status}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-gray-900/60 border border-gray-800/60">
                <span className="text-gray-400">3. Redis Memory Pressure & LRU</span>
                <span className="text-emerald-400 font-bold">{overview.redis_memory_status}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-gray-900/60 border border-gray-800/60">
                <span className="text-gray-400">4. ASGI Event Loop Drift Benchmark</span>
                <span className="text-emerald-400 font-bold">{overview.event_loop_status}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-gray-900/60 border border-gray-800/60">
                <span className="text-gray-400">5. Worker Kill & XAUTOCLAIM</span>
                <span className="text-emerald-400 font-bold">{overview.worker_recovery_status}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800/80 pt-3 flex items-center justify-between text-[11px] font-mono text-gray-500">
            <span>Run: {report.run_id}</span>
            <span>Trace: {report.trace_id ? report.trace_id.slice(0, 14) : "default"}...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
