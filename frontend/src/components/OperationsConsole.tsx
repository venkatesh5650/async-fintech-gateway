"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  Cpu,
  Activity,
  ShieldAlert,
  BookOpen,
  Database,
  Award,
  ChevronRight,
  Layers,
  LayoutGrid,
  Rows3,
  SlidersHorizontal,
} from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

import JobAuditPanel from "./JobAuditPanel";
import DLQInspectorPanel from "./DLQInspectorPanel";
import StreamHealthMonitor from "./StreamHealthMonitor";
import CircuitBreakerPanel from "./CircuitBreakerPanel";
import DistributedTraceExplorer from "./DistributedTraceExplorer";
import CacheHealthMonitor from "./CacheHealthMonitor";
import CacheInspectorPanel from "./CacheInspectorPanel";
import DocumentUploadPanel from "./DocumentUploadPanel";
import { DocumentSearchPanel } from "./DocumentSearchPanel";
import { RAGContextViewer } from "./RAGContextViewer";
import { DocumentLibraryPanel } from "./DocumentLibraryPanel";
import LoadTestResultsPanel from "./LoadTestResultsPanel";
import ConnectionPoolMonitor from "./ConnectionPoolMonitor";
import RedisMemoryPressureCard from "./RedisMemoryPressureCard";
import EventLoopLatencyChart from "./EventLoopLatencyChart";
import ChaosRecoveryTimeline from "./ChaosRecoveryTimeline";
import { RegressionAuditDashboard } from "./RegressionAuditDashboard";
import { ArchitectureDiagramViewer } from "./ArchitectureDiagramViewer";
import { CodeQualityPanel } from "./CodeQualityPanel";
import { ApiDocsBrowser } from "./ApiDocsBrowser";
import { Phase2CapstoneReportPanel } from "./Phase2CapstoneReport";
import { ContainerSpecViewer } from "./ContainerSpecViewer";
import { CloudTopologyMap } from "./CloudTopologyMap";
import { CloudHealthMatrix } from "./CloudHealthMatrix";
import { EnvironmentProfileCard } from "./EnvironmentProfileCard";
import { ProductionSeedingConsole } from "./ProductionSeedingConsole";
import { PrometheusMetricsConsole } from "./PrometheusMetricsConsole";
import { GrafanaDashboardSpecPanel } from "./GrafanaDashboardSpecPanel";
import { TraceWaterfallExplorer } from "./TraceWaterfallExplorer";
import { ProductionIngressPanel } from "./ProductionIngressPanel";
import { ProductionSmokeTestPanel } from "./ProductionSmokeTestPanel";
import { LangGraphTopologyVisualizer } from "./LangGraphTopologyVisualizer";

export type OpsTab =
  | "langgraph"
  | "capstone3"
  | "metrics"
  | "grafana"
  | "waterfall"
  | "ingress"
  | "seeding"
  | "env"
  | "probes"
  | "topology"
  | "containers"
  | "capstone"
  | "docs"
  | "codequality"
  | "architecture"
  | "regression"
  | "registry"
  | "stress"
  | "pool"
  | "memory"
  | "loop"
  | "chaos"
  | "dlq"
  | "health"
  | "circuit"
  | "trace"
  | "cache"
  | "inspector"
  | "documents"
  | "library"
  | "search"
  | "rag";

interface OperationsConsoleProps {
  activeOpsTab: OpsTab;
  setActiveOpsTab: (tab: OpsTab) => void;
  onSelectTrace?: (traceId: string) => void;
  ticker?: string | null;
  traceId?: string | null;
}

export interface TabConfig {
  id: OpsTab;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}

export type OpsPillarId =
  | "intelligence"
  | "telemetry"
  | "resilience"
  | "knowledge"
  | "storage"
  | "governance";

interface OpsPillar {
  id: OpsPillarId;
  label: string;
  shortLabel: string;
  tagline: string;
  icon: typeof Cpu;
  accent: {
    border: string;
    activeBorder: string;
    glow: string;
    text: string;
    badgeBg: string;
    pillBg: string;
  };
  tabs: TabConfig[];
}

