import Link from "next/link";

const SECTIONS = [
  {
    href: "/dashboard/platform/agents",
    title: "Agents",
    body: "LangGraph topology, job registry, and traces.",
  },
  {
    href: "/dashboard/platform/telemetry",
    title: "Telemetry",
    body: "Prometheus metrics, Grafana specs, probes, and stream health.",
  },
  {
    href: "/dashboard/platform/resilience",
    title: "Resilience",
    body: "Load tests, circuit breaker, dead-letter queue, and pool pressure.",
  },
  {
    href: "/dashboard/platform/cache",
    title: "Cache",
    body: "Cache health and per-ticker inspector.",
  },
  {
    href: "/dashboard/platform/governance",
    title: "Governance",
    body: "Go-live certificate, architecture, code quality, and API docs.",
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
