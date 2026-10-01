"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  GraphTopologyResponse,
  GraphExecutionTraceResponse,
  AgentNodeExecutionStep,
  GraphNodeSpec,
  AgentTokenSummaryReport,
  GraphStreamingEvent,
} from "../types/api";

const NODE_THEMES: Record<
  string,
  {
    border: string;
    bg: string;
    text: string;
    badge: string;
    badgeBg: string;
    glow: string;
    icon: string;
  }
> = {
  AGENT: {
    border: "border-emerald-500/70",
    bg: "bg-emerald-950/40",
    text: "text-emerald-300",
    badge: "text-emerald-400",
    badgeBg: "bg-emerald-900/60 border-emerald-700/50",
    glow: "shadow-[0_0_24px_rgba(16,185,129,0.35)]",
    icon: "🧠",
  },
  TOOL: {
    border: "border-purple-500/70",
    bg: "bg-purple-950/40",
    text: "text-purple-300",
    badge: "text-purple-400",
    badgeBg: "bg-purple-900/60 border-purple-700/50",
    glow: "shadow-[0_0_24px_rgba(168,85,247,0.35)]",
    icon: "⚙️",
  },
  REPORTING: {
    border: "border-cyan-500/70",
    bg: "bg-cyan-950/40",
    text: "text-cyan-300",
    badge: "text-cyan-400",
    badgeBg: "bg-cyan-900/60 border-cyan-700/50",
    glow: "shadow-[0_0_24px_rgba(6,182,212,0.35)]",
    icon: "📝",
  },
  GATEKEEPER: {
    border: "border-amber-500/70",
    bg: "bg-amber-950/40",
    text: "text-amber-300",
    badge: "text-amber-400",
    badgeBg: "bg-amber-900/60 border-amber-700/50",
    glow: "shadow-[0_0_24px_rgba(245,158,11,0.35)]",
    icon: "🛡️",
  },
  SYSTEM: {
    border: "border-blue-500/70",
    bg: "bg-blue-950/40",
    text: "text-blue-300",
    badge: "text-blue-400",
    badgeBg: "bg-blue-900/60 border-blue-700/50",
    glow: "shadow-[0_0_24px_rgba(59,130,246,0.35)]",
    icon: "🏆",
  },
};

const SIGNAL_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  BUY: {
    bg: "bg-emerald-950/60",
    text: "text-emerald-400",
    border: "border-emerald-600/50",
  },
  SELL: {
    bg: "bg-rose-950/60",
    text: "text-rose-400",
    border: "border-rose-600/50",
  },
  HOLD: {
    bg: "bg-amber-950/60",
    text: "text-amber-400",
    border: "border-amber-600/50",
  },
  INVALID: {
    bg: "bg-gray-800/80",
    text: "text-gray-400",
    border: "border-gray-600/50",
  },
};