const COMMAND_PILLARS: OpsPillar[] = [
  {
    id: "intelligence",
    label: "Agent Intelligence",
    shortLabel: "Agents",
    tagline: "LangGraph reasoning, trace waterfalls & execution DAG",
    icon: Cpu,
    accent: {
      border: "border-cyan-500/20 hover:border-cyan-500/50",
      activeBorder: "border-cyan-400",
      glow: "shadow-[0_0_20px_rgba(6,182,212,0.25)]",
      text: "text-cyan-400",
      badgeBg: "bg-cyan-950/70 border-cyan-800 text-cyan-300",
      pillBg: "bg-cyan-500/15 text-cyan-300 border-cyan-400/50",
    },
    tabs: [
      { id: "langgraph", label: "LangGraph Visualizer", shortLabel: "Topology", icon: "🧠", description: "Multi-agent cyclic state machine topology graph" },
      { id: "registry", label: "Live Job Registry", shortLabel: "Job Registry", icon: "📋", description: "Real-time SSE event pipeline & job status queue" },
      { id: "trace", label: "Distributed Trace", shortLabel: "Trace Explorer", icon: "🔀", description: "Distributed trace spans & correlation IDs" },
      { id: "waterfall", label: "Trace Waterfall", shortLabel: "Trace Waterfall", icon: "🌊", description: "End-to-end latency flamechart & span waterfalls" },
    ],
  },
  {
    id: "telemetry",
    label: "Telemetry & SLOs",
    shortLabel: "Telemetry",
    tagline: "Prometheus golden signals, Grafana specs & probes",
    icon: Activity,
    accent: {
      border: "border-emerald-500/20 hover:border-emerald-500/50",
      activeBorder: "border-emerald-400",
      glow: "shadow-[0_0_20px_rgba(16,185,129,0.25)]",
      text: "text-emerald-400",
      badgeBg: "bg-emerald-950/70 border-emerald-800 text-emerald-300",
      pillBg: "bg-emerald-500/15 text-emerald-300 border-emerald-400/50",
    },
    tabs: [
      { id: "metrics", label: "Prometheus Metrics", shortLabel: "Prometheus", icon: "📊", description: "Real-time scraper counters, gauges & histogram vectors" },
      { id: "grafana", label: "Grafana & SLOs", shortLabel: "Grafana SLOs", icon: "📈", description: "Wall Street institutional dashboard specs & SLO burn rates" },
      { id: "health", label: "Stream Health", shortLabel: "Stream Health", icon: "📡", description: "SSE heartbeat probes & Redis pub/sub backpressure" },
      { id: "probes", label: "Health Probes", shortLabel: "K8s Probes", icon: "🩺", description: "Liveness, readiness & startup matrix telemetry" },
      { id: "loop", label: "Event Loop Lag", shortLabel: "Event Loop", icon: "⏱️", description: "Node/Python async event loop jitter & microtask lag" },
    ],
  },
  {
    id: "resilience",
    label: "Chaos & Resilience",
    shortLabel: "Resilience",
    tagline: "Stress testing, circuit breakers, DLQ forensics & pools",
    icon: ShieldAlert,
    accent: {
      border: "border-amber-500/20 hover:border-amber-500/50",
      activeBorder: "border-amber-400",
      glow: "shadow-[0_0_20px_rgba(245,158,11,0.25)]",
      text: "text-amber-400",
      badgeBg: "bg-amber-950/70 border-amber-800 text-amber-300",
      pillBg: "bg-amber-500/15 text-amber-300 border-amber-400/50",
    },
    tabs: [
      { id: "stress", label: "Stress Testing", shortLabel: "Stress Test", icon: "⚡", description: "Locust / async load tester injecting high concurrency" },
      { id: "chaos", label: "Chaos Recovery", shortLabel: "Chaos Timeline", icon: "💥", description: "Simulated worker killing & self-healing verification" },
      { id: "circuit", label: "Circuit Breaker", shortLabel: "Circuit Breaker", icon: "🛡️", description: "Closed / Open / Half-Open state machine monitors" },
      { id: "dlq", label: "DLQ Inspector", shortLabel: "Dead Letter Queue", icon: "⚠️", description: "Poison-pill queue analysis & replay dispatch" },
      { id: "pool", label: "Connection Pool", shortLabel: "DB Pool", icon: "🏊", description: "PostgreSQL asyncpg pool checkout vs idle capacity" },
      { id: "memory", label: "Memory Pressure", shortLabel: "Redis Memory", icon: "💾", description: "Redis maxmemory RSS allocation & eviction stats" },
    ],
  },
  {
    id: "knowledge",
    label: "SEC & Knowledge RAG",
    shortLabel: "Knowledge",
    tagline: "SEC EDGAR 10-K archive, vector search & citations",
    icon: BookOpen,
    accent: {
      border: "border-purple-500/20 hover:border-purple-500/50",
      activeBorder: "border-purple-400",
      glow: "shadow-[0_0_20px_rgba(168,85,247,0.25)]",
      text: "text-purple-400",
      badgeBg: "bg-purple-950/70 border-purple-800 text-purple-300",
      pillBg: "bg-purple-500/15 text-purple-300 border-purple-400/50",
    },
    tabs: [
      { id: "library", label: "SEC EDGAR Library", shortLabel: "EDGAR Library", icon: "📚", description: "Automated SEC 10-K / 10-Q filing ingestion depot" },
      { id: "search", label: "Semantic Search", shortLabel: "Vector Search", icon: "🔎", description: "High-dimensional embedding cosine similarity query" },
      { id: "rag", label: "RAG Citations", shortLabel: "RAG Citations", icon: "🧬", description: "Fact-checked financial ground truth citations" },
      { id: "documents", label: "PDF Ingestion", shortLabel: "PDF Ingest", icon: "📑", description: "Document parser & chunking preview console" },
    ],
  },
  {
    id: "storage",
    label: "Cache & Persistence",
    shortLabel: "Storage",
    tagline: "Multi-tier Redis Cache-Aside & keyspace explorer",
    icon: Database,
    accent: {
      border: "border-blue-500/20 hover:border-blue-500/50",
      activeBorder: "border-blue-400",
      glow: "shadow-[0_0_20px_rgba(59,130,246,0.25)]",
      text: "text-blue-400",
      badgeBg: "bg-blue-950/70 border-blue-800 text-blue-300",
      pillBg: "bg-blue-500/15 text-blue-300 border-blue-400/50",
    },
    tabs: [
      { id: "cache", label: "Cache Health", shortLabel: "Cache Health", icon: "⚡", description: "Cache hit/miss ratios, key TTL distribution & latency" },
      { id: "inspector", label: "Cache Inspector", shortLabel: "Key Inspector", icon: "🔍", description: "Live inspection of active cached equity payloads" },
    ],
  },
  {
    id: "governance",
    label: "Governance & Cloud",
    shortLabel: "Governance",
    tagline: "Phase 3 Capstone, cloud topology, specs & audits",
    icon: Award,
    accent: {
      border: "border-rose-500/20 hover:border-rose-500/50",
      activeBorder: "border-rose-400",
      glow: "shadow-[0_0_20px_rgba(244,63,94,0.25)]",
      text: "text-rose-400",
      badgeBg: "bg-rose-950/70 border-rose-800 text-rose-300",
      pillBg: "bg-rose-500/15 text-rose-300 border-rose-400/50",
    },
    tabs: [
      { id: "capstone3", label: "Phase 3 Capstone", shortLabel: "Go-Live Audit", icon: "🏆", description: "Institutional production deployment readiness certificate" },
      { id: "topology", label: "Cloud Topology", shortLabel: "Cloud Topology", icon: "☁️", description: "AWS / GCP multi-region VPC & load balancer map" },
      { id: "containers", label: "Container Specs", shortLabel: "Containers", icon: "🐳", description: "OCI image manifests, cgroups & Kubernetes pod specs" },
      { id: "ingress", label: "Production Ingress", shortLabel: "Ingress", icon: "🌐", description: "Reverse proxy, rate limits & TLS termination specs" },
      { id: "seeding", label: "Production Seed", shortLabel: "DB Seeder", icon: "🌱", description: "Database migrations & deterministic bootstrap data" },
      { id: "env", label: "Env Profile", shortLabel: "Env Profile", icon: "🛡️", description: "Sanitized runtime environment & secret validation" },
      { id: "architecture", label: "Architecture Blueprint", shortLabel: "Architecture", icon: "📐", description: "End-to-end distributed system sequence blueprints" },
      { id: "codequality", label: "Code Quality", shortLabel: "Code Quality", icon: "🧹", description: "Ruff, Mypy, ESLint static analysis scorecard" },
      { id: "regression", label: "Regression Audit", shortLabel: "Regression", icon: "🧪", description: "Automated regression test suite & coverage matrix" },
      { id: "capstone", label: "Phase 2 Capstone", shortLabel: "P2 Capstone", icon: "🏆", description: "Phase 2 async gateway architecture sign-off report" },
      { id: "docs", label: "API Docs Explorer", shortLabel: "API Docs", icon: "📖", description: "Interactive Swagger / OpenAPI 3.1 contract viewer" },
    ],
  },
];

