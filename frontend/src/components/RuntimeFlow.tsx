"use client";

import { useEffect, useState } from "react";

type Step = {
  title: string;
  kicker: string;
  detail: string;
};

type BranchId = "login" | "jobs" | "analytics" | "filings" | "memo" | "assistant";

const BOOT: Step[] = [
  {
    title: "Postgres",
    kicker: "compose",
    detail: "Compose waits until Postgres is healthy. The check is pg_isready.",
  },
  {
    title: "Redis",
    kicker: "compose",
    detail: "Compose waits until Redis has started. API and the stream worker both depend on that.",
  },
  {
    title: "API + worker",
    kicker: "compose",
    detail: "fintech_api and fintech_stream_worker are then allowed to start. The worker runs python -m app.workers.consumer.",
  },
  {
    title: "pgvector",
    kicker: "lifespan",
    detail: "FastAPI lifespan runs CREATE EXTENSION IF NOT EXISTS vector.",
  },
  {
    title: "Tables",
    kicker: "lifespan",
    detail: "create_all runs, then signal_snapshots is created if it is missing.",
  },
  {
    title: "Users",
    kicker: "lifespan",
    detail: "Login users are seeded only when they are missing.",
  },
  {
    title: "OHLCV",
    kicker: "lifespan",
    detail: "If market_pricing is empty, about 100 days of prices are seeded.",
  },
  {
    title: "Stream group",
    kicker: "lifespan",
    detail: "ensure_consumer_group() opens stream:intel_jobs for intel_workers_group. fintech_stream_worker is the reader.",
  },
  {
    title: "Market poller",
    kicker: "if enabled",
    detail: "If ENABLE_MARKET_POLLER=true, a yfinance poller writes AAPL, TSLA, and the rest about every 60 seconds.",
  },
  {
    title: "yield",
    kicker: "accept",
    detail: "ASGI now accepts HTTP and WebSocket. On shutdown the poller stops, then Redis closes. The stream worker is its own process.",
  },
];

const TRUNK: Step[] = [
  {
    title: "Browser",
    kicker: "after yield",
    detail: "A request can enter only after lifespan reaches yield.",
  },
  {
    title: "Next.js BFF",
    kicker: "proxy.ts",
    detail: "The UI and BFF are a separate process. proxy.ts holds /dashboard until the session cookie is present.",
  },
  {
    title: "FastAPI",
    kicker: "shared trunk",
    detail: "Login, jobs, analytics, filings, memo reads, and the assistant all arrive at this API. The path splits after here.",
  },
];

