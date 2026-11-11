"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CodeQualityReport,
  EnvironmentAuditReport,
  OpenApiDocument,
  SeedStatusReport,
  SubsystemProbe,
  TieredHealthMatrixReport,
} from "@/types/api";

function statusTone(status?: string) {
  const s = (status || "").toUpperCase();
  if (s === "PASS" || s === "PASSED" || s === "HEALTHY" || s === "SEEDED" || s === "SECURE") {
    return "text-emerald-400";
  }
  if (s === "WARN" || s === "WARNING" || s === "INCOMPLETE" || s === "DEFAULT_WARNING" || s === "DEGRADED") {
    return "text-amber-400";
  }
  if (s === "FAIL" || s === "FAILED" || s === "EMPTY" || s === "UNHEALTHY" || s === "UNCONFIGURED" || s === "NON_COMPLIANT") {
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

export default function GovernanceWorkbench() {
  const [env, setEnv] = useState<EnvironmentAuditReport | null>(null);
  const [probes, setProbes] = useState<TieredHealthMatrixReport | null>(null);
  const [seed, setSeed] = useState<SeedStatusReport | null>(null);
  const [spec, setSpec] = useState<OpenApiDocument | null>(null);
  const [quality, setQuality] = useState<CodeQualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [e, p, s, d, q] = await Promise.all([
        fetch("/api/cloud/env-audit", { cache: "no-store" }),
        fetch("/api/cloud/health-probes", { cache: "no-store" }),
        fetch("/api/cloud/seed/status", { cache: "no-store" }),
        fetch("/api/docs/spec", { cache: "no-store" }),
        fetch("/api/system/code-quality", { cache: "no-store" }),
      ]);

      const failures: string[] = [];
      if (e.ok) setEnv(await e.json());
      else failures.push(`env ${e.status}`);
      if (p.ok) setProbes(await p.json());
      else failures.push(`probes ${p.status}`);
      if (s.ok) setSeed(await s.json());
      else failures.push(`seed ${s.status}`);
      if (d.ok) setSpec(await d.json());
      else failures.push(`openapi ${d.status}`);
      if (q.ok) setQuality(await q.json());
      else failures.push(`quality ${q.status}`);

      setError(failures.length ? `Partial: ${failures.join(", ")}` : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Governance APIs unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subsystems: SubsystemProbe[] = probes?.readiness.subsystems ?? [];
  const pathCount = spec?.paths ? Object.keys(spec.paths).length : null;
  const warnFail =
    env?.checks.filter((c) => c.status === "WARN" || c.status === "FAIL").length ?? 0;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
        This process: env keys (masked), Postgres/Redis probes, seed row counts, and the
        OpenAPI contract. Not a 120-day roadmap or a go-live certificate.
      </p>

      {error && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-300">{env?.profile ?? (loading ? "Loading…" : "—")}</span>
        <span className="text-slate-600">·</span>
        <span className={statusTone(probes?.overall_status)}>
          {probes?.overall_status ?? "—"}
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">
          Env checks {env ? `${env.total_checks_passed}/${env.total_checks_count} pass` : "—"}
          {warnFail > 0 ? ` · ${warnFail} warn/fail` : ""}
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
        <h2 className="mb-2 text-sm font-medium text-slate-200">Runtime</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Profile" value={env?.profile ?? "—"} />
          <Card
            label="CORS origins"
            value={env ? String(env.allowed_origins?.length ?? 0) : "—"}
            hint={env?.allowed_origins?.slice(0, 2).join(", ") || undefined}
          />
          <Card
            label="OpenAPI"
            value={pathCount != null ? `${pathCount} paths` : "—"}
            hint={spec ? `${spec.info?.title ?? "API"} ${spec.info?.version ?? ""}` : undefined}
          />
          <Card
            label="Python scan"
            value={quality ? `${quality.total_files_scanned} files` : "—"}
            hint={
              quality
                ? `${quality.total_lines_of_code.toLocaleString()} LOC · ${quality.total_issues} issues`
                : undefined
            }
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Full contract:{" "}
          <Link href="/docs" className="text-cyan-400 hover:text-cyan-300">
            /docs
          </Link>
        </p>
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
                    <td className="px-3 py-2 font-mono text-slate-400">
                      {row.latency_ms.toFixed(1)} ms
                    </td>
                    <td className="px-3 py-2 text-slate-500">{row.details || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Env keys (masked)</h2>
        <p className="mb-3 text-xs text-slate-500">
          Values are redacted. DEFAULT_WARNING means the placeholder from Settings is still in use.
        </p>
        {!env?.redacted_secrets?.length ? (
          <p className="text-sm text-slate-500">No secret audit.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">Key</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Masked</th>
                </tr>
              </thead>
              <tbody>
                {env.redacted_secrets.map((row) => (
                  <tr key={row.key_name} className="border-b border-slate-900">
                    <td className="px-3 py-2 font-mono text-slate-200">{row.key_name}</td>
                    <td className={`px-3 py-2 ${statusTone(row.status)}`}>{row.status}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{row.masked_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Env checks</h2>
        {!env?.checks?.length ? (
          <p className="text-sm text-slate-500">No checks.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">Check</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Detail</th>
                </tr>
              </thead>
              <tbody>
                {env.checks.map((row) => (
                  <tr key={row.name} className="border-b border-slate-900">
                    <td className="px-3 py-2 text-slate-200">{row.name}</td>
                    <td className={`px-3 py-2 ${statusTone(row.status)}`}>{row.status}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {row.description}
                      {row.remediation ? ` — ${row.remediation}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Postgres seed</h2>
        <p className="mb-3 text-xs text-slate-500">
          Counts from the database for the benchmark ticker set. SEEDED means ≥20 candles.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Tickers" value={seed ? String(seed.total_tickers) : "—"} />
          <Card label="Candles" value={seed ? seed.total_candles.toLocaleString() : "—"} />
          <Card label="Signals" value={seed ? seed.total_signals.toLocaleString() : "—"} />
          <Card label="RAG chunks" value={seed ? seed.total_rag_chunks.toLocaleString() : "—"} />
        </div>
        {!seed?.tickers?.length ? (
          <p className="text-sm text-slate-500">{loading ? "Reading seed status…" : "No seed report."}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">Ticker</th>
                  <th className="px-3 py-2 font-normal">Candles</th>
                  <th className="px-3 py-2 font-normal">Signals</th>
                  <th className="px-3 py-2 font-normal">RAG</th>
                  <th className="px-3 py-2 font-normal">Latest</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {seed.tickers.map((row) => (
                  <tr key={row.symbol} className="border-b border-slate-900">
                    <td className="px-3 py-2 font-medium text-slate-200">{row.symbol}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.candles_count.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.signals_count.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.rag_chunks_count.toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-500">{row.latest_candle_date || "—"}</td>
                    <td className={`px-3 py-2 ${statusTone(row.status)}`}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {quality?.checks?.length ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-200">Python quality scan</h2>
          <p className="mb-3 text-xs text-slate-500">
            Walks the FastAPI package (AST + Ruff if installed). Not a CI badge.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-2 font-normal">Check</th>
                  <th className="px-3 py-2 font-normal">Tool</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Issues</th>
                </tr>
              </thead>
              <tbody>
                {quality.checks.map((row) => (
                  <tr key={row.check_name} className="border-b border-slate-900">
                    <td className="px-3 py-2 text-slate-200">{row.check_name}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{row.tool}</td>
                    <td className={`px-3 py-2 ${statusTone(row.status)}`}>{row.status}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.issues_found}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
