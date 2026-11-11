"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CacheHealthResponse, CacheInspectorResponse } from "@/types/api";

const LOOKUPS = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL"];

function dash(n: number | null | undefined, digits = 1, suffix = "") {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
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

function formatBytes(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export default function CacheWorkbench({
  onSelectTrace,
}: {
  onSelectTrace?: (traceId: string) => void;
}) {
  const [health, setHealth] = useState<CacheHealthResponse | null>(null);
  const [inspect, setInspect] = useState<CacheInspectorResponse | null>(null);
  const [ticker, setTicker] = useState("");
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingInspect, setLoadingInspect] = useState(false);
  const [evicting, setEvicting] = useState(false);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/cache-health", { cache: "no-store" });
      if (!res.ok) {
        setError(`cache-health ${res.status}`);
        return;
      }
      setHealth(await res.json());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Cache health unreachable");
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const id = setInterval(loadHealth, 5000);
    return () => clearInterval(id);
  }, [loadHealth]);

  const lookup = async (symbol: string) => {
    const clean = symbol.toUpperCase().trim();
    if (!clean || !/^[A-Z0-9.\-=^]{1,16}$/.test(clean)) return;
    setLookedUp(clean);
    setLoadingInspect(true);
    try {
      const res = await fetch(`/api/cache-inspector/${encodeURIComponent(clean)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setInspect(null);
        setError(`inspector ${res.status}`);
        return;
      }
      setInspect(await res.json());
      setError(null);
    } catch (err: unknown) {
      setInspect(null);
      setError(err instanceof Error ? err.message : "Inspector unreachable");
    } finally {
      setLoadingInspect(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    lookup(ticker);
  };

  const evict = async () => {
    if (!lookedUp || evicting) return;
    setEvicting(true);
    try {
      const res = await fetch(`/api/cache-invalidate/${encodeURIComponent(lookedUp)}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `evict ${res.status}`);
        return;
      }
      await lookup(lookedUp);
      await loadHealth();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Evict failed");
    } finally {
      setEvicting(false);
    }
  };

  const hits = health?.hit_count ?? 0;
  const misses = health?.miss_count ?? 0;
  const total = health?.total_requests ?? 0;
  const hitRatio = total > 0 ? dash(health?.hit_ratio_pct, 1, "%") : "—";

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
        Redis keys named <span className="font-mono">cache:intel:{"{TICKER}"}</span>.
        Hit/miss counters are this FastAPI process and reset on restart.
        Memory figures are Redis INFO for the whole instance, not those keys alone.
      </p>

      {error && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-300">
          {health
            ? `${health.total_cached_keys} intel key${health.total_cached_keys === 1 ? "" : "s"}`
            : loadingHealth
            ? "Loading…"
            : "—"}
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">Hit ratio {hitRatio}</span>
        <button
          type="button"
          onClick={loadHealth}
          className="ml-auto text-xs text-slate-500 hover:text-slate-300"
        >
          Refresh
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">This process</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="Keys (SCAN)" value={health ? String(health.total_cached_keys) : "—"} hint="cache:intel:*" />
          <Card label="Hits" value={health ? String(hits) : "—"} />
          <Card label="Misses" value={health ? String(misses) : "—"} />
          <Card
            label="Hit ratio"
            value={hitRatio}
            hint={total === 0 ? "No lookups yet" : `${total} lookups`}
          />
          <Card
            label="Mutex waits"
            value={health ? String(health.contention_count) : "—"}
            hint="Stampede lock"
          />
          <Card
            label="Redis used"
            value={health ? `${dash(health.memory_used_mb, 1)} MB` : "—"}
            hint={health ? `peak ${dash(health.memory_peak_mb, 1)} MB` : undefined}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Inspect a key</h2>
        <p className="mb-3 text-xs text-slate-500">
          GET the Redis key for one ticker. Shortcuts below are lookups, not a live key list.
        </p>
        <form onSubmit={onSubmit} className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="TICKER"
            maxLength={16}
            className="w-28 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-100 placeholder:text-slate-600"
          />
          <button
            type="submit"
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Lookup
          </button>
          {LOOKUPS.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => {
                setTicker(sym);
                lookup(sym);
              }}
              className={`font-mono text-xs ${
                lookedUp === sym ? "text-cyan-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {sym}
            </button>
          ))}
        </form>

        {!lookedUp ? (
          <p className="text-sm text-slate-500">No ticker looked up yet.</p>
        ) : loadingInspect ? (
          <p className="text-sm text-slate-500">Reading cache:intel:{lookedUp}…</p>
        ) : !inspect ? (
          <p className="text-sm text-slate-500">No inspector payload.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-slate-200">cache:intel:{inspect.ticker}</span>
              <span className={inspect.is_cached ? "text-emerald-400" : "text-slate-500"}>
                {inspect.is_cached ? "present" : "missing"}
              </span>
              {inspect.is_cached && (
                <button
                  type="button"
                  onClick={evict}
                  disabled={evicting}
                  className="text-xs text-slate-500 hover:text-red-300 disabled:opacity-50"
                >
                  {evicting ? "Deleting…" : "DEL key"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card
                label="TTL left"
                value={inspect.is_cached ? `${inspect.ttl_remaining_seconds}s` : "—"}
                hint="Redis TTL; writes use 300s"
              />
              <Card label="Size" value={inspect.is_cached ? formatBytes(inspect.payload_size_bytes) : "—"} />
              <Card label="Origin" value={inspect.prime_origin || "—"} />
              <Card
                label="Primed"
                value={
                  inspect.primed_at_iso
                    ? new Date(inspect.primed_at_iso).toLocaleString()
                    : "—"
                }
              />
            </div>
            {inspect.trace_id && (
              <p className="text-xs text-slate-500">
                Trace{" "}
                {onSelectTrace ? (
                  <button
                    type="button"
                    className="font-mono text-cyan-400 hover:text-cyan-300"
                    onClick={() => onSelectTrace(inspect.trace_id as string)}
                  >
                    {inspect.trace_id}
                  </button>
                ) : (
                  <span className="font-mono">{inspect.trace_id}</span>
                )}
              </p>
            )}
            {inspect.is_cached && inspect.raw_payload_preview && (
              <details className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                <summary className="cursor-pointer text-xs text-slate-400">
                  Cached JSON ({Object.keys(inspect.raw_payload_preview).length} fields)
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed text-slate-400">
                  {JSON.stringify(inspect.raw_payload_preview, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
