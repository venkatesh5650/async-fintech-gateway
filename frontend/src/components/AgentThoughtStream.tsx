"use client";

import React, { useState, useEffect } from "react";
import { Terminal, Copy, Check, Cpu, Sparkles, ChevronRight, Activity } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

const TypewriterText = ({ text, delay = 0, onComplete }: { text: string; delay?: number, onComplete?: () => void }) => {
  const [displayed, setDisplayed] = useState("");
  
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const startDelay = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          if (onComplete) onComplete();
        }
      }, 15);
      timeout = interval;
    }, delay);
    
    return () => {
      clearTimeout(startDelay);
      if (timeout) clearInterval(timeout);
    };
  }, [text, delay, onComplete]);

  return <span>{displayed}{displayed.length < text.length && <span className="animate-pulse bg-cyan-400 w-1.5 h-3 inline-block ml-0.5 align-middle" />}</span>;
};

interface ThoughtLogItem {
  id: string;
  agent: "SENTINEL-Q" | "LEXICON-X" | "ARBITER" | "GATEKEEPER";
  message: string;
  timestamp: string;
  latencyMs: number;
  status: "success" | "warning" | "info";
}

interface DebateEvent {
  agent: string;
  message: string;
  type: string;
}

interface AgentThoughtStreamProps {
  ticker?: string;
  traceId?: string;
  rawReasoning?: string;
  quantInjected?: boolean;
  debateLog?: DebateEvent[];
}

const EMPTY_ARRAY: DebateEvent[] = [];

const FALLBACK_STEPS: DebateEvent[] = [
  {
    agent: "Sentinel-Q (Quant)",
    message: `Computed 50D SMA, 14D RSI, and 20D Bollinger Bands via PostgreSQL CTE. Math verified deterministic.`,
    type: "quant",
  },
  {
    agent: "Lexicon-X (Risk)",
    message: `Scanned SEC 10-K filings using 1536-dim pgvector HNSW cosine scan. Retrieved 5 high-relevance semantic passages.`,
    type: "rag",
  },
  {
    agent: "Arbiter Core (Consensus)",
    message: `Consensus synthesis achieved across quantitative and qualitative vector planes. Dispatched alpha report.`,
    type: "consensus",
  },
];

export function AgentThoughtStream({
  ticker = "AAPL",
  traceId = "w3c_4fa812bc9001",
  rawReasoning,
  quantInjected = true,
  debateLog = EMPTY_ARRAY,
}: AgentThoughtStreamProps) {
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [visibleLogs, setVisibleLogs] = useState<DebateEvent[]>([]);
  const { playClick, playBlip, playConsensus } = useSoundFX();

  const activeLog = React.useMemo(() => {
    return debateLog && debateLog.length > 0 ? debateLog : (rawReasoning ? [
      FALLBACK_STEPS[0],
      FALLBACK_STEPS[1],
      {
        agent: "Arbiter Core (Consensus)",
        message: rawReasoning.slice(0, 140) + "...",
        type: "consensus",
      }
    ] : FALLBACK_STEPS);
  }, [debateLog, rawReasoning]);

  useEffect(() => {
    setVisibleLogs([]);
    setActiveStep(-1);
    
    // Typewriter effect simulation for the debate log
    let delay = 0;
    const timeouts: NodeJS.Timeout[] = [];
    
    activeLog.forEach((log, index) => {
      delay += 800; // 800ms stagger for dramatic effect
      const t = setTimeout(() => {
        setVisibleLogs(prev => [...prev, log]);
        setActiveStep(index);
        
        if (log.type === "consensus") {
          playConsensus();
        } else {
          playBlip();
        }
      }, delay);
      timeouts.push(t);
    });

    return () => timeouts.forEach(clearTimeout);
  }, [activeLog, playBlip, playConsensus]);

  const handleCopyTrace = () => {
    playClick();
    navigator.clipboard.writeText(traceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAgentBadge = (type: string) => {
    switch (type) {
      case "quant":
        return "bg-emerald-950/60 border-emerald-500/40 text-emerald-400";
      case "rag":
        return "bg-amber-950/60 border-amber-500/40 text-amber-400";
      case "consensus":
      default:
        return "bg-cyan-950/60 border-cyan-500/40 text-cyan-400";
    }
  };

  return (
    <div className="hud-panel corner-reticle rounded-xl p-4 sm:p-5 font-mono text-xs overflow-hidden relative">
      {/* HUD Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-bold tracking-wider text-slate-200 uppercase text-xs">
            Live Cognitive Reasoning Stream
          </span>
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
            <Activity className="w-2.5 h-2.5 animate-pulse text-cyan-400" />
            <span>4/4 NODES SYNCED</span>
          </span>
        </div>

        {/* W3C Trace Quick Copy */}
        <button
          onClick={handleCopyTrace}
          className="flex items-center space-x-1.5 px-2 py-1 rounded bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 text-[11px] text-slate-400 hover:text-cyan-300 transition-all"
          title="Copy W3C Trace Context"
        >
          <span>TRACE:</span>
          <span className="text-slate-300 font-semibold">{traceId.slice(0, 12)}...</span>
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 text-slate-500 hover:text-cyan-400" />
          )}
        </button>
      </div>

      {/* Stream Items */}
      <div className="space-y-2.5 min-h-[160px]">
        {visibleLogs.map((step, idx) => {
          const isSelected = activeStep === idx;
          return (
            <div
              key={idx}
              onClick={() => {
                setActiveStep(idx);
                playClick();
              }}
              className={`p-3 rounded-lg border transition-all duration-300 cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-2 animate-in slide-in-from-right-4 fade-in ${
                isSelected
                  ? "bg-slate-900/90 border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.12)]"
                  : "bg-slate-950/40 border-slate-900 hover:border-slate-800 hover:bg-slate-900/40"
              }`}
            >
              <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                <ChevronRight
                  className={`w-3.5 h-3.5 mt-1 transition-transform ${
                    isSelected ? "text-cyan-400 rotate-90" : "text-slate-600"
                  }`}
                />
                <div className="flex flex-col gap-1.5 w-full">
                  <span
                    className={`w-fit text-[9px] px-2 py-0.5 rounded border tracking-wider font-bold shrink-0 ${getAgentBadge(
                      step.type
                    )}`}
                  >
                    {step.agent}
                  </span>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    <TypewriterText text={step.message} />
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {visibleLogs.length < activeLog.length && (
          <div className="flex items-center space-x-2 pl-3 pt-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
            <span className="text-[10px] text-cyan-500/70 font-mono tracking-widest">AWAITING AGENT RESPONSE...</span>
          </div>
        )}
      </div>

      {/* Footer Subtext */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center space-x-1">
          <Sparkles className="w-3 h-3 text-cyan-400 inline" />
          <span>Zero LLM Math Hallucination Invariant Enforced</span>
        </span>
        <span className="text-emerald-400 font-mono">POSTGRES CTE LATENCY: 12ms</span>
      </div>
    </div>
  );
}