const BRANCHES: Record<BranchId, { label: string; steps: Step[]; note?: string }> = {
  login: {
    label: "Login",
    steps: [
      {
        title: "/login",
        kicker: "browser",
        detail: "The browser submits credentials to the BFF.",
      },
      {
        title: "JWT",
        kicker: "FastAPI",
        detail: "FastAPI checks the user and issues a JWT.",
      },
      {
        title: "session_token",
        kicker: "cookie",
        detail: "The BFF stores that JWT as the session_token cookie.",
      },
      {
        title: "/dashboard",
        kicker: "proxy.ts",
        detail: "proxy.ts then lets /dashboard through.",
      },
    ],
  },
  jobs: {
    label: "Jobs",
    steps: [
      {
        title: "POST /api/jobs",
        kicker: "one or batch",
        detail: "POST /api/jobs/{ticker} or /api/jobs/batch. JWT and the rate limit run first.",
      },
      {
        title: "Redis + XADD",
        kicker: "queued",
        detail: "The job is stored in Redis and XADD writes stream:intel_jobs. The HTTP response is 202.",
      },
      {
        title: "XREADGROUP",
        kicker: "processing",
        detail: "A worker claims the message and the job moves to processing.",
      },
      {
        title: "LangGraph",
        kicker: "reason → gate",
        detail: "The graph runs reason, tools, memo, then the gate. A Groq circuit can stop the gate.",
      },
      {
        title: "Postgres + cache",
        kicker: "completed",
        detail: "The outcome is written to Postgres and cache:intel:{TICKER}.",
      },
      {
        title: "WebSocket",
        kicker: "back",
        detail: "The result is pushed to the browser on the WebSocket.",
      },
    ],
    note: "Three failures mark the job dead_lettered on stream:intel_jobs:dlq. That stop is not the path drawn here.",
  },
  analytics: {
    label: "Analytics",
    steps: [
      {
        title: "GET",
        kicker: "overview",
        detail: "An analytics or overview GET goes through the same BFF. No job is created.",
      },
      {
        title: "SQL",
        kicker: "read",
        detail: "FastAPI reads sectors, composite, and OHLCV. There is no stream hop and no LangGraph hop.",
      },
      {
        title: "Response",
        kicker: "back",
        detail: "JSON returns along the same trunk.",
      },
    ],
  },
  filings: {
    label: "Filings",
    steps: [
      {
        title: "Ingest",
        kicker: "request",
        detail: "A PDF upload or an EDGAR sync request chunks the filing. This is not the boot daemon, and it does not open a research job.",
      },
      {
        title: "Redis chunks",
        kicker: "doc:{id}",
        detail: "Chunks wait in Redis under that document id. They are not written to stream:intel_jobs.",
      },
      {
        title: "Embed",
        kicker: "pgvector",
        detail: "A follow-up embed call writes vectors into Postgres document_chunks.",
      },
      {
        title: "Search",
        kicker: "later GET",
        detail: "A later search embeds the question and reads those vectors. No stream hop and no LangGraph hop.",
      },
    ],
    note: "Search is its own request. Ingest and embed are what put the filing into Postgres first.",
  },
  memo: {
    label: "Memo",
    steps: [
      {
        title: "GET memo",
        kicker: "read",
        detail: "GET /api/intelligence/memo/{ticker} asks for a memo that a job already finished. No new job is queued.",
      },
      {
        title: "cache:intel",
        kicker: "hit",
        detail: "Redis is checked first. A hit returns the stored result and stops there.",
      },
      {
        title: "Postgres",
        kicker: "miss",
        detail: "A miss reads the last saved result and refills the cache. LangGraph does not run again.",
      },
      {
        title: "Markdown",
        kicker: "back",
        detail: "FastAPI formats that payload as the memo and returns it on the same HTTP call.",
      },
    ],
    note: "The arrow visits both stores so the miss is visible. A real hit never reaches Postgres.",
  },
  assistant: {
    label: "Assistant",
    steps: [
      {
        title: "Chat",
        kicker: "panel",
        detail: "The assistant posts the question and the open page route to /v1/ai-bot/chat.",
      },
      {
        title: "Page prompt",
        kicker: "grounding",
        detail: "The reply is grounded in that page. This is not the research graph.",
      },
      {
        title: "Groq",
        kicker: "same request",
        detail: "One chat completion answers on this HTTP call. Nothing is written to the job stream.",
      },
    ],
    note: "Voice is the same hop with audio in and audio out. It is not drawn here.",
  },
};

const BOOT_ROWS: Step[][] = [BOOT.slice(0, 3), BOOT.slice(3, 7), BOOT.slice(7)];

const ASIDE = [
  {
    title: "fintech_stream_worker",
    body: "The only reader of stream:intel_jobs. python -m app.workers.consumer.",
  },
  {
    title: "Next.js",
    body: "Separate process (npm run dev). It is the UI and BFF. It is not started inside the FastAPI lifespan.",
  },
  {
    title: "n8n / Locust",
    body: "Compose sidecars. Optional, and off the research-job path.",
  },
  {
    title: "EdgarIngestionDaemon",
    body: "The class exists. Nothing in lifespan starts it, so it is not a boot daemon.",
  },
];

function Arrow({ hot, done, vertical = false }: { hot: boolean; done: boolean; vertical?: boolean }) {
  const tone = hot ? "text-cyan-300" : done ? "text-cyan-700" : "text-slate-700";
  if (vertical) {
    return (
      <div className={`relative mx-auto h-8 w-4 ${tone}`} aria-hidden>
        <div className={`absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 ${hot || done ? "bg-current" : "bg-slate-800"}`} />
        <svg viewBox="0 0 8 8" className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 fill-current">
          <path d="M0 0 L8 0 L4 8 Z" />
        </svg>
        {hot && <span className="runtime-dot-y absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-200 shadow-[0_0_8px_#a5f3fc]" />}
      </div>
    );
  }
  return (
    <div className={`relative h-4 w-7 shrink-0 ${tone}`} aria-hidden>
      <div className={`absolute left-0 right-2 top-1/2 h-px -translate-y-1/2 ${hot || done ? "bg-current" : "bg-slate-800"}`} />
      <svg viewBox="0 0 8 8" className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 fill-current">
        <path d="M0 0 L8 4 L0 8 Z" />
      </svg>
      {hot && <span className="runtime-dot-x absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_8px_#a5f3fc]" />}
    </div>
  );
}

