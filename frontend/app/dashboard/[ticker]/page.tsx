"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import IntelligenceCard from "@/components/IntelligenceCard";
import LogoutButton from "@/components/LogoutButton";
import ActionTriggers from "@/components/ActionTriggers";
import BatchCommandCenter from "@/components/BatchCommandCenter";
import MarketChart from "@/components/MarketChart";
import useWebSocket from "@/hooks/useWebSocket";
import { BatchAssetStatus, BatchJobAcceptedResponse } from "@/types/api";

interface JobState {
  status: "processing" | "completed" | "failed";
  job_id: string;
  result?: any;
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

  // Batch Orchestration State
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchAssets, setBatchAssets] = useState<BatchAssetStatus[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Chart pricing data state
  const [chartData, setChartData] = useState<any[]>([]);

  // Fetch historical price points
  useEffect(() => {
    if (!ticker) return;
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/market-data/${ticker}`);
        if (res.ok) {
          const history = await res.json();
          setChartData(history);
        } else {
          console.error("Failed to fetch historical market data");
        }
      } catch (err) {
        console.error("Error fetching historical market data:", err);
      }
    };
    fetchHistory();
  }, [ticker]);

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
  };

  // --------------------------------------------------
  // WEBSOCKET EVENT STREAMING
  // --------------------------------------------------
  const handleWebSocketMessage = useCallback(
    (data: any) => {
      if (data && data.status) {
        // 1. Single Asset Job update (matches the current active ticker)
        if (data.result?.ticker === ticker || data.job_id === jobId) {
          setJobState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              ...data,
              job_id: prev.job_id,
            };
          });
        }

        // 2. Multi-Asset Batch Matrix update (matches any asset in the active batch)
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
    },
    [ticker, jobId]
  );

  const { isConnected, isExhausted } = useWebSocket({
    jobId,
    onMessage: handleWebSocketMessage,
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

        const { job_id } = await dispatchRes.json();
        setJobId(job_id);
        setJobState({ status: "processing", job_id });
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

      const initialAssets: BatchAssetStatus[] = data.jobs.map((j) => ({
        ticker: j.ticker,
        job_id: j.job_id,
        status: "processing",
      }));
      setBatchAssets(initialAssets);

      // Connect WebSocket if current dashboard asset is in the batch
      const currentAssetJob = data.jobs.find((j) => j.ticker === ticker);
      if (currentAssetJob) {
        setJobId(currentAssetJob.job_id);
        setJobState({ status: "processing", job_id: currentAssetJob.job_id });
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
      <div className="p-10 flex flex-col items-center justify-center min-h-screen bg-black font-mono">
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
      <div className="p-10 flex flex-col items-center justify-center min-h-screen bg-black font-mono">
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
      <div className="p-10 min-h-screen bg-black relative flex flex-col items-center">
        {/* TCP Connection Indicator */}
        <div className="absolute top-8 right-8 flex items-center space-x-2 text-xs font-mono">
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

        <div className="w-full max-w-4xl space-y-6 mt-8">
          <h1 className="text-3xl font-bold text-white mb-6 border-b border-gray-800 pb-2 font-mono flex items-center justify-between">
            <span>{ticker || "Asset"} AI Analysis</span>
            <LogoutButton />
          </h1>

          {/* Show chart immediately if we have data, even when AI is reasoning */}
          {ticker && chartData.length > 0 && (
            <MarketChart ticker={ticker} data={chartData} />
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center space-y-4 font-mono">
            <div className="h-8 w-8 border-2 border-t-blue-500 border-gray-800 rounded-full animate-spin" />
            <div className="text-gray-400 text-sm">
              LangGraph AI Engine is reasoning on {ticker || "ASSET"}...
            </div>
          </div>

          {/* Render Batch Matrix if batch is active during processing */}
          {batchId && batchAssets.length > 0 && (
            <BatchCommandCenter
              batchId={batchId}
              assets={batchAssets}
              onClearBatch={() => {
                setBatchId(null);
                setBatchAssets([]);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // COMPLETED STATE
  // --------------------------------------------------
  if (jobState.status === "completed") {
    return (
      <div className="p-10 min-h-screen bg-black">
        <h1 className="text-3xl font-bold text-white mb-6 border-b border-gray-800 pb-2 font-mono flex items-center justify-between">
          <span>{ticker} AI Analysis</span>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-green-500 flex items-center border border-green-500/30 px-3 py-1 rounded bg-green-500/5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 shadow-[0_0_5px_rgba(34,197,94,1)]" />
              Live Data
            </span>
            <LogoutButton />
          </div>
        </h1>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Candlestick Chart Visualization */}
          {ticker && <MarketChart ticker={ticker} data={chartData} />}

          <IntelligenceCard data={jobState.result} />
          
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
            onClearBatch={() => {
              setBatchId(null);
              setBatchAssets([]);
            }}
          />
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // FAILURE STATE
  // --------------------------------------------------
  return (
    <div className="p-10 min-h-screen bg-black font-mono">
      <div className="text-red-500 mb-6 text-center text-xl">
        Job failed or timed out. Please try again.
      </div>
      <div className="max-w-4xl mx-auto">
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
          onClearBatch={() => {
            setBatchId(null);
            setBatchAssets([]);
          }}
        />
      </div>
    </div>
  );
}
