"use client";
import { useEffect, useState, useCallback } from "react";
import { JobAuditEntry, SystemAuditResponse } from "@/types/api";

// ─────────────────────────────────────────────────────────────────────────────
// Live Job Audit Panel
//
// Polls the /api/audit BFF proxy every POLL_INTERVAL_MS milliseconds and
// renders the live Redis job registry as an operational console.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const REFRESH_TICK_MS = 1000;

const EMPTY_STATE: SystemAuditResponse = {
  total_active_jobs: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  jobs: [],
  audit_timestamp_ms: 0,
};

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Processing
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Completed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Failed
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-gray-400 border border-gray-700">
      {status}
    </span>
  );
}

// ── Signal Badge ──────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal?: string }) {
  if (!signal) return <span className="text-gray-700 text-xs">—</span>;

  const styles: Record<string, string> = {
    BUY: "text-emerald-400 font-bold",
    SELL: "text-red-400 font-bold",
    HOLD: "text-amber-400 font-bold",
    INVALID: "text-gray-500",
  };

  return (
    <span className={`text-xs font-mono ${styles[signal] ?? "text-gray-400"}`}>
      {signal}
    </span>
  );
}

// ── Summary Counter ───────────────────────────────────────────────────────────

function SummaryCounter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-bold font-mono tabular-nums ${color}`}>
        {value}
      </span>
      <span className="text-[9px] text-gray-600 uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function JobAuditPanel() {
  const [auditData, setAuditData] = useState<SystemAuditResponse>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Countdown in seconds until the next auto-refresh
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch("/api/audit", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: SystemAuditResponse = await res.json();
      setAuditData(data);
      setIsError(false);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setCountdown(POLL_INTERVAL_MS / 1000);
    }
  }, []);

  // Set mounted flag on client mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  // Auto-refresh poll loop
  useEffect(() => {
    const interval = setInterval(fetchAudit, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAudit]);

  // Visual countdown ticker
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : POLL_INTERVAL_MS / 1000));
    }, REFRESH_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const lastScanTime = mounted && auditData.audit_timestamp_ms > 0
    ? new Date(auditData.audit_timestamp_ms).toLocaleTimeString()
    : "—";

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-6 font-mono text-left mt-6 shadow-xl">
      {/* ── Panel Header ── */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          {/* Pulsing green dot: active when there are processing jobs */}
          <span
            className={`w-2 h-2 rounded-full ${
              auditData.processing > 0
                ? "bg-emerald-400 animate-pulse"
                : "bg-gray-700"
            }`}
          />
          <h3 className="text-gray-500 text-xs uppercase tracking-widest">
            Live Job Registry
          </h3>
        </div>

        <button
          onClick={fetchAudit}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition uppercase tracking-wider"
          title="Force refresh"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Summary Counters ── */}
      <div className="flex justify-around border border-gray-800 rounded-lg py-3 mb-4 bg-gray-950/50">
        <SummaryCounter
          label="Total"
          value={auditData.total_active_jobs}
          color="text-white"
        />
        <div className="w-px bg-gray-800" />
        <SummaryCounter
          label="Active"
          value={auditData.processing}
          color="text-amber-400"
        />
        <div className="w-px bg-gray-800" />
        <SummaryCounter
          label="Done"
          value={auditData.completed}
          color="text-emerald-400"
        />
        <div className="w-px bg-gray-800" />
        <SummaryCounter
          label="Failed"
          value={auditData.failed}
          color="text-red-400"
        />
      </div>

      {/* ── Error State ── */}
      {isError && (
        <div className="text-[11px] text-red-400/80 border border-red-500/20 rounded bg-red-500/5 px-3 py-2 mb-3">
          ⚠ Audit gateway unreachable. Backend may be starting up.
        </div>
      )}

      {/* ── Job Table ── */}
      {isLoading ? (
        <div className="text-center text-gray-700 text-xs py-8 tracking-widest uppercase">
          Scanning Redis registry...
        </div>
      ) : auditData.jobs.length === 0 ? (
        <div className="text-center text-gray-700 text-xs py-8 tracking-widest">
          No active jobs in registry.
          <br />
          <span className="text-gray-800">
            Dispatch an analysis to begin.
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-[9px] text-gray-600 uppercase tracking-widest border-b border-gray-800">
                <th className="text-left pb-2 pr-3 font-normal">Job ID</th>
                <th className="text-left pb-2 pr-3 font-normal">Ticker</th>
                <th className="text-left pb-2 pr-3 font-normal">Status</th>
                <th className="text-left pb-2 pr-3 font-normal">Signal</th>
                <th className="text-right pb-2 pr-3 font-normal">
                  Latency
                </th>
                <th className="text-right pb-2 font-normal">Age</th>
              </tr>
            </thead>
            <tbody>
              {auditData.jobs.map((job: JobAuditEntry) => (
                <tr
                  key={job.job_id}
                  className="border-b border-gray-900 hover:bg-gray-900/30 transition-colors"
                >
                  {/* Job ID — truncated to first 8 chars for readability */}
                  <td className="py-2 pr-3 text-gray-600 font-mono">
                    <span title={job.job_id}>
                      {job.job_id.slice(0, 8)}…
                    </span>
                  </td>

                  {/* Ticker */}
                  <td className="py-2 pr-3 text-white font-bold tracking-wider">
                    {job.ticker}
                  </td>

                  {/* Status badge */}
                  <td className="py-2 pr-3">
                    <StatusBadge status={job.status} />
                  </td>

                  {/* Signal */}
                  <td className="py-2 pr-3">
                    <SignalBadge signal={job.signal} />
                  </td>

                  {/* Execution latency */}
                  <td className="py-2 pr-3 text-right text-gray-500">
                    {job.execution_time_ms != null
                      ? `${job.execution_time_ms.toFixed(0)}ms`
                      : "—"}
                  </td>

                  {/* Age since dispatch */}
                  <td className="py-2 text-right text-gray-600">
                    {job.age_seconds < 60
                      ? `${job.age_seconds}s`
                      : `${Math.floor(job.age_seconds / 60)}m ${job.age_seconds % 60}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer: scan metadata + countdown ── */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-900">
        <span className="text-[9px] text-gray-700" suppressHydrationWarning>
          Last scan: {lastScanTime}
        </span>
        <span className="text-[9px] text-gray-700 tabular-nums">
          Refreshing in {countdown}s…
        </span>
      </div>
    </div>
  );
}
