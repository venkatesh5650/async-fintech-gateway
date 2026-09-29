"use client";

import React, { useRef } from "react";
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

export type OpsTab =
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

interface TabConfig {
  id: OpsTab;
  label: string;
  shortLabel?: string;
  icon: string;
}

const OPS_TABS: TabConfig[] = [
  { id: "registry", label: "Live Job Registry", shortLabel: "Registry", icon: "📋" },
  { id: "stress", label: "Stress Testing", shortLabel: "Stress", icon: "⚡" },
  { id: "pool", label: "Connection Pool", shortLabel: "Pool", icon: "🏊" },
  { id: "memory", label: "Memory Pressure", shortLabel: "Memory", icon: "💾" },
  { id: "loop", label: "Event Loop Lag", shortLabel: "Loop", icon: "⏱️" },
  { id: "chaos", label: "Chaos Recovery", shortLabel: "Chaos", icon: "💥" },
  { id: "documents", label: "PDF Ingestion", shortLabel: "Docs", icon: "📑" },
  { id: "library", label: "SEC EDGAR Library", shortLabel: "EDGAR", icon: "📚" },
  { id: "search", label: "Semantic Search", shortLabel: "Search", icon: "🔎" },
  { id: "rag", label: "RAG Citations", shortLabel: "RAG", icon: "🧬" },
  { id: "dlq", label: "DLQ Inspector", shortLabel: "DLQ", icon: "⚠️" },
  { id: "health", label: "Stream Health", shortLabel: "Stream", icon: "📡" },
  { id: "circuit", label: "Circuit Breaker", shortLabel: "Circuit", icon: "🛡️" },
  { id: "trace", label: "Distributed Trace", shortLabel: "Trace", icon: "🔀" },
  { id: "cache", label: "Cache Health", shortLabel: "Cache", icon: "⚡" },
  { id: "inspector", label: "Cache Inspector", shortLabel: "Inspector", icon: "🔍" },
];

export default function OperationsConsole({
  activeOpsTab,
  setActiveOpsTab,
  onSelectTrace,
  ticker,
  traceId,
}: OperationsConsoleProps) {
  const railRef = useRef<HTMLDivElement>(null);

  const handleTabClick = (tabId: OpsTab) => {
    setActiveOpsTab(tabId);
  };

  return (
    <div className="mt-8">
      {/* Responsive Horizontal Operations Rail */}
      <div className="relative border-b border-gray-800 pb-3 mb-4 font-mono text-xs">
        <div
          ref={railRef}
          className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 -mx-2 px-2 sm:mx-0 sm:px-0 touch-pan-x"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {OPS_TABS.map((tab) => {
            const isActive = activeOpsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-lg font-semibold transition-all duration-150 flex items-center gap-2 ${
                  isActive
                    ? "bg-gray-800 text-white border border-gray-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-900/60"
                }`}
              >
                <span className="text-xs opacity-90">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Operational Telemetry View */}
      {activeOpsTab === "registry" ? (
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
        <DistributedTraceExplorer
          initialTraceId={traceId || undefined}
        />
      )}
    </div>
  );
}
