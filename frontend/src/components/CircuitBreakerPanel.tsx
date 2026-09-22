"use client";

import { useEffect, useState, useCallback } from "react";
import { CircuitBreakerTelemetrySnapshot, CircuitBreakerState } from "@/types/api";

const POLL_INTERVAL_FAST_MS = 2000;
const POLL_INTERVAL_SLOW_MS = 4000;
const REFRESH_TICK_MS = 1000;

const STATE_CONFIG: Record<
  CircuitBreakerState,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    borderClass: string;
    description: string;
    subtext: string;
  }
> = {
  CLOSED: {
    label: "CLOSED (NORMAL)",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]",
    borderClass: "border-emerald-500/30",
    description: "Upstream LLM cluster is responsive and healthy.",
    subtext: "Worker pool operates under standard dynamic concurrency without rate-limit throttling.",
  },
  OPEN: {
    label: "OPEN (TRIPPED)",
    badgeClass: "bg-red-500/10 text-red-400 border-red-500/30",
    dotClass: "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-ping",
    borderClass: "border-red-500/40",
    description: "Upstream rate-limit (429) quota exhaustion detected.",
    subtext: "Stream consumers paused and worker pool clamped to minimum concurrency (3) during cooldown.",
  },
  HALF_OPEN: {
    label: "HALF-OPEN (CANARY)",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    dotClass: "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.9)] animate-pulse",
    borderClass: "border-amber-500/30",
    description: "Cooldown window elapsed. Canary trial active.",
    subtext: "Executing a single trial request to verify upstream provider recovery before full restoration.",
  },
};

