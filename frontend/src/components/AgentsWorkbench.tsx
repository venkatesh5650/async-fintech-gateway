"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import JobAuditPanel from "@/components/JobAuditPanel";
import {
  GraphExecutionTraceResponse,
  GraphNodeSpec,
  GraphTopologyResponse,
} from "@/types/api";

const NODE_ORDER = ["agent", "tools", "reporting", "gatekeeper"];

function nodeTone(category: string) {
  switch (category) {
    case "AGENT":
      return "border-cyan-800 bg-cyan-950/40 text-cyan-200";
    case "TOOL":
      return "border-violet-800 bg-violet-950/40 text-violet-200";
    case "REPORTING":
      return "border-emerald-800 bg-emerald-950/40 text-emerald-200";
    case "GATEKEEPER":
      return "border-amber-800 bg-amber-950/40 text-amber-200";
    default:
      return "border-slate-700 bg-slate-900 text-slate-200";
  }
}

function formatMs(ms?: number) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AgentsWorkbench({
  onSelectTrace,
}: {
  onSelectTrace?: (traceId: string) => void;
}) {
  const [topology, setTopology] = useState<GraphTopologyResponse | null>(null);
  const [traces, setTraces] = useState<GraphExecutionTraceResponse[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("agent");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topoRes, tracesRes] = await Promise.all([
        fetch("/api/cloud/graph/topology", { cache: "no-store" }),
        fetch("/api/cloud/graph/traces?limit=8", { cache: "no-store" }),
      ]);
      if (!topoRes.ok) throw new Error(`Topology HTTP ${topoRes.status}`);
      const topo: GraphTopologyResponse = await topoRes.json();
      setTopology(topo);
      if (topo.entry_point) setSelectedNodeId(topo.entry_point);

      if (tracesRes.ok) {
        const list: GraphExecutionTraceResponse[] = await tracesRes.json();
        setTraces(Array.isArray(list) ? list : []);
        if (list?.[0]?.execution_id) setSelectedTraceId(list[0].execution_id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load graph spec");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nodes = useMemo(() => {
    const list = topology?.nodes ?? [];
    return [...list].sort((a, b) => {
      const ai = NODE_ORDER.indexOf(a.id);
      const bi = NODE_ORDER.indexOf(b.id);
      if (ai === -1 && bi === -1) return a.position_x - b.position_x;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [topology]);

  const selectedNode: GraphNodeSpec | undefined = nodes.find((n) => n.id === selectedNodeId);
  const selectedTrace = traces.find((t) => t.execution_id === selectedTraceId) ?? traces[0];

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
        Live research jobs from the desk, plus the compiled LangGraph path they
        run: reason → tools → memo → quality gate. Replay rows are topology
        traces, not a second source of BUY/SELL.
      </p>

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-200">Graph</h2>
          <span className="font-mono text-[10px] text-slate-500">
            {topology ? `${topology.graph_id} · ${topology.version}` : loading ? "Loading…" : "—"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {nodes.map((node, idx) => (
            <div key={node.id} className="flex items-center gap-2">
              {idx > 0 && <span className="text-slate-600">→</span>}
              <button
                type="button"
                onClick={() => setSelectedNodeId(node.id)}
                className={`rounded-md border px-3 py-2 text-left text-xs font-medium ${nodeTone(
                  node.category
                )} ${selectedNodeId === node.id ? "ring-1 ring-cyan-500/60" : ""}`}
              >
                <div>{node.label}</div>
                <div className="mt-0.5 font-mono text-[10px] opacity-70">{node.id}</div>
              </button>
            </div>
          ))}
        </div>
        {selectedNode && (
          <div className="mt-4 rounded-md border border-slate-800 bg-black/40 px-3 py-3 text-sm text-slate-300">
            <div className="text-xs uppercase tracking-wide text-slate-500">{selectedNode.node_type}</div>
            <p className="mt-1">{selectedNode.description}</p>
            {selectedNode.tools_bound.length > 0 && (
              <p className="mt-2 font-mono text-[11px] text-slate-500">
                Tools: {selectedNode.tools_bound.join(", ")}
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-200">Live jobs</h2>
        <p className="mb-3 text-xs text-slate-500">
          Redis registry for analyses started from Research. Click a trace id for the waterfall.
        </p>
        <JobAuditPanel onSelectTrace={onSelectTrace} />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
        <h2 className="text-sm font-medium text-slate-200">Graph replay</h2>
        <p className="mt-1 text-xs text-slate-500">
          Last recorded topology traces (scenarios such as NOMINAL). Use these to inspect node
          order and duration, not as the desk memo.
        </p>

        {traces.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No replay traces yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="pb-2 pr-3 font-normal">Ticker</th>
                  <th className="pb-2 pr-3 font-normal">Path</th>
                  <th className="pb-2 pr-3 font-normal">Status</th>
                  <th className="pb-2 pr-3 font-normal">Duration</th>
                  <th className="pb-2 pr-3 font-normal">Signal</th>
                  <th className="pb-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <tr
                    key={trace.execution_id}
                    onClick={() => setSelectedTraceId(trace.execution_id)}
                    className={`cursor-pointer border-b border-slate-900 hover:bg-slate-900/50 ${
                      selectedTrace?.execution_id === trace.execution_id ? "bg-slate-900/80" : ""
                    }`}
                  >
                    <td className="py-2 pr-3 font-medium text-slate-100">{trace.ticker}</td>
                    <td className="py-2 pr-3 font-mono text-slate-400">{trace.scenario}</td>
                    <td className="py-2 pr-3 text-slate-300">{trace.status}</td>
                    <td className="py-2 pr-3 font-mono text-slate-400">{formatMs(trace.total_duration_ms)}</td>
                    <td className="py-2 pr-3 font-mono text-slate-300">{trace.final_signal || "—"}</td>
                    <td className="py-2 text-slate-500">{formatWhen(trace.timestamp_iso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedTrace && (
          <ol className="mt-4 space-y-2">
            {selectedTrace.steps.map((step) => (
              <li
                key={`${selectedTrace.execution_id}-${step.step_number}`}
                className="rounded-md border border-slate-800 bg-black/30 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-200">
                    {step.step_number}. {step.node_label}
                  </span>
                  <span className="font-mono text-slate-500">
                    {step.status} · {formatMs(step.duration_ms)}
                    {step.tokens_estimated ? ` · ${step.tokens_estimated} tok` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