function Node({ step, state }: { step: Step; state: "wait" | "hot" | "done" }) {
  const frame =
    state === "hot"
      ? "border-cyan-400/80 bg-cyan-950/40 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]"
      : state === "done"
        ? "border-cyan-900 bg-slate-950"
        : "border-slate-800 bg-slate-950/40";
  const title = state === "wait" ? "text-slate-500" : "text-slate-100";
  const kicker = state === "hot" ? "text-cyan-300" : "text-slate-500";
  return (
    <div className={`w-[8.25rem] shrink-0 rounded-md border px-2.5 py-2 ${frame}`}>
      <div className={`text-[10px] uppercase tracking-wide ${kicker}`}>{step.kicker}</div>
      <div className={`mt-0.5 text-sm font-medium leading-tight ${title}`}>{step.title}</div>
    </div>
  );
}

function nodeState(index: number, activeIndex: number): "wait" | "hot" | "done" {
  if (activeIndex === -1) return "done";
  if (activeIndex < 0) return "wait";
  if (index === activeIndex) return "hot";
  if (index < activeIndex) return "done";
  return "wait";
}

function Row({ steps, activeIndex }: { steps: Step[]; activeIndex: number }) {
  return (
    <div className="flex min-w-max items-center">
      {steps.map((step, index) => (
        <div key={`${step.kicker}-${step.title}`} className="flex items-center">
          <Node step={step} state={nodeState(index, activeIndex)} />
          {index < steps.length - 1 && (
            <Arrow
              hot={activeIndex === index + 1}
              done={activeIndex === -1 || activeIndex > index + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function RuntimeFlow() {
  const [cursor, setCursor] = useState<{ act: "boot" | "traffic"; step: number }>({
    act: "boot",
    step: 0,
  });
  const [branch, setBranch] = useState<BranchId>("jobs");
  const [playing, setPlaying] = useState(true);

  const { act, step } = cursor;
  const branchSteps = BRANCHES[branch].steps;
  const trafficLength = TRUNK.length + branchSteps.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursor((current) => {
        if (current.act === "boot") {
          if (current.step >= BOOT.length - 1) return { act: "traffic", step: 0 };
          return { act: "boot", step: current.step + 1 };
        }
        if (current.step >= trafficLength - 1) return { act: "traffic", step: 0 };
        return { act: "traffic", step: current.step + 1 };
      });
    }, 1300);
    return () => window.clearInterval(id);
  }, [playing, trafficLength]);

  const onTrunk = act === "traffic" && step < TRUNK.length;

  function bootRowIndex(start: number, length: number) {
    if (act !== "boot") return -1;
    if (step >= start + length) return -1;
    if (step < start) return -2;
    return step - start;
  }
  const branchIndex = act === "traffic" && step >= TRUNK.length ? step - TRUNK.length : -2;
  const spoken =
    act === "boot"
      ? BOOT[step]
      : step < TRUNK.length
        ? TRUNK[step]
        : branchSteps[step - TRUNK.length];

  function goBoot() {
    setCursor({ act: "boot", step: 0 });
    setPlaying(true);
  }

  function goTraffic(next: BranchId = branch) {
    setBranch(next);
    setCursor({ act: "traffic", step: 0 });
    setPlaying(true);
  }

  return (
    <div className="space-y-6 pb-36">
      <style>{`
        @keyframes runtime-x {
          0% { left: 0; opacity: 0; }
          20% { opacity: 1; }
          100% { left: calc(100% - 6px); opacity: 1; }
        }
        @keyframes runtime-y {
          0% { top: 0; opacity: 0; }
          20% { opacity: 1; }
          100% { top: calc(100% - 10px); opacity: 1; }
        }
        @keyframes runtime-spin { to { transform: rotate(360deg); } }
        .runtime-dot-x { animation: runtime-x 1.3s linear infinite; }
        .runtime-dot-y { animation: runtime-y 1.3s linear infinite; }
        .runtime-spin { transform-origin: 10px 10px; animation: runtime-spin 2.8s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .runtime-dot-x, .runtime-dot-y, .runtime-spin { animation: none; }
        }
      `}</style>

      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
        How this stack comes up, then how a request moves. The arrow is telling that sequence.
        It is not reading probes, jobs, or Redis.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={goBoot}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            act === "boot"
              ? "border-cyan-700 bg-cyan-950/50 text-cyan-100"
              : "border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          Act 1 — Boot
        </button>
        <button
          type="button"
          onClick={() => goTraffic()}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            act === "traffic"
              ? "border-cyan-700 bg-cyan-950/50 text-cyan-100"
              : "border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          Act 2 — Traffic
        </button>
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          className="rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-700"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={goBoot}
          className="rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-700"
        >
          Replay
        </button>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-200">Act 1 — Boot</h2>
          <p className="text-xs text-slate-500">Nothing from the browser yet</p>
        </div>
        <div className="space-y-1">
          {BOOT_ROWS.map((row, rowIndex) => {
            const start = BOOT_ROWS.slice(0, rowIndex).reduce((sum, item) => sum + item.length, 0);
            return (
              <div key={row[0].title}>
                {rowIndex > 0 && (
                  <Arrow
                    hot={act === "boot" && step === start}
                    done={act !== "boot" || step > start}
                    vertical
                  />
                )}
                <div className="overflow-x-auto">
                  <Row steps={row} activeIndex={bootRowIndex(start, row.length)} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ASIDE.map((item) => (
            <div key={item.title} className="rounded-md border border-dashed border-slate-800 px-3 py-2">
              <div className="text-xs font-medium text-slate-300">{item.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className={`space-y-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4 ${
          act === "boot" ? "opacity-40" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-slate-200">Act 2 — Traffic</h2>
            <p className="mt-0.5 text-xs text-slate-500">One trunk, then the branch you select</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-md border border-slate-800 p-1">
            {(Object.keys(BRANCHES) as BranchId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => goTraffic(id)}
                className={`rounded px-2.5 py-1 text-xs ${
                  branch === id && act === "traffic"
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {BRANCHES[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Row steps={TRUNK} activeIndex={onTrunk ? step : act === "traffic" ? -1 : -2} />
        </div>
        <Arrow hot={act === "traffic" && step === TRUNK.length} done={act === "traffic" && step > TRUNK.length} vertical />
        <div className="overflow-x-auto">
          <Row steps={branchSteps} activeIndex={branchIndex} />
        </div>
        {branch === "jobs" && BRANCHES.jobs.note && (
          <p className="text-xs leading-relaxed text-red-300/80">{BRANCHES.jobs.note}</p>
        )}
        {branch === "analytics" && (
          <p className="text-xs text-slate-500">Thin branch. The worker, the stream, and LangGraph stay out of this hop.</p>
        )}
        {BRANCHES[branch].note && branch !== "jobs" && branch !== "analytics" && (
          <p className="text-xs leading-relaxed text-slate-500">{BRANCHES[branch].note}</p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <DaemonLoop
            title="Market poller"
            body="Keeps writing prices to Postgres. A daemon loop, not a click."
            live={act === "traffic"}
          />
          <DaemonLoop
            title="Stream worker"
            body="fintech_stream_worker keeps reading stream:intel_jobs."
            live={act === "traffic"}
          />
        </div>
      </section>

      <div
        className="fixed bottom-4 left-3 right-20 z-30 md:left-[16.5rem]"
        aria-live="polite"
      >
        <div className="max-w-xl rounded-lg border border-cyan-900/80 bg-slate-950/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-wide text-cyan-400/90">
              {act === "boot" ? "Act 1 — Boot" : `Act 2 — ${BRANCHES[branch].label}`}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{spoken?.kicker}</span>
          </div>
          <div className="mt-1 text-sm font-medium text-slate-100">{spoken?.title}</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{spoken?.detail}</p>
        </div>
      </div>
    </div>
  );
}

function DaemonLoop({ title, body, live }: { title: string; body: string; live: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-800 px-3 py-2">
      <svg viewBox="0 0 20 20" className={`mt-0.5 h-5 w-5 shrink-0 ${live ? "text-cyan-400" : "text-slate-600"}`} aria-hidden>
        <circle
          cx="10"
          cy="10"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="6 4"
          className={live ? "runtime-spin" : ""}
        />
        <path d="M10 3.2 l2.1 2.4 h-4.2 z" fill="currentColor" />
      </svg>
      <div>
        <div className="text-xs font-medium text-slate-300">
          {title} <span className="font-normal text-slate-500">daemon</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  );
}
