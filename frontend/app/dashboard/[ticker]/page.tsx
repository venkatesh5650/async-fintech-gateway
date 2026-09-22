"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import IntelligenceCard from "@/components/IntelligenceCard";
import LogoutButton from "@/components/LogoutButton";
import ActionTriggers from "@/components/ActionTriggers";
import BatchCommandCenter from "@/components/BatchCommandCenter";
import TraceWaterfallModal from "@/components/TraceWaterfallModal";
import OperationsConsole, { OpsTab } from "@/components/OperationsConsole";
import MarketChart from "@/components/MarketChart";
import useWebSocket from "@/hooks/useWebSocket";
import { BatchAssetStatus, BatchJobAcceptedResponse } from "@/types/api";

interface JobState {
  status: "processing" | "completed" | "failed";
  job_id: string;
  result?: any;
  trace_id?: string;
}

export default function DynamicDashboardPage() {
  const params = useParams();

  const rawTicker = params?.ticker;
  const ticker = typeof rawTicker === "string" ? rawTicker.toUpperCase() : null;

  const [jobState, setJobState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [cooldown, setCooldown] = useState<number>(0);
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [traceId, setTraceId] = useState<string | undefined>(undefined);
  const [activeOpsTab, setActiveOpsTab] = useState<OpsTab>("registry");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const handleCloseTraceModal = useCallback(() => {
    setSelectedTraceId(null);
  }, []);

  // Batch Orchestration State
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchAssets, setBatchAssets] = useState<BatchAssetStatus[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Chart pricing data state
  const [chartData, setChartData] = useState<any[]>([]);

  // Refs for tracking latest state (prevent stale closures in async handlers)
  const jobStateRef = useRef<JobState | null>(null);
  const jobIdRef = useRef<string | undefined>(undefined);
  const batchIdRef = useRef<string | null>(null);
  const batchAssetsRef = useRef<BatchAssetStatus[]>([]);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => { jobStateRef.current = jobState; }, [jobState]);
  useEffect(() => { jobIdRef.current = jobId; }, [jobId]);
  useEffect(() => { batchIdRef.current = batchId; }, [batchId]);
  useEffect(() => { batchAssetsRef.current = batchAssets; }, [batchAssets]);

  // Fetch historical price points
  const fetchHistory = useCallback(async () => {
    if (!ticker) return;
    try {
      const res = await fetch(`/api/market-data/${ticker}`);
      if (res.ok) {
        const history = await res.json();
        setChartData(history);
      } else {
        const errPayload = await res.json().catch(() => ({}));
        console.error("Failed to fetch historical market data:", res.status, errPayload);
        if (res.status === 401 || res.status === 403) {
          setError("SESSION_EXPIRED");
        }
      }
    } catch (err) {
      console.error("Error fetching historical market data:", err);
    }
  }, [ticker]);

  // Cache-Aside intelligence fetching state
  const [isCacheRefreshing, setIsCacheRefreshing] = useState(false);

  // Fetch intelligence from Cache-Aside layer
  const fetchCachedIntelligence = useCallback(async (forceRefresh = false) => {
    if (!ticker) return;
    setIsCacheRefreshing(true);
    try {
      const res = await fetch(`/api/results/${ticker}${forceRefresh ? "?refresh=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        setJobState((prev) => ({
          status: "completed",
          job_id: prev?.job_id || `cache-${ticker}`,
          result: {
            ...(prev?.result || {}),
            ...data,
          },
          trace_id: data.trace_id || prev?.trace_id,
        }));
        if (data.trace_id) {
          setTraceId(data.trace_id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch cached intelligence:", err);
    } finally {
      setIsCacheRefreshing(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchHistory();
    if (ticker) {
      fetchCachedIntelligence(false);
    }
  }, [fetchHistory, ticker, fetchCachedIntelligence]);

  // REST API status checker for job recovery and batch reconciliation
  const fetchJobStatus = useCallback(async (targetJobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${targetJobId}`);
      if (res.ok) {
        const data = await res.json();

        if (jobIdRef.current === targetJobId) {
          setJobState((prev) => {
            if (prev && prev.status === data.status && prev.result === data.result) {
              return prev;
            }
            const current = prev || { status: data.status, job_id: targetJobId };
            return { ...current, ...data };
          });
          if (data.trace_id) {
            setTraceId(data.trace_id);
          }
        }

        setBatchAssets((prevAssets) => {
          const target = prevAssets.find((a) => a.job_id === targetJobId);
          if (!target || (target.status === data.status && target.result === data.result)) {
            return prevAssets;
          }
          const updated = prevAssets.map((asset) => {
            if (asset.job_id === targetJobId) {
              return {
                ...asset,
                status: data.status,
                result: data.result,
                error: data.error,
                server_timestamp: data.server_timestamp,
              };
            }
            return asset;
          });

          if (syncChannelRef.current && batchIdRef.current) {
            syncChannelRef.current.postMessage({
              type: "BATCH_UPDATE",
              payload: { batchId: batchIdRef.current, batchAssets: updated },
            });
          }

          return updated;
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 500 && errData.error) {
          if (jobIdRef.current === targetJobId) {
            setJobState((prev) =>
              prev ? { ...prev, status: "failed", error: errData.error } : null
            );
          }
          setBatchAssets((prevAssets) =>
            prevAssets.map((asset) =>
              asset.job_id === targetJobId
                ? { ...asset, status: "failed", error: errData.error }
                : asset
            )
          );
        }
      }
    } catch (err) {
      console.error("[Recovery] Failed to fetch job status:", err);
    }
  }, []);

  // Sequence Gap Recovery logic
  const handleSequenceGap = useCallback(() => {
    console.warn(`[WS] Gap detected for active ticker ${ticker}. Triggering state recovery.`);
    fetchHistory();
    if (jobIdRef.current) {
      fetchJobStatus(jobIdRef.current);
    }
  }, [ticker, fetchHistory, fetchJobStatus]);

  // Active job status reconciliation & fallback polling
  useEffect(() => {
    const hasPendingBatch = batchAssets.some(
      (a) => a.status === "processing" || a.status === "queued"
    );
    const hasPendingSingle = jobState?.status === "processing";

    if (!hasPendingBatch && !hasPendingSingle) return;

    // Immediate check on trigger
    if (hasPendingSingle && jobIdRef.current) {
      fetchJobStatus(jobIdRef.current);
    }
    if (hasPendingBatch) {
      batchAssetsRef.current
        .filter((a) => a.status === "processing" || a.status === "queued")
        .forEach((a) => {
          fetchJobStatus(a.job_id);
        });
    }

    const interval = setInterval(() => {
      if (jobStateRef.current?.status === "processing" && jobIdRef.current) {
        fetchJobStatus(jobIdRef.current);
      }
      const pending = batchAssetsRef.current.filter(
        (a) => a.status === "processing" || a.status === "queued"
      );
      if (pending.length > 0) {
        pending.forEach((a) => {
          fetchJobStatus(a.job_id);
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobState?.status, batchAssets, fetchJobStatus]);

  // --------------------------------------------------
  // SESSION STATE PRESERVATION & RESTORATION (LOCAL STORAGE)
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined" || !ticker) return;

    // Restore Cooldown
    const cooldownUntil = localStorage.getItem("cooldown_until");
    if (cooldownUntil) {
      const remaining = Math.ceil((parseInt(cooldownUntil, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setCooldown(remaining);
      }
    }

    // Restore Ticker Job
    const cachedJobId = localStorage.getItem(`job_id_${ticker}`);
    const cachedJobState = localStorage.getItem(`job_state_${ticker}`);
    if (cachedJobId && cachedJobState) {
      setJobId(cachedJobId);
      setJobState(JSON.parse(cachedJobState));
    }

    // Restore Batch
    const cachedBatchId = localStorage.getItem("batch_id");
    const cachedBatchAssets = localStorage.getItem("batch_assets");
    if (cachedBatchId && cachedBatchAssets) {
      setBatchId(cachedBatchId);
      setBatchAssets(JSON.parse(cachedBatchAssets));
    }
  }, [ticker]);

  // Persist Cooldown to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cooldown > 0) {
      localStorage.setItem("cooldown_until", (Date.now() + cooldown * 1000).toString());
    } else {
      localStorage.removeItem("cooldown_until");
    }
  }, [cooldown]);

  // Persist Ticker Job to localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !ticker || !jobId) return;
    localStorage.setItem(`job_id_${ticker}`, jobId);
    if (jobState) {
      localStorage.setItem(`job_state_${ticker}`, JSON.stringify(jobState));
    }
  }, [ticker, jobId, jobState]);

  // Persist Batch to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (batchId) {
      localStorage.setItem("batch_id", batchId);
      localStorage.setItem("batch_assets", JSON.stringify(batchAssets));
    } else {
      localStorage.removeItem("batch_id");
      localStorage.removeItem("batch_assets");
    }
  }, [batchId, batchAssets]);

  // --------------------------------------------------
  // COOLDOWN ENGINE
  // --------------------------------------------------
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleManualDispatch = () => {
    if (cooldown > 0) return;
    setCooldown(60);
    setRefreshTrigger((prev) => prev + 1);

    if (syncChannelRef.current) {
      syncChannelRef.current.postMessage({ type: "COOLDOWN_UPDATE", payload: 60 });
    }
  };

  // --------------------------------------------------
  // WEBSOCKET EVENT STREAMING & TAB SYNCHRONIZATION
  // --------------------------------------------------
  const handleWebSocketMessage = useCallback(
    (data: any, bypassSync = false) => {
      if (data && data.status) {
        // 1. Single Asset Job update
        if (data.result?.ticker === ticker || data.job_id === jobIdRef.current) {
          setJobState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              ...data,
              job_id: prev.job_id,
            };
          });
        }

        // 2. Multi-Asset Batch Matrix update
        if (data.result?.ticker || data.job_id) {
          const incomingTicker = data.result?.ticker?.toUpperCase();
          setBatchAssets((prevAssets) =>
            prevAssets.map((asset) => {
              if (
                (incomingTicker && asset.ticker === incomingTicker) ||
                (data.job_id && asset.job_id === data.job_id)
              ) {
                return {
                  ...asset,
                  status: data.status,
                  result: data.result,
                  error: data.error,
                  server_timestamp: data.server_timestamp,
                };
              }
              return asset;
            })
          );
        }
      }

      // 3. Real-Time Telemetry Broadcast update for the chart
      if (data && data.type === "market_data" && data.ticker === ticker) {
        setChartData((prev) => {
          const newPoint = {
            time: Math.floor(new Date(data.timestamp).getTime() / 1000),
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume,
          };

          const index = prev.findIndex((p) => p.time === newPoint.time);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = newPoint;
            return updated;
          }
          return [...prev, newPoint];
        });
      }

      // Sync WebSocket payload to other browser tabs
      if (!bypassSync && syncChannelRef.current) {
        syncChannelRef.current.postMessage({ type: "WS_PACKET", payload: data });
      }
    },
    [ticker]
  );

  // Set up BroadcastChannel listener for Cross-Tab Sync
  useEffect(() => {
    if (typeof window === "undefined") return;

    const channel = new BroadcastChannel("fintech_gateway_sync");
    syncChannelRef.current = channel;

    const handleSyncMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;
      console.log(`[Sync] Cross-tab event received: ${type}`);

      switch (type) {
        case "COOLDOWN_UPDATE":
          if (typeof payload === "number") {
            setCooldown(payload);
          }
          break;
        case "BATCH_UPDATE":
          if (payload) {
            setBatchId(payload.batchId);
            setBatchAssets(payload.batchAssets);
          } else {
            setBatchId(null);
            setBatchAssets([]);
          }
          break;
        case "JOB_UPDATE":
          if (payload && payload.ticker === ticker) {
            setJobId(payload.jobId);
            setJobState(payload.jobState);
          }
          break;
        case "WS_PACKET":
          if (payload) {
            handleWebSocketMessage(payload, true);
          }
          break;
        default:
          break;
      }
    };

    channel.addEventListener("message", handleSyncMessage);

    return () => {
      channel.removeEventListener("message", handleSyncMessage);
      channel.close();
      syncChannelRef.current = null;
    };
  }, [ticker, handleWebSocketMessage]);

  const { isConnected, isExhausted } = useWebSocket({
    jobId,
    onMessage: handleWebSocketMessage,
    onSequenceGap: handleSequenceGap,
  });

  // --------------------------------------------------
  // SINGLE ASSET DISPATCH ENGINE
  // --------------------------------------------------
  useEffect(() => {
    if (!ticker) return;

    const dispatchJob = async () => {
      try {
        setError(null);

        const dispatchRes = await fetch(`/api/jobs/${ticker}`, {
          method: "POST",
        });

        if (!dispatchRes.ok) {
          if (dispatchRes.status === 401 || dispatchRes.status === 403) {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
            window.location.href = "/login";
            return;
          }

          const errorPayload = await dispatchRes.json().catch(() => ({}));
          const errorMsg =
            errorPayload.error ||
            "Failed to dispatch AI worker. Check backend connection.";

          if (dispatchRes.status === 400) {
            setError(`INVALID_TICKER:${errorMsg}`);
          } else {
            setError(`SYSTEM_ERROR:${errorMsg}`);
          }
          return;
        }

        const { job_id, trace_id } = await dispatchRes.json();
        setJobId(job_id);
        setTraceId(trace_id || undefined);
        const nextState: JobState = { status: "processing", job_id };
        setJobState(nextState);

        // Sync dispatch to other tabs
        if (syncChannelRef.current) {
          syncChannelRef.current.postMessage({
            type: "JOB_UPDATE",
            payload: { ticker, jobId: job_id, jobState: nextState }
          });
        }
      } catch (err: any) {
        setError(`SYSTEM_ERROR:${err.message}`);
      }
    };

    dispatchJob();
  }, [ticker, refreshTrigger]);

  // --------------------------------------------------
  // MULTI-ASSET BATCH DISPATCH HANDLER
  // --------------------------------------------------
  const handleBatchDispatch = async (tickers: string[]) => {
    if (cooldown > 0 || isBatchProcessing) return;
    setCooldown(60);
    if (syncChannelRef.current) {
      syncChannelRef.current.postMessage({ type: "COOLDOWN_UPDATE", payload: 60 });
    }
    setIsBatchProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/jobs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
          window.location.href = "/login";
          return;
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to dispatch batch jobs.");
      }

      const data: BatchJobAcceptedResponse = await res.json();
      setBatchId(data.batch_id);
      setTraceId(data.trace_id || undefined);

      const initialAssets: BatchAssetStatus[] = data.jobs.map((j) => ({
        ticker: j.ticker,
        job_id: j.job_id,
        status: "processing",
      }));
      setBatchAssets(initialAssets);

      // Sync batch state to other tabs
      if (syncChannelRef.current) {
        syncChannelRef.current.postMessage({
          type: "BATCH_UPDATE",
          payload: { batchId: data.batch_id, batchAssets: initialAssets }
        });
      }

      // Connect WebSocket if current dashboard asset is in the batch
      const currentAssetJob = data.jobs.find((j) => j.ticker === ticker);
      if (currentAssetJob) {
        setJobId(currentAssetJob.job_id);
        const nextState: JobState = { status: "processing", job_id: currentAssetJob.job_id };
        setJobState(nextState);

        if (syncChannelRef.current) {
          syncChannelRef.current.postMessage({
            type: "JOB_UPDATE",
            payload: { ticker, jobId: currentAssetJob.job_id, jobState: nextState }
          });
        }
      }
    } catch (err: any) {
      setError(`SYSTEM_ERROR:${err.message}`);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // --------------------------------------------------
  // ERROR STATES & SESSION RESTORATION
  // --------------------------------------------------
  useEffect(() => {
    if (
      error &&
      (error === "SESSION_EXPIRED" ||
        error.includes("Unauthorized") ||
        error.includes("Zero-Trust Access Denied"))
    ) {
      fetch("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          window.location.href = "/login";
        });
    }
  }, [error]);

  if (error) {
    if (
      error === "SESSION_EXPIRED" ||
      error.includes("Unauthorized") ||
      error.includes("Zero-Trust Access Denied")
    ) {
      return (
        <div className="p-10 flex flex-col items-center justify-center min-h-screen bg-black font-mono">
          <div className="text-gray-400">Redirecting to login...</div>
        </div>
      );
    }

    const isInvalidTicker = error.startsWith("INVALID_TICKER:");
    const displayError = error.replace(/^(INVALID_TICKER|SYSTEM_ERROR):/, "");

    if (isInvalidTicker) {
      return (
        <div className="p-10 flex flex-col items-center justify-center min-h-screen bg-black font-mono">
          <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-xl p-8 shadow-2xl text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 text-red-500 mb-2 text-xl">
              ⚠️
            </div>
            <h2 className="text-white font-bold text-xl tracking-wide">
              Invalid Ticker Symbol
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              The asset symbol{" "}
              <span className="text-red-400 font-bold uppercase">
                {ticker || "provided"}
              </span>{" "}
              is invalid or malformed.
            </p>
            <div className="bg-black/50 p-3 rounded-lg border border-gray-800 text-xs text-gray-500 text-left overflow-x-auto">
              <span className="text-red-400 font-bold">Gateway Reason:</span>{" "}
              {displayError}
            </div>
            <div className="pt-4">
              <a
                href="/dashboard/AAPL"
                className="inline-block w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition border border-gray-700 text-center"
              >
                Analyze Valid Asset (AAPL)
              </a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="px-4 py-8 sm:p-10 flex flex-col items-center justify-center min-h-screen bg-black font-mono">
        <div className="max-w-md w-full bg-gray-900 border border-yellow-500/30 rounded-xl p-8 shadow-2xl text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/10 text-yellow-500 mb-2 text-xl">
            ⚡
          </div>
          <h2 className="text-white font-bold text-xl tracking-wide">
            Gateway Engine Issue
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Could not communicate with the backend intelligence pipeline for{" "}
            <span className="text-yellow-400 font-bold uppercase">
              {ticker || "ASSET"}
            </span>.
          </p>
          <div className="bg-black/50 p-3 rounded-lg border border-gray-800 text-xs text-gray-400 text-left overflow-x-auto">
            <span className="text-yellow-400 font-bold">Details:</span>{" "}
            {displayError}
          </div>
          <div className="pt-4">
            <button
              onClick={handleManualDispatch}
              className="inline-block w-full py-3 px-4 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg text-sm transition text-center"
            >
              Retry Pipeline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // CIRCUIT BREAKER STATE
  // --------------------------------------------------
  if (isExhausted) {
    return (
      <div className="px-4 py-8 sm:p-10 flex flex-col items-center justify-center min-h-screen bg-black font-mono">
        <div className="max-w-md w-full bg-gray-900 border border-orange-500/30 rounded-xl p-8 shadow-2xl text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2 text-xl">
            🔌
          </div>
          <h2 className="text-white font-bold text-xl tracking-wide">
            Real-Time Feed Exhausted
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            The secure TCP tunnel to the server was dropped, and maximum
            reconnection attempts have been reached.
          </p>
          <div className="bg-black/50 p-3 rounded-lg border border-gray-800 text-xs text-gray-500 text-left">
            <span className="text-orange-400 font-bold">System Action:</span>{" "}
            Reconnection loop halted to protect browser memory. Please check
            your network firewall or manually dispatch a new job.
          </div>
          <div className="pt-4">
            {ticker && (
              <ActionTriggers
                ticker={ticker}
                onDispatch={handleManualDispatch}
                onBatchDispatch={handleBatchDispatch}
                isProcessing={isBatchProcessing}
                cooldown={cooldown}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // PROCESSING / LOADING STATE
  // --------------------------------------------------
  if (!ticker || !jobState || jobState.status === "processing") {
    return (
      <div className="px-3.5 py-4 sm:p-6 md:p-10 min-h-screen bg-black relative flex flex-col items-center">
        {/* TCP Connection Indicator */}
        <div className="w-full max-w-4xl flex items-center justify-end mb-2 sm:mb-0 sm:absolute sm:top-8 sm:right-8 space-x-2 text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                : "bg-yellow-500 animate-pulse"
            }`}
          />
          <span className={isConnected ? "text-green-500" : "text-yellow-500"}>
            {isConnected ? "TCP Stream Active" : "Establishing Handshake..."}
          </span>
        </div>

        <div className="w-full max-w-4xl space-y-6 mt-2 sm:mt-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6 border-b border-gray-800 pb-3 font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{ticker || "Asset"} AI Analysis</span>
            <LogoutButton />
          </h1>

          {/* Show chart immediately if we have data, even when AI is reasoning */}
          {ticker && chartData.length > 0 && (
            <MarketChart ticker={ticker} data={chartData} />
          )}

          <div className="p-4 sm:p-8 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl flex flex-col items-center justify-center space-y-4 font-mono text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 text-sm">
              AI Quantitative Agents analyzing{" "}
              <span className="text-blue-400 font-bold">{ticker || "Asset"}</span>{" "}
              via LangGraph pipeline...
            </p>
            <p className="text-gray-600 text-xs">
              Streaming distributed state machine updates over WebSocket.
            </p>
          </div>

          <ActionTriggers
            ticker={ticker || ""}
            onDispatch={handleManualDispatch}
            onBatchDispatch={handleBatchDispatch}
            isProcessing={isBatchProcessing}
            cooldown={cooldown}
          />

          {/* Real-time Multi-Asset Batch Matrix */}
          {batchId && batchAssets.length > 0 && (
            <BatchCommandCenter
              batchId={batchId}
              assets={batchAssets}
              onSelectAsset={(selectedTicker) => {
                window.location.href = `/dashboard/${selectedTicker}`;
              }}
              onClearBatch={() => {
                setBatchId(null);
                setBatchAssets([]);
                if (syncChannelRef.current) {
                  syncChannelRef.current.postMessage({
                    type: "BATCH_UPDATE",
                    payload: null
                  });
                }
              }}
            />
          )}

          {/* Operational Observability Console */}
          <OperationsConsole
            activeOpsTab={activeOpsTab}
            setActiveOpsTab={setActiveOpsTab}
            onSelectTrace={(tId) => setSelectedTraceId(tId)}
            ticker={ticker}
            traceId={traceId}
          />

          <TraceWaterfallModal
            traceId={selectedTraceId}
            onClose={handleCloseTraceModal}
          />
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // COMPLETED STATE
  // --------------------------------------------------
  if (jobState.status === "completed") {
    return (
      <div className="px-3.5 py-4 sm:p-6 md:p-10 min-h-screen bg-black">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white border-b border-gray-800 pb-3 font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{ticker} AI Analysis</span>
            <div className="flex items-center justify-between sm:justify-end space-x-3 w-full sm:w-auto">
              <span className="text-xs text-green-500 flex items-center border border-green-500/30 px-3 py-1 rounded bg-green-500/5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 shadow-[0_0_5px_rgba(34,197,94,1)]" />
                Live Data
              </span>
              <LogoutButton />
            </div>
          </h1>

          {/* Candlestick Chart Visualization */}
          {ticker && <MarketChart ticker={ticker} data={chartData} />}

          <IntelligenceCard
            data={jobState.result}
            onRefresh={fetchCachedIntelligence}
            isRefreshing={isCacheRefreshing}
          />

          {/* Distributed trace context */}
          {traceId && (
            <button
              onClick={() => setSelectedTraceId(traceId)}
              className="flex items-center gap-2 bg-[#0a0a0a] border border-gray-800 hover:border-gray-700 rounded-lg px-4 py-2 transition-colors"
              title="View distributed trace waterfall"
            >
              <span className="text-[10px] text-gray-600 uppercase tracking-widest">Trace ID</span>
              <span className="text-xs text-blue-400 font-mono flex items-center gap-1">
                <span>⤢</span>
                <span>{traceId.slice(0, 16)}…</span>
              </span>
            </button>
          )}
          
          <ActionTriggers
            ticker={ticker}
            onDispatch={handleManualDispatch}
            onBatchDispatch={handleBatchDispatch}
            isProcessing={isBatchProcessing}
            cooldown={cooldown}
          />

          {/* Real-time Multi-Asset Batch Matrix */}
          <BatchCommandCenter
            batchId={batchId}
            assets={batchAssets}
            onSelectAsset={(selectedTicker) => {
              window.location.href = `/dashboard/${selectedTicker}`;
            }}
            onClearBatch={() => {
              setBatchId(null);
              setBatchAssets([]);
              if (syncChannelRef.current) {
                syncChannelRef.current.postMessage({
                  type: "BATCH_UPDATE",
                  payload: null
                });
              }
            }}
          />

          {/* Operational Observability Console */}
          <OperationsConsole
            activeOpsTab={activeOpsTab}
            setActiveOpsTab={setActiveOpsTab}
            onSelectTrace={(tId) => setSelectedTraceId(tId)}
            ticker={ticker}
            traceId={traceId}
          />

          <TraceWaterfallModal
            traceId={selectedTraceId}
            onClose={handleCloseTraceModal}
          />
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // FAILURE STATE
  // --------------------------------------------------
  return (
    <div className="px-3.5 py-4 sm:p-6 md:p-10 min-h-screen bg-black font-mono">
      <div className="text-red-500 mb-6 text-center text-lg sm:text-xl">
        Job failed or timed out. Please try again.
      </div>
      <div className="max-w-4xl mx-auto space-y-6">
        {ticker && (
          <ActionTriggers
            ticker={ticker}
            onDispatch={handleManualDispatch}
            onBatchDispatch={handleBatchDispatch}
            isProcessing={isBatchProcessing}
            cooldown={cooldown}
          />
        )}
        <BatchCommandCenter
          batchId={batchId}
          assets={batchAssets}
          onSelectAsset={(selectedTicker) => {
            window.location.href = `/dashboard/${selectedTicker}`;
          }}
          onClearBatch={() => {
            setBatchId(null);
            setBatchAssets([]);
            if (syncChannelRef.current) {
              syncChannelRef.current.postMessage({
                type: "BATCH_UPDATE",
                payload: null
              });
            }
          }}
        />

        {/* Operational Observability Console */}
        <OperationsConsole
          activeOpsTab={activeOpsTab}
          setActiveOpsTab={setActiveOpsTab}
          onSelectTrace={(tId) => setSelectedTraceId(tId)}
          ticker={ticker}
          traceId={traceId}
        />

        <TraceWaterfallModal
          traceId={selectedTraceId}
          onClose={handleCloseTraceModal}
        />
      </div>
    </div>
  );
}
