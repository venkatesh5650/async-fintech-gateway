"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import OperationsConsole, { OpsPillarId, OpsTab } from "@/components/OperationsConsole";
import TraceWaterfallModal from "@/components/TraceWaterfallModal";

const SECTIONS: Record<
  string,
  { title: string; pillar: OpsPillarId; tab: OpsTab }
> = {
  agents: { title: "Agents", pillar: "intelligence", tab: "langgraph" },
  telemetry: { title: "Telemetry", pillar: "telemetry", tab: "metrics" },
  resilience: { title: "Resilience", pillar: "resilience", tab: "stress" },
  cache: { title: "Cache", pillar: "storage", tab: "cache" },
  governance: { title: "Governance", pillar: "governance", tab: "capstone3" },
};

export default function PlatformSection({ section }: { section: string }) {
  const config = SECTIONS[section];
  const [tab, setTab] = useState<OpsTab>(config?.tab ?? "langgraph");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const allowed = useMemo(() => (config ? [config.pillar] : undefined), [config]);

  if (!config) {
    return (
      <div className="px-4 py-8 text-sm text-slate-400">
        Unknown platform section.{" "}
        <Link href="/dashboard/platform" className="text-cyan-300">
          Back to Platform
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/platform" className="text-xs text-slate-500 hover:text-slate-300">
            Platform
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">{config.title}</h1>
        </div>
      </div>
      <OperationsConsole
        activeOpsTab={tab}
        setActiveOpsTab={setTab}
        allowedPillars={allowed}
        onSelectTrace={setSelectedTraceId}
      />
      <TraceWaterfallModal
        traceId={selectedTraceId}
        onClose={() => setSelectedTraceId(null)}
      />
    </div>
  );
}
