"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircuitBreakerTelemetrySnapshot,
  ConnectionPoolStatus,
  DeadLetterJobEntry,
  DeadLetterRegistryResponse,
  LoadTestReport,
  RedisMemoryStatus,
  StreamHealthResponse,
} from "@/types/api";

function dash(n: number | null | undefined, digits = 1, suffix = "") {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function statusTone(status?: string) {
  const s = (status || "").toUpperCase();
  if (s === "HEALTHY" || s === "CLOSED" || s === "COMPLETED") return "text-emerald-400";
  if (s === "DEGRADED" || s === "WARNING" || s === "HALF_OPEN" || s === "ELEVATED" || s === "ACTIVE") {
    return "text-amber-400";
  }
  if (s === "UNHEALTHY" || s === "OPEN" || s === "CRITICAL" || s === "FAILED" || s === "EXHAUSTED") {
    return "text-red-400";
  }
  return "text-slate-400";
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-lg text-slate-100">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

function isCannedLoadReport(report: LoadTestReport | null) {
  if (!report) return true;
  const id = report.run_id || "";
  return id.includes("baseline") || id === "loadtest_init";
}

function formatWhen(unixSec?: number) {
  if (!unixSec) return "—";
  const d = new Date(unixSec * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function ResilienceWorkbench({
  onSelectTrace,
}: {
  onSelectTrace?: (traceId: string) => void;
}) {
  const [breaker, setBreaker] = useState<CircuitBreakerTelemetrySnapshot | null>(null);
  const [dlq, setDlq] = useState<DeadLetterRegistryResponse | null>(null);
  const [pool, setPool] = useState<ConnectionPoolStatus | null>(null);
  const [memory, setMemory] = useState<RedisMemoryStatus | null>(null);
  const [stream, setStream] = useState<StreamHealthResponse | null>(null);
  const [loadTest, setLoadTest] = useState<LoadTestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cb, q, p, m, s, lt] = await Promise.all([
        fetch("/api/circuit-breaker", { cache: "no-store" }),
        fetch("/api/dlq?count=20", { cache: "no-store" }),
        fetch("/api/chaos/pool", { cache: "no-store" }),
        fetch("/api/chaos/redis-memory", { cache: "no-store" }),
        fetch("/api/stream-health", { cache: "no-store" }),
        fetch("/api/chaos/load-test", { cache: "no-store" }),
      ]);

      const failures: string[] = [];
      if (cb.ok) setBreaker(await cb.json());
      else failures.push(`circuit ${cb.status}`);
      if (q.ok) setDlq(await q.json());
      else failures.push(`dlq ${q.status}`);
      if (p.ok) setPool(await p.json());
      else failures.push(`pool ${p.status}`);
      if (m.ok) setMemory(await m.json());
      else failures.push(`redis ${m.status}`);
      if (s.ok) setStream(await s.json());
      else failures.push(`stream ${s.status}`);
      if (lt.ok) {
        const report: LoadTestReport = await lt.json();
        setLoadTest(isCannedLoadReport(report) ? null : report);
      }

      setError(failures.length ? `Partial: ${failures.join(", ")}` : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Resilience APIs unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const runLoadTest = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/chaos/load-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 10, duration_seconds: 5 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Load test HTTP ${res.status}`);
      }
      const report: LoadTestReport = await res.json();
      setLoadTest(isCannedLoadReport(report) ? null : report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Load test failed");
    } finally {
      setRunning(false);
    }
  };

  const entries: DeadLetterJobEntry[] = dlq?.entries ?? [];
  const liveLoad = loadTest && !isCannedLoadReport(loadTest) ? loadTest : null;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
        Live Groq circuit, Redis dead-letter stream, SQLAlchemy pool, and Redis
        INFO memory. A load-test row appears only after this process actually
        ran one — the canned 50-user baseline from GET /latest is hidden.
      </p>

      {error && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`font-medium ${statusTone(breaker?.circuit_state)}`}>
          Circuit {breaker?.circuit_state ?? (loading ? "Loading…" : "—")}
        </span>
        <span className="text-slate-600">·</span>
        <span className={entries.length > 0 ? "text-red-400" : "text-slate-400"}>
          DLQ {dlq ? dlq.total_quarantined : "—"}
        </span>
        <span className="text-slate-600">·</span>
        <span className={statusTone(pool?.is_exhausted ? "EXHAUSTED" : "HEALTHY")}>
          Pool {pool ? (pool.is_exhausted ? "EXHAUSTED" : `${dash(pool.saturation_pct, 0, "%")}`) : "—"}
        </span>
        <button
          type="button"
          onClick={load}
          className="ml-auto text-xs text-slate-500 hover:text-slate-300"
        >
          Refresh
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Groq LLM circuit</h2>
        <p className="mb-3 text-xs text-slate-500">
          Trips OPEN after consecutive HTTP 429s from Groq. CLOSED means the worker may call the model.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="State" value={breaker?.circuit_state ?? "—"} />
          <Card
            label="Strikes"
            value={breaker ? `${breaker.consecutive_rate_limits} / ${breaker.failure_threshold}` : "—"}
            hint="Consecutive 429s"
          />
          <Card label="Lifetime trips" value={breaker ? String(breaker.total_trips) : "—"} />
          <Card
            label="Cooldown left"
            value={breaker ? dash(breaker.cooldown_remaining_sec, 0, "s") : "—"}
            hint={breaker ? `window ${breaker.cooldown_period_sec}s` : undefined}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Last failure: {breaker?.last_failure_reason || "—"}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Postgres pool</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card
            label="Checked out"
            value={pool ? String(pool.checked_out) : "—"}
            hint={pool ? `of ${pool.total_capacity} (${pool.pool_size}+${pool.max_overflow} overflow)` : undefined}
          />
          <Card label="Idle" value={pool ? String(pool.checked_in) : "—"} />
          <Card
            label="Saturation"
            value={pool ? dash(pool.saturation_pct, 0, "%") : "—"}
            hint={pool?.is_exhausted ? "exhausted" : undefined}
          />
          <Card label="SELECT 1" value={pool ? dash(pool.avg_checkout_latency_ms, 1, " ms") : "—"} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Redis memory & job stream</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card
            label="Used"
            value={memory ? `${dash(memory.used_memory_mb, 1)} MB` : "—"}
            hint={memory ? `${dash(memory.memory_utilization_pct, 1, "%")} of ${dash(memory.allocated_limit_mb, 0)} MB` : undefined}
          />
          <Card label="Evicted keys" value={memory ? String(memory.evicted_keys_count) : "—"} />
          <Card
            label="Stream lag"
            value={stream ? String(stream.lag) : "—"}
            hint={stream ? `PEL ${stream.pel_count}` : undefined}
          />
          <Card label="Consumers" value={stream ? String(stream.consumer_count) : "—"} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Dead-letter queue</h2>
        <p className="mb-3 text-xs text-slate-500">
          Jobs that exhausted retries, from Redis stream <span className="font-mono">stream:intel_jobs:dlq</span>.
        </p>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            {loading ? "Reading DLQ…" : "Empty — no quarantined jobs."}
          </p>
        ) : (
          <>
            {entries.length > 12 && (
              <p className="mb-2 text-[11px] text-slate-500">
                Showing 12 of {dlq?.total_quarantined ?? entries.length}.
              </p>
            )}
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">Ticker</th>
                  <th className="px-3 py-2 font-normal">Job</th>
                  <th className="px-3 py-2 font-normal">Attempts</th>
                  <th className="px-3 py-2 font-normal">Reason</th>
                  <th className="px-3 py-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 12).map((row) => (
                  <tr key={row.dlq_id} className="border-b border-slate-900">
                    <td className="px-3 py-2 font-medium text-slate-200">{row.ticker}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">
                      {row.trace_id && onSelectTrace ? (
                        <button
                          type="button"
                          className="text-cyan-400 hover:text-cyan-300"
                          onClick={() => onSelectTrace(row.trace_id as string)}
                        >
                          {row.job_id.slice(0, 12)}…
                        </button>
                      ) : (
                        `${row.job_id.slice(0, 12)}…`
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.delivery_count}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-slate-400" title={row.error_reason}>
                      {row.error_reason || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{formatWhen(row.quarantined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium text-slate-200">Last load test on this process</h2>
          <button
            type="button"
            onClick={runLoadTest}
            disabled={running}
            className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
          >
            {running ? "Running 10×5s…" : "Run 10 concurrent × 5s"}
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          POST /v1/chaos/load-test/run against this FastAPI app. Not an external Locust swarm.
        </p>
        {!liveLoad ? (
          <p className="text-sm text-slate-500">No stored run yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card
                label="Requests"
                value={String(liveLoad.total_requests)}
                hint={`${liveLoad.concurrency} concurrent · ${liveLoad.duration_seconds}s`}
              />
              <Card label="RPS" value={dash(liveLoad.requests_per_second, 1)} />
              <Card
                label="Failures"
                value={`${liveLoad.total_failures} (${dash(liveLoad.failure_rate_pct, 2, "%")})`}
              />
              <Card
                label="p99"
                value={dash(liveLoad.latency_p99_ms, 0, " ms")}
                hint={`p50 ${dash(liveLoad.latency_p50_ms, 0, " ms")}`}
              />
            </div>
            {liveLoad.endpoint_breakdown?.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-800">
                      <th className="px-3 py-2 font-normal">Endpoint</th>
                      <th className="px-3 py-2 font-normal">N</th>
                      <th className="px-3 py-2 font-normal">p50</th>
                      <th className="px-3 py-2 font-normal">p99</th>
                      <th className="px-3 py-2 font-normal">Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveLoad.endpoint_breakdown.map((ep) => (
                      <tr key={`${ep.method}-${ep.endpoint}`} className="border-b border-slate-900">
                        <td className="px-3 py-2 font-mono text-slate-300">
                          {ep.method} {ep.endpoint}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-400">{ep.request_count}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{dash(ep.p50_ms, 0, " ms")}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{dash(ep.p99_ms, 0, " ms")}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{ep.failure_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
