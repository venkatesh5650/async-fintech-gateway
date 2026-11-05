"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { AnalyticsSummaryCard } from "@/components/AnalyticsSummaryCard";
import { TechnicalIndicatorPanel } from "@/components/TechnicalIndicatorPanel";
import { VolatilityMetricsCard } from "@/components/VolatilityMetricsCard";
import { CompositeSignalMeter } from "@/components/CompositeSignalMeter";
import IntelligenceCard from "@/components/IntelligenceCard";
import ActionTriggers from "@/components/ActionTriggers";
import MarketChart, { ChartDataPoint, Timeframe } from "@/components/MarketChart";
import { AgentSwarmDeck } from "@/components/AgentSwarmDeck";
import { AgentThoughtStream } from "@/components/AgentThoughtStream";
import MacroSimulatorPanel from "@/components/MacroSimulatorPanel";
import { SectionSkeleton } from "@/components/SectionSkeleton";
import { DocumentSearchPanel } from "@/components/DocumentSearchPanel";
import { RAGContextViewer } from "@/components/RAGContextViewer";
import { DocumentUploadPanel } from "@/components/DocumentUploadPanel";

export type WorkspaceTab = "summary" | "chart" | "quant" | "memo" | "filings" | "run";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "chart", label: "Chart" },
  { id: "quant", label: "Quant" },
  { id: "memo", label: "Memo" },
  { id: "filings", label: "Filings" },
  { id: "run", label: "Run" },
];

interface JobState {
  status: "processing" | "completed" | "failed";
  job_id: string;
  result?: {
    analysis_report?: string;
    reasoning?: string;
    debate_log?: any;
    quant_context?: { composite_score?: number };
    trace_id?: string;
  };
  trace_id?: string;
}

interface StockWorkspaceProps {
  ticker: string;
  tab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  jobState: JobState | null;
  chartData: ChartDataPoint[];
  timeframe: Timeframe;
  isTimeframeLoading: boolean;
  targetTimeframe: Timeframe | null;
  onTimeframeChange: (tf: Timeframe) => void;
  onRefreshMemo: () => void;
  isCacheRefreshing: boolean;
  isSimulating: boolean;
  simulatedScore: number | null;
  onSimulate: (params: { fedRate: number; vixSpike: number; earningsRevision: number }) => void;
  onDispatch: () => void;
  onBatchDispatch: (tickers: string[]) => void;
  isBatchProcessing: boolean;
  cooldown: number;
  isConnected: boolean;
  isExhausted: boolean;
  traceId?: string;
  batchId: string | null;
  onOpenSearch: () => void;
  onSelectTrace: (traceId: string) => void;
}

function readSignal(report?: string) {
  const match = report?.match(/SIGNAL:\s*(BUY|SELL|HOLD|INVALID)/);
  return match?.[1] ?? null;
}