export function LangGraphTopologyVisualizer() {
  const [topology, setTopology] = useState<GraphTopologyResponse | null>(null);
  const [activeTrace, setActiveTrace] = useState<GraphExecutionTraceResponse | null>(null);
  const [recentTraces, setRecentTraces] = useState<GraphExecutionTraceResponse[]>([]);
  const [tokenSummary, setTokenSummary] = useState<AgentTokenSummaryReport | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>("NVDA");
  const [selectedScenario, setSelectedScenario] = useState<string>("NOMINAL");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("agent");
  const [activeTab, setActiveTab] = useState<"step" | "channels" | "tokens" | "history" | "json">("step");
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Fetch initial topology, traces, and token metrics
  const fetchTopology = useCallback(async () => {
    try {
      setLoading(true);
      const [resTopo, resTraces, resTokens] = await Promise.all([
        fetch("/api/cloud/graph/topology"),
        fetch("/api/cloud/graph/traces?limit=10"),
        fetch("/api/cloud/graph/tokens/summary"),
      ]);

      if (resTopo.ok) {
        const topoData: GraphTopologyResponse = await resTopo.json();
        setTopology(topoData);
      }

      if (resTraces.ok) {
        const tracesData: GraphExecutionTraceResponse[] = await resTraces.json();
        setRecentTraces(tracesData);
        if (tracesData.length > 0) {
          setActiveTrace(tracesData[0]);
          setCurrentStepIndex(tracesData[0].steps.length - 1);
        }
      }

      if (resTokens.ok) {
        const tokenData: AgentTokenSummaryReport = await resTokens.json();
        setTokenSummary(tokenData);
      }
    } catch (err) {
      console.error("Failed to load LangGraph topology", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  // Step player animation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && activeTrace) {
      timer = setTimeout(() => {
        if (currentStepIndex < activeTrace.steps.length - 1) {
          setCurrentStepIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
        }
      }, 1200);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, activeTrace]);

  // Execute simulation (instant scrubber)
  const handleRunSimulation = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/cloud/graph/simulate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: selectedTicker,
          scenario: selectedScenario,
        }),
      });

      if (res.ok) {
        const newTrace: GraphExecutionTraceResponse = await res.json();
        setActiveTrace(newTrace);
        setCurrentStepIndex(0);
        setIsPlaying(true);
        // Prepend to history
        setRecentTraces((prev) => [newTrace, ...prev.slice(0, 9)]);

        // Refresh token summary
        fetch("/api/cloud/graph/tokens/summary")
          .then((r) => r.ok && r.json())
          .then((d) => d && setTokenSummary(d))
          .catch(() => {});
      }
    } catch (err) {
      console.error("Simulation run error", err);
    } finally {
      setLoading(false);
    }
  };

  // Execute Live Real-Time SSE Stream
  const handleRunLiveStream = async () => {
    try {
      setIsStreaming(true);
      setLoading(true);
      setIsPlaying(false);
      setStreamLogs([]);

      const response = await fetch(
        `/api/cloud/graph/stream?ticker=${encodeURIComponent(
          selectedTicker
        )}&scenario=${encodeURIComponent(selectedScenario)}&delay_ms=90`
      );

      if (!response.ok || !response.body) {
        throw new Error(`Stream connection failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      const streamAccumulatedSteps: AgentNodeExecutionStep[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          const lines = evt.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));

          if (eventLine && dataLine) {
            const eventType = eventLine.replace("event: ", "").trim();
            const payload: GraphStreamingEvent = JSON.parse(
              dataLine.replace("data: ", "").trim()
            );

            setStreamLogs((prev) => [
              `[${payload.timestamp_iso.slice(11, 19)}] ${payload.event_type.toUpperCase()} -> ${payload.node_id} (${payload.status})`,
              ...prev.slice(0, 19),
            ]);

            if (eventType === "step_start" || eventType === "step_complete") {
              setSelectedNodeId(payload.node_id);
              if (eventType === "step_complete") {
                const stepObj: AgentNodeExecutionStep = {
                  step_number: payload.step_number,
                  node_id: payload.node_id,
                  node_label: payload.node_label,
                  status: payload.status,
                  duration_ms: payload.duration_ms,
                  input_state_summary: {},
                  output_state_delta: payload.state_delta,
                  messages_added_count: 1,
                  tokens_estimated: payload.token_cost?.total_tokens || 350,
                  token_cost: payload.token_cost,
                  timestamp_iso: payload.timestamp_iso,
                };
                streamAccumulatedSteps.push(stepObj);
                setCurrentStepIndex(streamAccumulatedSteps.length - 1);
              }
            } else if (eventType === "trace_complete") {
              const fullTrace: GraphExecutionTraceResponse = {
                execution_id: payload.execution_id,
                ticker: selectedTicker,
                scenario: selectedScenario,
                status: payload.status,
                total_duration_ms: payload.duration_ms,
                total_tokens_consumed: payload.token_cost?.total_tokens,
                total_cost_usd: payload.token_cost?.total_cost_usd,
                final_signal: (payload.state_delta?.final_signal as any) || "BUY",
                steps_count: streamAccumulatedSteps.length,
                steps: streamAccumulatedSteps,
                trace_id: "stream-trace-" + Date.now().toString(16),
                timestamp_iso: payload.timestamp_iso,
              };
              setActiveTrace(fullTrace);
              setRecentTraces((prev) => [fullTrace, ...prev.slice(0, 9)]);
            }
          }
        }
      }
    } catch (err) {
      console.error("Live streaming failed", err);
    } finally {
      setIsStreaming(false);
      setLoading(false);
      fetch("/api/cloud/graph/tokens/summary")
        .then((r) => r.ok && r.json())
        .then((d) => d && setTokenSummary(d))
        .catch(() => {});
    }
  };

  const handleCopyJSON = () => {
    const payload = {
      topology,
      activeTrace,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentStep: AgentNodeExecutionStep | undefined =
    activeTrace && activeTrace.steps.length > 0
      ? activeTrace.steps[currentStepIndex]
      : undefined;

  // Selected node details
  const selectedNodeSpec: GraphNodeSpec | undefined = topology?.nodes.find(
    (n) => n.id === selectedNodeId
  );

  return (
    <div className="space-y-6">
      {/* 1. Executive Mission Header */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-r from-gray-900/90 via-emerald-950/30 to-gray-900/90 p-6 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-xs tracking-wider text-emerald-400 uppercase font-semibold">
                LangGraph State Machine Engine • SPEC-GRAPH-TOPOLOGY
              </span>
              <span className="rounded-full border border-emerald-700/60 bg-emerald-900/40 px-2.5 py-0.5 font-mono text-[11px] text-emerald-300">
                {topology?.graph_id || "equity-research-multi-agent"} {topology?.version || "v1.0.0"}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              LangGraph Multi-Agent Topology & Dynamic Execution Tracer
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Interactive visual state graph mapping multi-agent reasoning, deterministic tool loops, SEC EDGAR RAG context, and zero-hallucination gatekeeper verifications.
            </p>
          </div>

          {/* Quick controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-gray-700/60 bg-gray-950/60 px-3 py-1.5 shadow-inner">
              <span className="text-xs font-medium text-gray-400">Ticker:</span>
              <select
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                className="bg-transparent font-mono text-xs font-semibold text-white focus:outline-none"
              >
                <option value="NVDA" className="bg-gray-900">NVDA (NVIDIA)</option>
                <option value="AAPL" className="bg-gray-900">AAPL (Apple)</option>
                <option value="MSFT" className="bg-gray-900">MSFT (Microsoft)</option>
                <option value="TSLA" className="bg-gray-900">TSLA (Tesla)</option>
                <option value="GOOGL" className="bg-gray-900">GOOGL (Alphabet)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-gray-700/60 bg-gray-950/60 px-3 py-1.5 shadow-inner">
              <span className="text-xs font-medium text-gray-400">Scenario:</span>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="bg-transparent font-mono text-xs font-semibold text-white focus:outline-none"
              >
                <option value="NOMINAL" className="bg-gray-900">Nominal Fast Path (3 Steps)</option>
                <option value="TOOL_EXPEDITION" className="bg-gray-900">Tool Expedition (5 Steps)</option>
                <option value="RETRY_LOOP" className="bg-gray-900">Quality Gate Retry Loop (6 Steps)</option>
                <option value="RAG_FAILURE" className="bg-gray-900">RAG Deficit Invariant (3 Steps)</option>
              </select>
            </div>

            <button
              onClick={handleRunLiveStream}
              disabled={loading || isStreaming}
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-cyan-500/80 bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 font-mono text-xs font-semibold text-white shadow-lg transition-all duration-200 hover:from-cyan-500 hover:to-blue-500 hover:shadow-cyan-500/25 active:scale-95 disabled:opacity-50"
            >
              <span className="text-sm">⚡</span>
              {isStreaming ? "Streaming..." : "Live SSE Stream"}
            </button>

            <button
              onClick={handleRunSimulation}
              disabled={loading || isStreaming}
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-emerald-500/80 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 font-mono text-xs font-semibold text-white shadow-lg transition-all duration-200 hover:from-emerald-500 hover:to-teal-500 hover:shadow-emerald-500/25 active:scale-95 disabled:opacity-50"
            >
              <span className="text-sm">▶</span>
              {loading && !isStreaming ? "Simulating..." : "Simulate Run"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur shadow-sm">
          <div className="text-xs font-medium text-gray-400">Total Nodes</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-white">
              {topology?.nodes.length || 5}
            </span>
            <span className="text-xs text-emerald-400">Introspected</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">Agent, Tools, Synthesis, Gate</div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur shadow-sm">
          <div className="text-xs font-medium text-gray-400">Directed Edges</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-cyan-400">
              {topology?.edges.length || 6}
            </span>
            <span className="text-xs text-cyan-300">4 Conditional</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">Corrective feedback enabled</div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur shadow-sm">
          <div className="text-xs font-medium text-gray-400">State Channels</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-purple-400">
              {topology?.state_channels.length || 10}
            </span>
            <span className="text-xs text-purple-300">TypedDict</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">operator.add accumulator</div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur shadow-sm">
          <div className="text-xs font-medium text-gray-400">Active Scenario</div>
          <div className="mt-1 font-mono text-sm font-bold text-amber-300 truncate">
            {activeTrace?.scenario || "NOMINAL"}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            {activeTrace?.ticker || selectedTicker} Run
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur shadow-sm">
          <div className="text-xs font-medium text-gray-400">Execution Latency</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-300">
              {activeTrace ? `${activeTrace.total_duration_ms.toFixed(1)}ms` : "117.0ms"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            {activeTrace?.steps_count || 3} sequential steps
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur shadow-sm">
          <div className="text-xs font-medium text-gray-400">Tokens & Cost</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold text-amber-300">
              {activeTrace?.total_tokens_consumed || 2035} tk
            </span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-mono">
            ${(activeTrace?.total_cost_usd || 0.0012).toFixed(4)} USD
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur shadow-sm">
          <div className="text-xs font-medium text-gray-400">Certified Signal</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`rounded-md border px-2.5 py-0.5 font-mono text-sm font-bold ${
                SIGNAL_STYLES[activeTrace?.final_signal || "BUY"].border
              } ${SIGNAL_STYLES[activeTrace?.final_signal || "BUY"].bg} ${
                SIGNAL_STYLES[activeTrace?.final_signal || "BUY"].text
              }`}
            >
              SIGNAL: {activeTrace?.final_signal || "BUY"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">Deterministic ternary</div>
        </div>
      </div>

      {/* 3. Interactive State Graph Visual Canvas */}
      <div className="relative rounded-2xl border border-gray-800 bg-gray-950/80 p-6 backdrop-blur-xl shadow-2xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Interactive Workflow Topology Canvas</span>
              <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-mono text-gray-400">
                React Flow Compatible
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Click any node to inspect channel deltas. Active node pulses in real-time during execution playback.
            </p>
          </div>

          {/* Stepper & Playback Controls */}
          {activeTrace && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/80 px-4 py-2">
              <button
                onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentStepIndex === 0}
                className="text-gray-400 hover:text-white disabled:opacity-30"
                title="Previous Step"
              >
                ◀
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="font-mono text-xs font-bold text-emerald-400 hover:text-emerald-300"
              >
                {isPlaying ? "⏸ Pause" : "▶ Play Replay"}
              </button>
              <button
                onClick={() =>
                  setCurrentStepIndex((prev) =>
                    Math.min(activeTrace.steps.length - 1, prev + 1)
                  )
                }
                disabled={currentStepIndex === activeTrace.steps.length - 1}
                className="text-gray-400 hover:text-white disabled:opacity-30"
                title="Next Step"
              >
                ▶
              </button>
              <div className="border-l border-gray-700 pl-3 font-mono text-xs text-gray-300">
                Step <span className="text-emerald-400 font-bold">{currentStepIndex + 1}</span> of{" "}
                {activeTrace.steps.length}
              </div>
            </div>
          )}
        </div>

        {/* SVG Topology Graph with Dynamic Connecting Edges */}
        <div className="relative w-full overflow-x-auto rounded-xl border border-gray-800/80 bg-gray-950/90 p-4">
          <svg
            className="w-full min-w-[950px] h-[440px]"
            viewBox="0 0 1000 440"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#10B981" />
              </marker>
              <marker
                id="arrowhead-cyan"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#06B6D4" />
              </marker>
              <marker
                id="arrowhead-amber"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#F59E0B" />
              </marker>
              <marker
                id="arrowhead-purple"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#A855F7" />
              </marker>
              <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Edge 1: agent -> tools (invoke_tools) */}
            <path
              d="M 270 120 C 370 70, 430 70, 520 100"
              stroke="#A855F7"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              className="animate-pulse"
              markerEnd="url(#arrowhead-purple)"
            />
            <text x="380" y="70" fill="#C084FC" fontSize="10" fontFamily="monospace">
              invoke_tools()
            </text>

            {/* Edge 2: tools -> agent (tool_result) */}
            <path
              d="M 520 140 C 430 170, 370 170, 270 140"
              stroke="#A855F7"
              strokeWidth="2"
              markerEnd="url(#arrowhead-purple)"
            />
            <text x="375" y="180" fill="#C084FC" fontSize="10" fontFamily="monospace">
              tool_output
            </text>

            {/* Edge 3: agent -> reporting (synthesize) */}
            <path
              d="M 210 180 L 210 280"
              stroke="#06B6D4"
              strokeWidth="2.5"
              markerEnd="url(#arrowhead-cyan)"
            />
            <text x="135" y="235" fill="#22D3EE" fontSize="10" fontFamily="monospace">
              no_tools / ready
            </text>

            {/* Edge 4: reporting -> gatekeeper (evaluate_quality) */}
            <path
              d="M 290 340 L 490 340"
              stroke="#06B6D4"
              strokeWidth="2.5"
              markerEnd="url(#arrowhead-cyan)"
            />
            <text x="350" y="330" fill="#22D3EE" fontSize="10" fontFamily="monospace">
              memo_handoff
            </text>

            {/* Edge 5: gatekeeper -> agent (retry_feedback loop) */}
            <path
              d="M 540 280 C 500 230, 340 230, 260 190"
              stroke="#F59E0B"
              strokeWidth="2.5"
              strokeDasharray="5 3"
              className="animate-pulse"
              markerEnd="url(#arrowhead-amber)"
            />
            <text x="360" y="225" fill="#FBBF24" fontSize="10" fontFamily="monospace">
              retry_feedback (is_sufficient=False)
            </text>

            {/* Edge 6: gatekeeper -> __end__ (certified) */}
            <path
              d="M 640 340 L 780 340"
              stroke="#10B981"
              strokeWidth="3"
              filter="url(#glow-filter)"
              markerEnd="url(#arrowhead)"
            />
            <text x="670" y="330" fill="#34D399" fontSize="10" fontFamily="monospace" fontWeight="bold">
              certified_signal
            </text>
          </svg>

          {/* Node Overlay Cards Positioned over Canvas */}
          <div className="pointer-events-none absolute inset-0 p-4">
            {topology?.nodes.map((node) => {
              const theme = NODE_THEMES[node.category] || NODE_THEMES.AGENT;
              const isSelected = selectedNodeId === node.id;
              const isCurrentlyActiveInStep = currentStep?.node_id === node.id;

              return (
                <div
                  key={node.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                  }}
                  style={{
                    left: `${(node.position_x / 1000) * 100}%`,
                    top: `${(node.position_y / 440) * 100}%`,
                  }}
                  className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 w-64 cursor-pointer rounded-2xl border p-4 transition-all duration-300 ${
                    theme.bg
                  } ${theme.border} ${
                    isCurrentlyActiveInStep
                      ? `${theme.glow} ring-2 ring-emerald-400 scale-105 z-20`
                      : isSelected
                      ? "ring-1 ring-white/50 z-10"
                      : "hover:scale-102 hover:border-gray-500 z-0"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{theme.icon}</span>
                      <span className="font-mono text-xs font-bold text-white truncate">
                        {node.id}
                      </span>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase ${theme.badgeBg} ${theme.badge}`}
                    >
                      {node.category}
                    </span>
                  </div>

                  <div className="mt-2 text-xs font-semibold text-gray-200">
                    {node.label}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-gray-400">
                    {node.description}
                  </div>

                  {node.tools_bound.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {node.tools_bound.map((tool) => (
                        <span
                          key={tool}
                          className="rounded bg-gray-900/80 px-1.5 py-0.5 font-mono text-[9px] text-purple-300 border border-purple-800/40"
                        >
                          🔧 {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Active Step Indicator pill */}
                  {isCurrentlyActiveInStep && currentStep && (
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-950/80 border border-emerald-700/60 px-2 py-1 text-[11px] font-mono text-emerald-300">
                      <span>Step {currentStep.step_number} Active</span>
                      <span>{currentStep.duration_ms.toFixed(1)}ms</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Tabbed Operational Inspector (Step Details, State Channels, History, JSON) */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 backdrop-blur shadow-xl">
        <div className="flex flex-wrap items-center justify-between border-b border-gray-800 pb-3 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("step")}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                activeTab === "step"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "bg-gray-800/60 text-gray-400 hover:text-white"
              }`}
            >
              Active Step Traversal ({currentStepIndex + 1}/{activeTrace?.steps.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("channels")}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                activeTab === "channels"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "bg-gray-800/60 text-gray-400 hover:text-white"
              }`}
            >
              State Channels (10 Keys)
            </button>
            <button
              onClick={() => setActiveTab("tokens")}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                activeTab === "tokens"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "bg-gray-800/60 text-gray-400 hover:text-white"
              }`}
            >
              LLM Tokens & Costs (${tokenSummary?.total_cost_usd?.toFixed(4) || "0.0051"})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                activeTab === "history"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "bg-gray-800/60 text-gray-400 hover:text-white"
              }`}
            >
              Execution History ({recentTraces.length})
            </button>
            <button
              onClick={() => setActiveTab("json")}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                activeTab === "json"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "bg-gray-800/60 text-gray-400 hover:text-white"
              }`}
            >
              Declarative JSON Spec
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-gray-400">
              Trace: <span className="text-gray-200">{activeTrace?.trace_id?.slice(0, 16)}...</span>
            </span>
            <button
              onClick={handleCopyJSON}
              className="rounded-lg border border-gray-700 bg-gray-800/80 px-2.5 py-1 font-mono text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              {copied ? "✓ Copied" : "Copy Spec"}
            </button>
          </div>
        </div>

        {/* Tab 1: Current Step Details */}
        {activeTab === "step" && currentStep && (
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
              <div className="text-xs font-mono font-semibold text-emerald-400 uppercase">
                Step Execution Summary
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between border-b border-gray-800/60 pb-1.5">
                  <span className="text-gray-400">Sequence:</span>
                  <span className="font-mono text-white">Step {currentStep.step_number}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800/60 pb-1.5">
                  <span className="text-gray-400">Invoked Node:</span>
                  <span className="font-mono font-semibold text-emerald-300">
                    {currentStep.node_id}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-800/60 pb-1.5">
                  <span className="text-gray-400">Node Status:</span>
                  <span
                    className={`font-mono font-bold ${
                      currentStep.status === "SUCCESS"
                        ? "text-emerald-400"
                        : currentStep.status === "RETRY"
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {currentStep.status}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-800/60 pb-1.5">
                  <span className="text-gray-400">Step Latency:</span>
                  <span className="font-mono text-white">{currentStep.duration_ms.toFixed(2)} ms</span>
                </div>
                <div className="flex justify-between border-b border-gray-800/60 pb-1.5">
                  <span className="text-gray-400">Tokens & Cost:</span>
                  <span className="font-mono text-amber-300">
                    {currentStep.tokens_estimated} tk • ${currentStep.token_cost?.total_cost_usd?.toFixed(6) || "0.000000"}
                  </span>
                </div>
                {currentStep.token_cost && (
                  <div className="flex justify-between border-b border-gray-800/60 pb-1.5">
                    <span className="text-gray-400">Model Architecture:</span>
                    <span className="font-mono text-cyan-300 text-[11px]">
                      {currentStep.token_cost.model_name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pb-1">
                  <span className="text-gray-400">Messages Appended:</span>
                  <span className="font-mono text-white">+{currentStep.messages_added_count}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
              <div className="text-xs font-mono font-semibold text-cyan-400 uppercase">
                State Channel Inputs
              </div>
              <pre className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-gray-900/90 p-3 font-mono text-[11px] text-gray-300">
                {JSON.stringify(currentStep.input_state_summary, null, 2)}
              </pre>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
              <div className="text-xs font-mono font-semibold text-purple-400 uppercase">
                State Channel Output Delta
              </div>
              <pre className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-gray-900/90 p-3 font-mono text-[11px] text-purple-300">
                {JSON.stringify(currentStep.output_state_delta, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 2: AgentState Channels Specification */}
        {activeTab === "channels" && topology && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-800 font-mono text-[11px] text-gray-400 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Channel Name</th>
                  <th className="py-2.5 px-3">Type Annotation</th>
                  <th className="py-2.5 px-3">Reducer</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Example Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {topology.state_channels.map((chan) => (
                  <tr key={chan.channel_name} className="hover:bg-gray-800/30">
                    <td className="py-2 px-3 font-bold text-emerald-300">{chan.channel_name}</td>
                    <td className="py-2 px-3 text-cyan-300">{chan.type_name}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          chan.reducer === "operator.add"
                            ? "bg-purple-950 text-purple-300 border border-purple-800"
                            : "bg-gray-800 text-gray-300"
                        }`}
                      >
                        {chan.reducer}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans text-gray-400">{chan.description}</td>
                    <td className="py-2 px-3 text-gray-500 truncate max-w-xs">
                      {chan.example_value || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: LLM Tokens & Cost Telemetry */}
        {activeTab === "tokens" && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                <div className="text-xs text-gray-400">Total Analyzed Tokens</div>
                <div className="mt-1 font-mono text-xl font-bold text-white">
                  {tokenSummary?.total_tokens?.toLocaleString() || "8,135"}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {tokenSummary?.total_prompt_tokens?.toLocaleString() || "5,820"} in • {tokenSummary?.total_completion_tokens?.toLocaleString() || "2,315"} out
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                <div className="text-xs text-gray-400">Total Operational Cost</div>
                <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
                  ${tokenSummary?.total_cost_usd?.toFixed(5) || "0.00512"} USD
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  $0.59 / 1M prompt • $0.79 / 1M gen
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                <div className="text-xs text-gray-400">Avg Tokens / Run</div>
                <div className="mt-1 font-mono text-xl font-bold text-cyan-300">
                  {tokenSummary?.avg_tokens_per_run?.toFixed(0) || "1,627"}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">Per investment thesis</div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                <div className="text-xs text-gray-400">Avg Cost / Run</div>
                <div className="mt-1 font-mono text-xl font-bold text-purple-300">
                  ${tokenSummary?.avg_cost_per_run_usd?.toFixed(5) || "0.00102"} USD
                </div>
                <div className="mt-1 text-[11px] text-gray-500">Sub-cent multi-agent run</div>
              </div>
            </div>

            {/* Per-node breakdown table */}
            <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/60">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-gray-800 font-mono text-[11px] text-gray-400 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Node</th>
                    <th className="py-2.5 px-3">Model Architecture</th>
                    <th className="py-2.5 px-3">Prompt Tokens</th>
                    <th className="py-2.5 px-3">Completion Tokens</th>
                    <th className="py-2.5 px-3">Total Tokens</th>
                    <th className="py-2.5 px-3">Input Cost</th>
                    <th className="py-2.5 px-3">Output Cost</th>
                    <th className="py-2.5 px-3">Total Cost (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono">
                  {tokenSummary &&
                    Object.entries(tokenSummary.by_node).map(([nodeId, spec]) => (
                      <tr key={nodeId} className="hover:bg-gray-800/30">
                        <td className="py-2 px-3 font-bold text-emerald-300">{nodeId}</td>
                        <td className="py-2 px-3 text-cyan-300">{spec.model_name}</td>
                        <td className="py-2 px-3 text-gray-300">{spec.prompt_tokens.toLocaleString()}</td>
                        <td className="py-2 px-3 text-gray-300">{spec.completion_tokens.toLocaleString()}</td>
                        <td className="py-2 px-3 font-semibold text-white">{spec.total_tokens.toLocaleString()}</td>
                        <td className="py-2 px-3 text-gray-400">${spec.prompt_cost_usd.toFixed(6)}</td>
                        <td className="py-2 px-3 text-gray-400">${spec.completion_cost_usd.toFixed(6)}</td>
                        <td className="py-2 px-3 font-bold text-emerald-400">${spec.total_cost_usd.toFixed(6)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Live SSE Stream Event Log */}
            {streamLogs.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-950/80 p-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                  <span className="text-xs font-mono text-cyan-400 uppercase font-semibold">
                    Real-Time SSE Stream Feed
                  </span>
                  <span className="text-[11px] font-mono text-gray-400">
                    {streamLogs.length} events received
                  </span>
                </div>
                <div className="mt-2 space-y-1 max-h-36 overflow-y-auto font-mono text-[11px] text-gray-300">
                  {streamLogs.map((log, i) => (
                    <div key={i} className="text-emerald-400/90">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Recent Execution History */}
        {activeTab === "history" && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-800 font-mono text-[11px] text-gray-400 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Run ID</th>
                  <th className="py-2.5 px-3">Ticker</th>
                  <th className="py-2.5 px-3">Scenario</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Signal</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Steps</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {recentTraces.map((tr) => (
                  <tr
                    key={tr.execution_id}
                    className={`hover:bg-gray-800/30 ${
                      activeTrace?.execution_id === tr.execution_id ? "bg-emerald-950/20" : ""
                    }`}
                  >
                    <td className="py-2 px-3 text-gray-300">{tr.execution_id}</td>
                    <td className="py-2 px-3 font-bold text-white">{tr.ticker}</td>
                    <td className="py-2 px-3 text-amber-300">{tr.scenario}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          tr.status === "SUCCESS"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : tr.status === "DEGRADED"
                            ? "bg-amber-950 text-amber-400 border border-amber-800"
                            : "bg-rose-950 text-rose-400 border border-rose-800"
                        }`}
                      >
                        {tr.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold text-white">{tr.final_signal}</td>
                    <td className="py-2 px-3 text-gray-300">{tr.total_duration_ms.toFixed(1)}ms</td>
                    <td className="py-2 px-3 text-gray-400">{tr.steps_count}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => {
                          setActiveTrace(tr);
                          setCurrentStepIndex(0);
                          setActiveTab("step");
                        }}
                        className="rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-200 hover:bg-emerald-600 hover:text-white"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 5: Declarative JSON Spec */}
        {activeTab === "json" && (
          <div className="mt-4">
            <pre className="max-h-96 overflow-y-auto rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-xs text-emerald-300">
              {JSON.stringify({ topology, activeTrace, tokenSummary }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