export default function CircuitBreakerPanel() {
  const [data, setData] = useState<CircuitBreakerTelemetrySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_SLOW_MS / 1000);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/circuit-breaker", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json: CircuitBreakerTelemetrySnapshot = await res.json();
      setData(json);
      setIsError(false);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setCountdown((prev) => (data?.circuit_state === "OPEN" ? 2 : 4));
    }
  }, [data?.circuit_state]);

  useEffect(() => {
    fetchTelemetry();
    const intervalMs =
      data?.circuit_state === "OPEN" || data?.circuit_state === "HALF_OPEN"
        ? POLL_INTERVAL_FAST_MS
        : POLL_INTERVAL_SLOW_MS;

    const poll = setInterval(fetchTelemetry, intervalMs);
    return () => clearInterval(poll);
  }, [fetchTelemetry, data?.circuit_state]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 4));
    }, REFRESH_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const currentState: CircuitBreakerState =
    (data?.circuit_state as CircuitBreakerState) || "CLOSED";
  const config = STATE_CONFIG[currentState] || STATE_CONFIG.CLOSED;

  const failureThreshold = data?.failure_threshold || 2;
  const currentStrikes = data?.consecutive_rate_limits || 0;
  const cooldownRemaining = data?.cooldown_remaining_sec || 0;
  const cooldownTotal = data?.cooldown_period_sec || 20;

  const cooldownPercent =
    cooldownTotal > 0 ? Math.min(100, Math.max(0, (cooldownRemaining / cooldownTotal) * 100)) : 0;

  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl p-4 sm:p-6 font-mono text-left shadow-2xl space-y-6">
      {/* ── Header & Radar Status ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${config.dotClass}`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white text-sm font-bold tracking-wider uppercase">
                Upstream LLM Circuit Breaker
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${config.badgeClass}`}
              >
                {config.label}
              </span>
            </div>
            <span className="text-gray-400 text-xs block mt-0.5 font-sans">
              {config.description}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end space-x-3 text-xs w-full sm:w-auto">
          <span className="text-gray-500 text-[11px] tabular-nums">
            Next poll: {countdown}s
          </span>
          <button
            onClick={fetchTelemetry}
            className="px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white rounded text-xs transition-colors shrink-0"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Gateway Unreachable Warning ── */}
      {isError && (
        <div className="text-xs text-red-400/90 border border-red-500/20 bg-red-500/5 px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>⚠ Telemetry edge unreachable. Backend service may be starting up.</span>
          <button onClick={fetchTelemetry} className="underline hover:text-white transition">
            Retry
          </button>
        </div>
      )}

      {/* ── Cooldown Alert Banner (Active during OPEN state) ── */}
      {currentState === "OPEN" && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-base">🛑</span>
              <span className="text-red-300 font-bold text-xs uppercase tracking-wider">
                Autonomous Cooldown Active — Upstream Quota Protection
              </span>
            </div>
            <span className="text-red-400 font-bold text-sm tabular-nums">
              {cooldownRemaining.toFixed(1)}s remaining
            </span>
          </div>

          <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-red-500/30">
            <div
              className="bg-red-500 h-full transition-all duration-500"
              style={{ width: `${cooldownPercent}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-red-400/80">
            <span>Fast-blocking outgoing LLM calls</span>
            <span>ETA to Canary Trial: {cooldownRemaining.toFixed(0)}s</span>
          </div>
        </div>
      )}

      {/* ── Metric Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="p-3 sm:p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Circuit State
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl font-bold font-mono tracking-wide ${
                currentState === "CLOSED"
                  ? "text-emerald-400"
                  : currentState === "OPEN"
                  ? "text-red-400"
                  : "text-amber-400"
              }`}
            >
              {data ? data.circuit_state : "—"}
            </span>
          </div>
        </div>

        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Strike Counter
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                currentStrikes >= failureThreshold
                  ? "text-red-400"
                  : currentStrikes > 0
                  ? "text-amber-400"
                  : "text-gray-200"
              }`}
            >
              {data ? `${currentStrikes} / ${failureThreshold}` : "—"}
            </span>
            <span className="text-[10px] text-gray-600">strikes</span>
          </div>
        </div>

        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Lifetime Trips
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-purple-400 tabular-nums">
              {data ? data.total_trips : "—"}
            </span>
            <span className="text-[10px] text-gray-600">events</span>
          </div>
        </div>

        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-1">
          <span className="text-[10px] text-gray-500 uppercase block tracking-wider">
            Cooldown Period
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-blue-400 tabular-nums">
              {data ? `${data.cooldown_period_sec}s` : "—"}
            </span>
            <span className="text-[10px] text-gray-600">window</span>
          </div>
        </div>
      </div>

      {/* ── Operational Architecture Details ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Strike Meter & State Transition Policy */}
        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
              Trip Sensitivity Meter
            </span>
            <span className="text-xs text-gray-400 font-bold">
              Threshold: {failureThreshold} consecutive 429s
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {Array.from({ length: failureThreshold }).map((_, i) => {
              const isFilled = currentStrikes > i;
              return (
                <div
                  key={i}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    isFilled
                      ? "bg-red-500/10 border-red-500/40 text-red-400"
                      : "bg-black/40 border-gray-800 text-gray-600"
                  }`}
                >
                  <span className="text-[10px] uppercase block">Strike {i + 1}</span>
                  <span className="text-xs font-bold font-mono">
                    {isFilled ? "TRIGGERED (429)" : "ARMED"}
                  </span>
                </div>
              );
            })}
          </div>

          <span className="text-[10px] text-gray-500 block leading-relaxed pt-1">
            Policy: Two consecutive HTTP 429 errors from Groq trip the circuit immediately into OPEN
            state for {cooldownTotal} seconds, preventing cascaded request timeouts.
          </span>
        </div>

        {/* Right: Worker Pool Backpressure Dampening */}
        <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                Worker Backpressure Dampening
              </span>
              <span
                className={`text-xs font-bold font-mono ${
                  currentState === "OPEN" ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {currentState === "OPEN" ? "CLAMPED (3 Workers)" : "ELASTIC (3 - 10 Workers)"}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 block mt-1 leading-relaxed">
              {config.subtext}
            </span>
          </div>

          <div className="bg-black/50 border border-gray-900 rounded p-2.5 text-[10px] text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Exponential Backoff:</span>
              <span className="text-gray-300">AWS Full-Jitter Algorithm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Retry Budget:</span>
              <span className="text-gray-300">3 Attempts per Job</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Root Cause Diagnostic Inspector ── */}
      <div className="pt-2 border-t border-gray-900 space-y-1.5 text-xs">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider block">
          Last Upstream Diagnostic Log
        </span>
        <div className="bg-black/60 border border-gray-800 rounded-lg p-3 text-[11px] text-gray-400 font-mono overflow-x-auto">
          {data?.last_failure_reason ? (
            <span className="text-red-400">{data.last_failure_reason}</span>
          ) : (
            <span className="text-gray-600">
              No active failures recorded. Upstream provider operating within quota bounds.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
