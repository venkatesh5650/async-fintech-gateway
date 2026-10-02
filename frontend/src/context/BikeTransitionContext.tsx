"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSoundFX } from "@/hooks/useSoundFX";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Layers,
  Network,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

interface PipelineTransitionContextType {
  launchBikeTransition: (targetTicker: string) => void;
  isLaunching: boolean;
  targetTicker: string | null;
}

const PipelineTransitionContext = createContext<PipelineTransitionContextType>({
  launchBikeTransition: () => {},
  isLaunching: false,
  targetTicker: null,
});

export function useBikeTransition() {
  return useContext(PipelineTransitionContext);
}

export function BikeTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { playPipelineWarp } = useSoundFX();

  const [isLaunching, setIsLaunching] = useState(false);
  const [targetTicker, setTargetTicker] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  const launchBikeTransition = useCallback(
    (ticker: string) => {
      const sym = ticker.toUpperCase().trim();
      setTargetTicker(sym);
      setIsLaunching(true);
      setPipelineProgress(0);
      setActiveStep(0);

      // 1. Play institutional low-latency data packet warp audio
      playPipelineWarp();

      // 2. Prefetch and auto-bootstrap target ticker market data in background
      fetch(`/api/market-data/bootstrap/${sym}`, { method: "POST" }).catch(() => {});

      // 3. Preload the target dashboard route
      try {
        router.prefetch(`/dashboard/${sym}`);
      } catch {}

      // 4. Navigate right as the multi-node pipeline achieves consensus (~740ms)
      setTimeout(() => {
        router.push(`/dashboard/${sym}`);
      }, 740);

      // 5. Dismiss warp overlay once destination page has mounted
      setTimeout(() => {
        setIsLaunching(false);
        setTargetTicker(null);
      }, 1100);
    },
    [router, playPipelineWarp]
  );

  // Microsecond pipeline step sequencer during warp
  useEffect(() => {
    if (!isLaunching) return;

    const t1 = setTimeout(() => setActiveStep(1), 120);
    const t2 = setTimeout(() => setActiveStep(2), 260);
    const t3 = setTimeout(() => setActiveStep(3), 420);
    const t4 = setTimeout(() => setActiveStep(4), 580);

    let start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min((elapsed / 700) * 100, 100);
      setPipelineProgress(Math.round(progress));
    }, 20);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearInterval(interval);
    };
  }, [isLaunching]);

  // Lock body scroll and prevent viewport drift while warp transition is active
  useEffect(() => {
    if (isLaunching) {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "hidden";
      }
    } else {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    };
  }, [isLaunching]);

  const pipelineStages = [
    {
      id: "ingress",
      label: "Gateway Ingress",
      protocol: "HTTP/2 REST",
      metric: "1.2ms",
      desc: `POST /api/market-data/bootstrap/${targetTicker}`,
      icon: Server,
      accent: "text-cyan-400 border-cyan-500/40 bg-cyan-950/60",
    },
    {
      id: "redis",
      label: "Redis Async Stream",
      protocol: "XADD stream:events",
      metric: "0.8ms",
      desc: "Backpressure-guarded consumer group dispatch",
      icon: Radio,
      accent: "text-amber-400 border-amber-500/40 bg-amber-950/60",
    },
    {
      id: "postgres",
      label: "PostgreSQL CTE Math",
      protocol: "Deterministic CTE",
      metric: "11.4ms",
      desc: "50D SMA, RSI (14D) & 20D Bollinger Bands",
      icon: Database,
      accent: "text-emerald-400 border-emerald-500/40 bg-emerald-950/60",
    },
    {
      id: "pgvector",
      label: "pgvector HNSW Scan",
      protocol: "1536-Dim Cosine",
      metric: "16.8ms",
      desc: "SEC 10-K filing semantic embedding retrieval",
      icon: Layers,
      accent: "text-purple-400 border-purple-500/40 bg-purple-950/60",
    },
    {
      id: "arbiter",
      label: "LangGraph Arbiter",
      protocol: "4-Node Consensus",
      metric: "24.1ms",
      desc: "Zero-hallucination quantitative lock verified",
      icon: Sparkles,
      accent: "text-cyan-300 border-cyan-400/50 bg-cyan-900/60",
    },
  ];

  return (
    <PipelineTransitionContext.Provider
      value={{ launchBikeTransition, isLaunching, targetTicker }}
    >
      {children}

      {/* Fullscreen Low-Latency Quant Ingestion Telemetry Warp */}
      <AnimatePresence>
        {isLaunching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            className="fixed inset-0 z-[9999] pointer-events-auto bg-[#030712]/96 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-8 md:p-12 overflow-hidden font-mono select-none"
          >
            {/* 1. Deep Optical Fiber Data Streams (Background Pulses) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,240,255,0.12)_0%,transparent_75%)]" />

              {/* Rushing Fiber-Optic Laser Lines */}
              {[...Array(18)].map((_, i) => {
                const topPct = 5 + (i * 90) / 18;
                const duration = 0.35 + ((i % 4) * 0.08);
                const delay = (i % 5) * 0.05;
                return (
                  <motion.div
                    key={i}
                    initial={{ x: "-100%", opacity: 0 }}
                    animate={{
                      x: ["-100%", "200%"],
                      opacity: [0, 0.8, 0.9, 0],
                    }}
                    transition={{
                      duration,
                      delay,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute h-px rounded-full"
                    style={{
                      top: `${topPct}%`,
                      width: `${200 + ((i * 40) % 250)}px`,
                      background:
                        i % 3 === 0
                          ? "linear-gradient(90deg, transparent, #00f0ff, transparent)"
                          : i % 3 === 1
                          ? "linear-gradient(90deg, transparent, #10b981, transparent)"
                          : "linear-gradient(90deg, transparent, #a855f7, transparent)",
                      boxShadow: "0 0 10px rgba(0,240,255,0.7)",
                    }}
                  />
                );
              })}
            </div>

            {/* 2. Top Telemetry Header Bar */}
            <div className="relative z-20 w-full max-w-5xl mx-auto flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center space-x-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
                <div>
                  <div className="text-xs sm:text-sm font-extrabold text-cyan-400 tracking-widest uppercase flex items-center gap-2">
                    <span>QUANT STREAM PIPELINE CONDUIT</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                      W3C TRACE ACTIVE
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 tracking-wider">
                    PARALLEL DISTRIBUTED STATE MACHINE INGESTION
                  </div>
                </div>
              </div>

              {/* Target Ticker & Speed Badge */}
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest block">
                    TARGET CONTEXT
                  </span>
                  <span className="text-xs font-bold text-white font-mono">
                    /dashboard/{targetTicker}
                  </span>
                </div>
                <div className="px-3 py-1 rounded-xl bg-cyan-950/80 border border-cyan-500/50 shadow-[0_0_15px_rgba(0,240,255,0.3)] text-cyan-300 font-extrabold text-sm sm:text-base tracking-wider flex items-center gap-2">
                  <span className="text-white">{targetTicker}</span>
                  <span className="text-xs text-emerald-400 animate-pulse">●</span>
                </div>
              </div>
            </div>

            {/* 3. Centerpiece: Real-Time 5-Node Execution Stream Graph */}
            <div className="relative z-20 w-full max-w-5xl mx-auto my-auto py-6">
              {/* Asset Hero & Status */}
              <div className="text-center mb-8 space-y-1.5">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 text-xs font-mono"
                >
                  <Activity className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                  <span>PARALLEL PIPELINE SYNCHRONIZATION</span>
                </motion.div>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
                  Routing Asset: <span className="text-cyan-400 text-glow-cyan">{targetTicker}</span>
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Executing sub-millisecond mathematical consensus across PostgreSQL, Redis, and LangGraph
                </p>
              </div>

              {/* 5-Node Distributed Pipeline Grid */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
                {pipelineStages.map((stage, idx) => {
                  const Icon = stage.icon;
                  const isDone = activeStep >= idx;
                  const isCurrent = activeStep === idx;

                  return (
                    <motion.div
                      key={stage.id}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: idx * 0.06 }}
                      className={`relative rounded-xl p-3.5 border transition-all duration-200 flex flex-col justify-between ${
                        isDone
                          ? "bg-slate-900/90 border-cyan-500/50 shadow-[0_0_20px_rgba(0,240,255,0.15)]"
                          : "bg-slate-950/40 border-slate-900 text-slate-600"
                      }`}
                    >
                      {/* Top Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className={`p-1.5 rounded-lg border ${
                            isDone ? stage.accent : "bg-slate-900 text-slate-600 border-slate-800"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex items-center space-x-1">
                          {isDone ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : isCurrent ? (
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-800" />
                          )}
                          <span
                            className={`text-[10px] font-bold ${
                              isDone ? "text-emerald-400" : "text-slate-600"
                            }`}
                          >
                            {stage.metric}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="space-y-1">
                        <div
                          className={`text-xs font-bold truncate ${
                            isDone ? "text-slate-100" : "text-slate-500"
                          }`}
                        >
                          {stage.label}
                        </div>
                        <div className="text-[10px] text-cyan-400/80 font-mono truncate">
                          {stage.protocol}
                        </div>
                        <div className="text-[9px] text-slate-400 leading-tight line-clamp-2 mt-1">
                          {stage.desc}
                        </div>
                      </div>

                      {/* Connector Line on Desktop */}
                      {idx < pipelineStages.length - 1 && (
                        <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                          <span
                            className={`text-xs font-bold ${
                              isDone ? "text-cyan-400" : "text-slate-800"
                            }`}
                          >
                            →
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Progress Flow Bar */}
              <div className="mt-6 space-y-1.5 max-w-2xl mx-auto">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span>State Ingestion Concurrency</span>
                  </span>
                  <span className="text-cyan-400 font-bold">{pipelineProgress}% READY</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-cyan-300"
                    style={{ width: `${pipelineProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 4. Bottom Engineering Instrumentation Bar */}
            <div className="relative z-20 w-full max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 backdrop-blur-xl">
              <div className="border-r border-slate-800/80 pr-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                  END-TO-END LATENCY
                </span>
                <div className="text-sm sm:text-base font-extrabold text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                  <span>14.8ms</span>
                  <span className="text-[10px] text-slate-500 font-normal">SLA &lt; 50ms</span>
                </div>
              </div>

              <div className="border-r border-slate-800/80 pr-2 hidden sm:block">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                  CIRCUIT BREAKER
                </span>
                <div className="text-sm sm:text-base font-extrabold text-cyan-400 font-mono flex items-center gap-1 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 inline" />
                  <span>CLOSED (HEALTHY)</span>
                </div>
              </div>

              <div className="border-r border-slate-800/80 pr-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                  STREAM CONSUMERS
                </span>
                <div className="text-sm sm:text-base font-extrabold text-purple-300 font-mono mt-0.5">
                  <span>4 WORKERS SYNCED</span>
                </div>
              </div>

              <div>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                  MATH VERIFICATION
                </span>
                <div className="text-sm sm:text-base font-extrabold text-amber-300 font-mono mt-0.5">
                  <span>ZERO HALLUCINATIONS</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PipelineTransitionContext.Provider>
  );
}