// Flat list of all 32 tabs for fast lookup and search
const ALL_TABS: TabConfig[] = COMMAND_PILLARS.flatMap((p) => p.tabs);

export default function OperationsConsole({
  activeOpsTab,
  setActiveOpsTab,
  onSelectTrace,
  ticker,
  traceId,
}: OperationsConsoleProps) {
  const { playClick, playBlip } = useSoundFX();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobilePillarViewMode, setMobilePillarViewMode] = useState<"rail" | "grid">("rail");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeSubTabRef = useRef<HTMLButtonElement | null>(null);
  const subRailContainerRef = useRef<HTMLDivElement | null>(null);

  // Determine active pillar based on activeOpsTab
  const activePillar = useMemo(() => {
    const pillar = COMMAND_PILLARS.find((p) =>
      p.tabs.some((t) => t.id === activeOpsTab)
    );
    return pillar || COMMAND_PILLARS[0];
  }, [activeOpsTab]);

  // Search filter results across all 32 tabs
  const filteredTabs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_TABS.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.shortLabel.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Auto-scroll active sub-tab horizontally within its sub-rail without touching window scroll
  useEffect(() => {
    if (activeSubTabRef.current && subRailContainerRef.current) {
      const container = subRailContainerRef.current;
      const tab = activeSubTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      const relativeLeft = tabRect.left - containerRect.left + container.scrollLeft;
      const scrollTarget = relativeLeft - container.clientWidth / 2 + tab.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, scrollTarget),
        behavior: "smooth",
      });
    }
  }, [activeOpsTab]);

  const triggerHaptic = () => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Haptics suppressed safely
      }
    }
  };

  const handlePillarClick = (pillar: OpsPillar) => {
    playClick();
    triggerHaptic();
    const tabInPillar = pillar.tabs.some((t) => t.id === activeOpsTab);
    if (!tabInPillar && pillar.tabs.length > 0) {
      setActiveOpsTab(pillar.tabs[0].id);
    }
  };

  const handleTabClick = (tabId: OpsTab) => {
    playBlip();
    triggerHaptic();
    setActiveOpsTab(tabId);
    if (searchQuery) {
      setSearchQuery("");
    }
  };

  const activeTabMeta = useMemo(() => {
    return ALL_TABS.find((t) => t.id === activeOpsTab) || ALL_TABS[0];
  }, [activeOpsTab]);

  return (
    <div className="mt-6 sm:mt-8 space-y-4">
      {/* ======================================================== */}
      {/* 1. COMMAND MATRIX HUD HEADER BAR                         */}
      {/* ======================================================== */}
      <div className="hud-panel rounded-2xl p-3.5 sm:p-5 border border-cyan-500/20 bg-black/75 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 sm:w-96 h-72 sm:h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 sm:w-80 h-60 sm:h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 border-b border-gray-800/80 pb-3 sm:pb-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-emerald-500" />
              </span>
              <span className="font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-cyan-400 truncate">
                Ops Command Matrix
              </span>
              <span className="text-gray-600 font-mono text-[10px] sm:text-xs">/</span>
              <span className="font-mono text-[10px] sm:text-xs text-gray-400 whitespace-nowrap">
                32 Subsystems
              </span>
            </div>

            {/* Breadcrumb Context Tracker */}
            <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-[11px] sm:text-xs text-gray-400 flex-wrap">
              <span className="text-gray-500 shrink-0">ACTIVE:</span>
              <span className={`font-semibold shrink-0 ${activePillar.accent.text}`}>
                {activePillar.shortLabel}
              </span>
              <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 shrink-0" />
              <span className="text-white font-medium flex items-center gap-1 truncate max-w-[200px] sm:max-w-none">
                <span className="shrink-0">{activeTabMeta.icon}</span>
                <span className="truncate">{activeTabMeta.shortLabel}</span>
              </span>
            </div>
          </div>

          {/* Quick-Search Filter Input */}
          <div className="relative w-full lg:w-80 shrink-0 mt-1 lg:mt-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Jump to 32 modules... (e.g. chaos, rag)"
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-gray-950/80 border border-gray-800 text-xs font-mono text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Instant Search Dropdown Results */}
            <AnimatePresence>
              {searchQuery.trim() && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 right-0 mt-2 z-50 p-2 bg-gray-950/98 border border-cyan-500/40 rounded-xl shadow-2xl backdrop-blur-2xl max-h-64 sm:max-h-72 overflow-y-auto space-y-1 font-mono text-xs"
                >
                  <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Matches ({filteredTabs.length})</span>
                    <span>Tap to jump</span>
                  </div>
                  {filteredTabs.length === 0 ? (
                    <div className="p-3 text-center text-gray-500 text-xs">
                      No operational modules matching &ldquo;{searchQuery}&rdquo;
                    </div>
                  ) : (
                    filteredTabs.map((tab) => {
                      const parentPillar = COMMAND_PILLARS.find((p) =>
                        p.tabs.some((t) => t.id === tab.id)
                      );
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleTabClick(tab.id)}
                          className="w-full text-left p-2.5 rounded-lg hover:bg-cyan-950/40 active:bg-cyan-900/40 hover:border-cyan-500/30 border border-transparent flex items-start gap-2.5 transition-colors group min-h-[44px]"
                        >
                          <span className="text-base shrink-0 mt-0.5">{tab.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-white font-semibold group-hover:text-cyan-300">
                                {tab.label}
                              </span>
                              {parentPillar && (
                                <span className={`text-[10px] px-1.5 py-0.2 rounded border ${parentPillar.accent.badgeBg}`}>
                                  {parentPillar.shortLabel}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 truncate mt-0.5">
                              {tab.description}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. PRIMARY COMMAND PILLARS (TIER 1 - 6 STRATEGIC HUBS)    */}
        {/* ======================================================== */}
        <div className="mt-3 sm:mt-4 pt-1">
          {/* Mobile Pillar Bar Header with View Mode Toggle */}
          <div className="flex sm:hidden items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
              <span>Select Command Pillar</span>
            </span>
            <div className="flex items-center gap-1 bg-gray-900/80 p-0.5 rounded-lg border border-gray-800">
              <button
                type="button"
                onClick={() => setMobilePillarViewMode("rail")}
                className={`p-1 rounded text-xs transition-colors ${
                  mobilePillarViewMode === "rail"
                    ? "bg-cyan-950 text-cyan-300 border border-cyan-800/80"
                    : "text-gray-500 hover:text-gray-300"
                }`}
                title="Swipeable Carousel"
              >
                <Rows3 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setMobilePillarViewMode("grid")}
                className={`p-1 rounded text-xs transition-colors ${
                  mobilePillarViewMode === "grid"
                    ? "bg-cyan-950 text-cyan-300 border border-cyan-800/80"
                    : "text-gray-500 hover:text-gray-300"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* MOBILE VIEW: Horizontal Snap-Rail Mode (Ultra compact, thumb friendly) */}
          <div
            className={`${
              mobilePillarViewMode === "rail" ? "flex sm:hidden" : "hidden"
            } items-center gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1 -mx-1 px-1 touch-pan-x`}
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {COMMAND_PILLARS.map((pillar) => {
              const isPillarActive = activePillar.id === pillar.id;
              const IconComponent = pillar.icon;
              return (
                <button
                  key={pillar.id}
                  type="button"
                  onClick={() => handlePillarClick(pillar)}
                  className={`snap-center shrink-0 min-h-[46px] px-3.5 py-2 rounded-xl border flex items-center gap-2.5 transition-all duration-150 ${
                    isPillarActive
                      ? `bg-gray-900/95 ${pillar.accent.activeBorder} ${pillar.accent.glow} shadow-md`
                      : `bg-gray-950/60 ${pillar.accent.border} hover:bg-gray-900/50 active:scale-95`
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      isPillarActive
                        ? pillar.accent.pillBg
                        : "bg-gray-900 text-gray-400"
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left font-mono">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold whitespace-nowrap ${
                          isPillarActive ? "text-white" : "text-gray-300"
                        }`}
                      >
                        {pillar.shortLabel}
                      </span>
                      <span className="text-[10px] px-1 py-0.2 rounded-full bg-gray-900/80 border border-gray-800 text-gray-400">
                        {pillar.tabs.length}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* DESKTOP & TABLET VIEW: Responsive 6-Hub Strategic Grid (or Mobile Grid Mode) */}
          <div
            className={`${
              mobilePillarViewMode === "grid" ? "grid" : "hidden sm:grid"
            } grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2`}
          >
            {COMMAND_PILLARS.map((pillar) => {
              const isPillarActive = activePillar.id === pillar.id;
              const IconComponent = pillar.icon;
              return (
                <button
                  key={pillar.id}
                  type="button"
                  onClick={() => handlePillarClick(pillar)}
                  className={`group relative text-left p-2.5 sm:p-3 rounded-xl border transition-all duration-150 active:scale-[0.98] ${
                    isPillarActive
                      ? `bg-gray-900/90 ${pillar.accent.activeBorder} ${pillar.accent.glow}`
                      : `bg-gray-950/40 ${pillar.accent.border} hover:bg-gray-900/40`
                  }`}
                >
                  {/* Subtle top indicator glow for active pillar */}
                  {isPillarActive && (
                    <motion.div
                      layoutId="activePillarBar"
                      className={`absolute top-0 left-3 right-3 h-0.5 rounded-full ${pillar.accent.pillBg} shadow-sm`}
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}

                  <div className="flex items-center justify-between mb-1.5">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isPillarActive
                          ? pillar.accent.pillBg
                          : "bg-gray-900 text-gray-400 group-hover:text-gray-200"
                      }`}
                    >
                      <IconComponent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900/80 border border-gray-800 text-gray-400">
                      {pillar.tabs.length}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <div
                      className={`text-xs font-bold truncate ${
                        isPillarActive
                          ? "text-white"
                          : "text-gray-300 group-hover:text-white"
                      }`}
                    >
                      {pillar.label}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate hidden sm:block">
                      {pillar.tagline.split(",")[0]}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. SECONDARY SUB-MODULE BAR (TIER 2 - CRISP PILL BUTTONS) */}
        {/* ======================================================== */}
        <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-gray-800/80 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
              <span>
                {activePillar.shortLabel} Modules ({activePillar.tabs.length})
              </span>
            </span>
            <span className="text-[11px] text-gray-500 font-mono hidden md:inline truncate max-w-sm">
              {activePillar.tagline}
            </span>
          </div>

          {/* Sub-Rail Scroll Container with Edge Fade Indicators */}
          <div className="relative">
            <div
              ref={subRailContainerRef}
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none py-1 -mx-1 px-1 touch-pan-x"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {activePillar.tabs.map((tab) => {
                const isActive = activeOpsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={isActive ? activeSubTabRef : null}
                    type="button"
                    onClick={() => handleTabClick(tab.id)}
                    title={tab.description}
                    className={`group relative shrink-0 whitespace-nowrap px-3 sm:px-3.5 py-2 min-h-[40px] sm:min-h-[42px] rounded-xl font-mono text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 sm:gap-2 border active:scale-95 ${
                      isActive
                        ? `bg-gray-900 text-white ${activePillar.accent.activeBorder} ${activePillar.accent.glow}`
                        : "bg-gray-950/60 text-gray-400 border-gray-800 hover:text-gray-200 hover:bg-gray-900/60 hover:border-gray-700"
                    }`}
                  >
                    <span className="text-sm shrink-0">{tab.icon}</span>
                    <span className="text-xs">{tab.label}</span>
                    {isActive && (
                      <span className="relative flex h-1.5 w-1.5 ml-0.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Subtle Right Edge Fade Gradient on Mobile to indicate horizontal scrollability */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/80 to-transparent sm:hidden" />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. ACTIVE OPERATIONAL VIEW PANEL                         */}
      {/* ======================================================== */}
      <div className="relative overflow-x-hidden">
        {activeOpsTab === "langgraph" ? (
          <LangGraphTopologyVisualizer />
        ) : activeOpsTab === "capstone3" ? (
          <ProductionSmokeTestPanel />
        ) : activeOpsTab === "metrics" ? (
          <PrometheusMetricsConsole />
        ) : activeOpsTab === "grafana" ? (
          <GrafanaDashboardSpecPanel />
        ) : activeOpsTab === "waterfall" ? (
          <TraceWaterfallExplorer />
        ) : activeOpsTab === "ingress" ? (
          <ProductionIngressPanel />
        ) : activeOpsTab === "seeding" ? (
          <ProductionSeedingConsole />
        ) : activeOpsTab === "env" ? (
          <EnvironmentProfileCard />
        ) : activeOpsTab === "probes" ? (
          <CloudHealthMatrix />
        ) : activeOpsTab === "topology" ? (
          <CloudTopologyMap />
        ) : activeOpsTab === "containers" ? (
          <ContainerSpecViewer />
        ) : activeOpsTab === "capstone" ? (
          <Phase2CapstoneReportPanel />
        ) : activeOpsTab === "docs" ? (
          <ApiDocsBrowser />
        ) : activeOpsTab === "codequality" ? (
          <CodeQualityPanel />
        ) : activeOpsTab === "architecture" ? (
          <ArchitectureDiagramViewer />
        ) : activeOpsTab === "regression" ? (
          <RegressionAuditDashboard />
        ) : activeOpsTab === "registry" ? (
          <JobAuditPanel onSelectTrace={onSelectTrace} />
        ) : activeOpsTab === "stress" ? (
          <LoadTestResultsPanel />
        ) : activeOpsTab === "pool" ? (
          <ConnectionPoolMonitor />
        ) : activeOpsTab === "memory" ? (
          <RedisMemoryPressureCard />
        ) : activeOpsTab === "loop" ? (
          <EventLoopLatencyChart />
        ) : activeOpsTab === "chaos" ? (
          <ChaosRecoveryTimeline />
        ) : activeOpsTab === "documents" ? (
          <DocumentUploadPanel initialTicker={ticker || "AAPL"} />
        ) : activeOpsTab === "library" ? (
          <DocumentLibraryPanel
            onNavigateToSearch={() => setActiveOpsTab("search")}
            onNavigateToRAG={() => setActiveOpsTab("rag")}
          />
        ) : activeOpsTab === "search" ? (
          <DocumentSearchPanel initialTicker={ticker || "AAPL"} />
        ) : activeOpsTab === "rag" ? (
          <RAGContextViewer initialTicker={ticker || "AAPL"} />
        ) : activeOpsTab === "dlq" ? (
          <DLQInspectorPanel onSelectTrace={onSelectTrace} />
        ) : activeOpsTab === "health" ? (
          <StreamHealthMonitor />
        ) : activeOpsTab === "circuit" ? (
          <CircuitBreakerPanel />
        ) : activeOpsTab === "cache" ? (
          <CacheHealthMonitor />
        ) : activeOpsTab === "inspector" ? (
          <CacheInspectorPanel
            onSelectTrace={onSelectTrace}
            initialTicker={ticker || "AAPL"}
          />
        ) : (
          <DistributedTraceExplorer initialTraceId={traceId || undefined} />
        )}
      </div>
    </div>
  );
}