export default function StockWorkspace({
  ticker,
  tab,
  onTabChange,
  jobState,
  chartData,
  timeframe,
  isTimeframeLoading,
  targetTimeframe,
  onTimeframeChange,
  onRefreshMemo,
  isCacheRefreshing,
  isSimulating,
  simulatedScore,
  onSimulate,
  onDispatch,
  onBatchDispatch,
  isBatchProcessing,
  cooldown,
  isConnected,
  isExhausted,
  traceId,
  batchId,
  onOpenSearch,
  onSelectTrace,
}: StockWorkspaceProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const lastClose = mounted && chartData.length > 0 ? chartData[chartData.length - 1]?.close : undefined;
  const signal = mounted ? readSignal(jobState?.result?.analysis_report) : null;
  const status = mounted ? jobState?.status ?? "starting" : "starting";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">{ticker}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {lastClose != null ? `Last close ${Number(lastClose).toFixed(2)}` : "Price loads with the chart"}
            <span className="mx-2 text-slate-600">·</span>
            <span className="uppercase">{status}</span>
            {signal && (
              <>
                <span className="mx-2 text-slate-600">·</span>
                <span className="text-slate-200">{signal}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          className="inline-flex items-center gap-2 self-start rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300 hover:border-slate-700 hover:text-slate-100"
        >
          <Search className="h-4 w-4" />
          Switch stock
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-800">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={`shrink-0 px-3 py-2 text-sm ${
              tab === item.id
                ? "border-b-2 border-cyan-400 text-slate-50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryFact label="Symbol" value={ticker} />
            <SummaryFact label="Run" value={status} />
            <SummaryFact label="Signal" value={signal ?? "Waiting for the memo"} />
          </div>
          <CompositeSignalMeter ticker={ticker} simulatedScore={simulatedScore} />
          <p className="text-sm text-slate-500">
            The chart, indicators, memo, filings, and this run each have their own tab.
          </p>
        </div>
      )}

      {tab === "chart" && (
        <div style={{ minHeight: "420px" }}>
          {chartData.length === 0 ? (
            <SectionSkeleton height="420px" label="Market Chart" />
          ) : (
            <MarketChart
              ticker={ticker}
              data={chartData}
              selectedTimeframe={timeframe}
              onTimeframeChange={onTimeframeChange}
              isLoading={isTimeframeLoading}
              loadingTimeframe={targetTimeframe}
            />
          )}
        </div>
      )}

      {tab === "quant" && (
        <div className="space-y-6">
          <CompositeSignalMeter ticker={ticker} simulatedScore={simulatedScore} />
          <AnalyticsSummaryCard ticker={ticker} onSelectTrace={onSelectTrace} />
          <TechnicalIndicatorPanel ticker={ticker} />
          <VolatilityMetricsCard ticker={ticker} />
        </div>
      )}

      {tab === "memo" && (
        <div className="space-y-6">
          {!jobState?.result ? (
            <SectionSkeleton height="420px" label="AI research memo" />
          ) : (
            <IntelligenceCard
              data={jobState.result}
              onRefresh={onRefreshMemo}
              isRefreshing={isCacheRefreshing}
              onNavigateSection={(sectionId) => {
                if (sectionId === "section-chart") onTabChange("chart");
                else if (sectionId === "section-signals") onTabChange("quant");
                else onTabChange("filings");
              }}
            />
          )}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Preview</p>
            <MacroSimulatorPanel isSimulating={isSimulating} onSimulate={onSimulate} />
          </div>
        </div>
      )}

      {tab === "filings" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-400">
            Citations and search for {ticker}.{" "}
            <Link href="/dashboard/filings" className="text-cyan-300 hover:text-cyan-200">
              Open the full library
            </Link>
          </p>
          <RAGContextViewer key={`rag-${ticker}`} initialTicker={ticker} />
          <DocumentSearchPanel key={`search-${ticker}`} initialTicker={ticker} />
          <DocumentUploadPanel key={`upload-${ticker}`} initialTicker={ticker} />
        </div>
      )}

      {tab === "run" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className={isConnected ? "text-emerald-400" : "text-amber-300"}>
              {isExhausted ? "Live feed stopped" : isConnected ? "Live feed connected" : "Connecting live feed"}
            </span>
            {traceId && (
              <button
                type="button"
                onClick={() => onSelectTrace(traceId)}
                className="rounded-md border border-slate-800 px-2 py-1 font-mono text-xs text-slate-300"
              >
                Trace {traceId.slice(0, 16)}
              </button>
            )}
            {batchId && (
              <Link href="/dashboard/runs" className="text-cyan-300 hover:text-cyan-200">
                Open batch progress
              </Link>
            )}
          </div>
          {isExhausted && (
            <p className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
              The live connection stopped after repeated retries. Dispatch the run again from this tab.
            </p>
          )}
          {(status === "processing" || status === "starting") && (
            <div className="space-y-6">
              <AgentSwarmDeck />
              <AgentThoughtStream
                ticker={ticker}
                traceId={traceId || "w3c_sync_pending"}
                rawReasoning={jobState?.result?.reasoning}
                debateLog={jobState?.result?.debate_log as never}
              />
            </div>
          )}
          <ActionTriggers
            ticker={ticker}
            onDispatch={onDispatch}
            onBatchDispatch={onBatchDispatch}
            isProcessing={isBatchProcessing || status === "processing"}
            cooldown={cooldown}
          />
        </div>
      )}
    </div>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}
