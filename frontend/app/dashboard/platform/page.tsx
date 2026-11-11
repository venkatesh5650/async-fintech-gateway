import Link from "next/link";

const SECTIONS = [
  {
    href: "/dashboard/platform/runtime",
    title: "Runtime",
    body: "How the stack boots, then how each request moves: login, jobs, analytics, filings, memo reads, and the assistant. A sequence, not a live probe.",
  },
  {
    href: "/dashboard/platform/agents",
    title: "Agents",
    body: "Live research jobs and the LangGraph path they run (reason → tools → memo → gate).",
  },
  {
    href: "/dashboard/platform/telemetry",
    title: "Telemetry",
    body: "Request counters for this API process, Redis stream lag, and Postgres/Redis probes.",
  },
  {
    href: "/dashboard/platform/resilience",
    title: "Resilience",
    body: "Groq circuit, Redis DLQ, Postgres pool, and Redis memory for this process.",
  },
  {
    href: "/dashboard/platform/cache",
    title: "Cache",
    body: "Redis cache:intel keys, this process hit/miss counters, and per-ticker lookup.",
  },
  {
    href: "/dashboard/platform/governance",
    title: "Governance",
    body: "Runtime env (masked), live probes, Postgres seed counts, and OpenAPI.",
  },
];

export default function PlatformPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Platform</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Engineer tools from the operations console. Research, filings, and
          batch runs stay on the client desk.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-4 hover:border-slate-700"
          >
            <div className="text-sm font-medium text-slate-100">{section.title}</div>
            <p className="mt-1 text-sm text-slate-400">{section.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
