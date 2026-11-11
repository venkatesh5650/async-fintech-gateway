"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MetricSummaryReport,
  SloStatusReport,
  StreamHealthResponse,
  SubsystemProbe,
  TieredHealthMatrixReport,
  EventLoopStatus,
} from "@/types/api";

function dash(n: number | null | undefined, digits = 1, suffix = "") {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function statusTone(status?: string) {
  const s = (status || "").toUpperCase();
  if (s === "HEALTHY" || s === "READY" || s === "COMPLIANT" || s === "CLOSED") {
    return "text-emerald-400";
  }
  if (s === "DEGRADED" || s === "WARNING" || s === "ACTIVE" || s === "HALF_OPEN") {
    return "text-amber-400";
  }
  if (s === "UNHEALTHY" || s === "NOT_READY" || s === "BREACHED" || s === "CRITICAL" || s === "OPEN") {
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

export default function TelemetryWorkbench() {
  const [metrics, setMetrics] = useState<MetricSummaryReport | null>(null);
  const [stream, setStream] = useState<StreamHealthResponse | null>(null);
  const [probes, setProbes] = useState<TieredHealthMatrixReport | null>(null);
  const [slos, setSlos] = useState<SloStatusReport | null>(null);
  const [loop, setLoop] = useState<EventLoopStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, s, p, slo, el] = await Promise.all([
        fetch("/api/cloud/metrics/summary", { cache: "no-store" }),
        fetch("/api/stream-health", { cache: "no-store" }),
        fetch("/api/cloud/health-probes", { cache: "no-store" }),
        fetch("/api/cloud/slo/status", { cache: "no-store" }),
        fetch("/api/chaos/event-loop", { cache: "no-store" }),
      ]);

      const failures: string[] = [];
      if (m.ok) setMetrics(await m.json());
      else failures.push(`metrics ${m.status}`);
      if (s.ok) setStream(await s.json());
      else failures.push(`stream ${s.status}`);
      if (p.ok) setProbes(await p.json());
      else failures.push(`probes ${p.status}`);
      if (slo.ok) setSlos(await slo.json());
      if (el.ok) setLoop(await el.json());

      setError(failures.length ? `Partial: ${failures.join(", ")}` : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Telemetry unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const g = metrics?.golden_signals;
  const cacheOps = (metrics?.cache_telemetry?.hits ?? 0) + (metrics?.cache_telemetry?.misses ?? 0);
  const liveSlos = (slos?.slos ?? []).filter(
    (item) => !/event loop/i.test(item.name)
  );
  const subsystems: SubsystemProbe[] = probes?.readiness.subsystems ?? [];

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
        Counters from this FastAPI process, Redis stream lag, and dependency probes.
        They reset when the API restarts. They are not a 30-day Grafana cloud dashboard.
      </p>

      {error && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`font-medium ${statusTone(probes?.overall_status)}`}>
          {probes?.overall_status ?? (loading ? "Loading…" : "—")}
        </span>
        <span className="text-slate-600">·</span>
        <span className={`text-slate-400 ${statusTone(stream?.health_status)}`}>
          Stream {stream?.health_status ?? "—"}
        </span>
        {probes?.liveness?.uptime_seconds != null && (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-slate-500">
              API up {Math.max(0, Math.floor(probes.liveness.uptime_seconds / 60))}m
            </span>
          </>
        )}
        <button
          type="button"
          onClick={load}
          className="ml-auto text-xs text-slate-500 hover:text-slate-300"
        >
          Refresh
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">HTTP (this process)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="Requests" value={g ? String(g.total_requests) : "—"} hint="Since process start" />
          <Card label="Rate" value={g ? `${dash(g.throughput_rps, 2)} /s` : "—"} hint="Total ÷ uptime" />
          <Card
            label="Errors (4xx+5xx)"
            value={g ? `${g.error_requests} (${dash(g.error_rate_pct, 1, "%")})` : "—"}
          />
          <Card label="p50" value={g ? dash(g.p50_latency_ms, 0, " ms") : "—"} />
          <Card label="p90" value={g ? dash(g.p90_latency_ms, 0, " ms") : "—"} />
          <Card label="p99" value={g ? dash(g.p99_latency_ms, 0, " ms") : "—"} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Redis job stream</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card
            label="Length"
            value={stream ? String(stream.stream_len) : "—"}
            hint={stream?.stream_name ?? undefined}
          />
          <Card label="Lag" value={stream ? String(stream.lag) : "—"} hint="XADD not yet consumed" />
          <Card label="In-flight (PEL)" value={stream ? String(stream.pel_count) : "—"} hint="Delivered, not ACK'd" />
          <Card
            label="Consumers"
            value={stream ? String(stream.consumer_count) : "—"}
            hint={stream?.consumer_group ?? undefined}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Dependencies</h2>
        {subsystems.length === 0 ? (
          <p className="text-sm text-slate-500">{loading ? "Checking probes…" : "No probe data."}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">Service</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Latency</th>
                  <th className="px-3 py-2 font-normal">Detail</th>
                </tr>
              </thead>
              <tbody>
                {subsystems.map((row) => (
                  <tr key={row.name} className="border-b border-slate-900">
                    <td className="px-3 py-2 font-medium text-slate-200">{row.name}</td>
                    <td className={`px-3 py-2 ${statusTone(row.status)}`}>{row.status}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{dash(row.latency_ms, 1, " ms")}</td>
                    <td className="px-3 py-2 text-slate-500">{row.details || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Event-loop lag (measured this poll): {loop ? dash(loop.current_lag_ms, 2, " ms") : "—"}.
          Cache hit rate after real hits/misses:{" "}
          {cacheOps > 0 ? dash(metrics?.cache_telemetry.hit_rate_pct, 1, "%") : "—"}.
        </p>
      </section>

      {metrics && Object.keys(metrics.circuit_breaker_status || {}).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-200">Circuit breakers</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(metrics.circuit_breaker_status).map(([name, state]) => (
              <span
                key={name}
                className={`rounded-md border border-slate-800 px-2 py-1 font-mono text-xs ${statusTone(state)}`}
              >
                {name}: {state}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">SLOs from this process</h2>
        <p className="mb-3 text-xs text-slate-500">
          Availability and latency vs the counters above. Empty until this process has served requests.
        </p>
        {(g?.total_requests ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No request traffic yet — SLO % would be 100% by default, so it is hidden.</p>
        ) : liveSlos.length === 0 ? (
          <p className="text-sm text-slate-500">No SLO report.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">SLO</th>
                  <th className="px-3 py-2 font-normal">Target</th>
                  <th className="px-3 py-2 font-normal">Now</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {liveSlos.map((item) => (
                  <tr key={item.name} className="border-b border-slate-900">
                    <td className="px-3 py-2 text-slate-200">{item.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{item.target}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{item.current_value}</td>
                    <td className={`px-3 py-2 ${statusTone(item.status)}`}>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Metric samples</h2>
        <p className="mb-3 text-xs text-slate-500">
          First samples from the in-process Prometheus registry (GET /metrics).
        </p>
        {!metrics?.samples?.length ? (
          <p className="text-sm text-slate-500">No samples yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal">Type</th>
                  <th className="px-3 py-2 font-normal">Value</th>
                </tr>
              </thead>
              <tbody>
                {metrics.samples.slice(0, 24).map((sample, i) => (
                  <tr key={`${sample.name}-${i}`} className="border-b border-slate-900">
                    <td className="px-3 py-2 font-mono text-slate-300">
                      {sample.name}
                      {Object.keys(sample.labels || {}).length > 0 && (
                        <span className="ml-2 text-slate-600">
                          {" "}
                          {Object.entries(sample.labels)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(" ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{sample.type}</td>
                    <td className="px-3 py-2 font-mono text-slate-200">{sample.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
