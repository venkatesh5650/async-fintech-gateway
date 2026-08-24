"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import IntelligenceCard from "@/components/IntelligenceCard";
import LogoutButton from "@/components/LogoutButton";
import ActionTriggers from "@/components/ActionTriggers";
import useWebSocket from "@/hooks/useWebSocket";

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
  // STEP 2: WEBSOCKET EVENT STREAMING
  // --------------------------------------------------
  // This listener catches the pushed data from FastAPI instantly.
  const handleWebSocketMessage = useCallback((data: any) => {
    if (data && data.status) {
      setJobState((prev) => ({
        ...prev,
        ...data,
        job_id: prev?.job_id, // keep the original job_id
      }));
    }
  }, []);

  // The hook autonomously connects as soon as job_id is populated
  const { isConnected, isExhausted } = useWebSocket({
    jobId, // ← use the new stable state
    onMessage: handleWebSocketMessage,
  });

  // --------------------------------------------------
  // THE DISPATCH ENGINE (POLLING REMOVED)
  // --------------------------------------------------
  useEffect(() => {
    if (!ticker) return;

    const dispatchJob = async () => {
      try {
        setError(null);

        // Dispatch the background job to the AI Engine
        const dispatchRes = await fetch(`/api/jobs/${ticker}`, {
          method: "POST",
        });

        if (!dispatchRes.ok) {
          if (dispatchRes.status === 401) {
            throw new Error("SESSION_EXPIRED");
          }

          const errorPayload = await dispatchRes.json();
          throw new Error(
            errorPayload.error ||
              "Failed to dispatch AI worker. Check backend connection.",
          );
        }

        const { job_id } = await dispatchRes.json();

        // 1% MOVE: Set initial state, and let the WebSocket take over the rest.
        setJobId(job_id);
        setJobState({ status: "processing", job_id });
      } catch (err: any) {
        setError(err.message);
      }
    };

    dispatchJob();

    // Notice: NO MORE setInterval cleanup required for the API requests!
  }, [ticker, refreshTrigger]);

  // --------------------------------------------------
  // ERROR STATES
  // --------------------------------------------------
  if (error) {
    if (error === "SESSION_EXPIRED") {
      return (
        <div className="p-10 flex flex-col items-center justify-center min-h-screen bg-black font-mono">
          <div className="max-w-md w-full bg-gray-900 border border-yellow-500/30 rounded-xl p-8 shadow-2xl text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/10 text-yellow-500 mb-2 text-xl">
              🔒
            </div>
            <h2 className="text-white font-bold text-xl tracking-wide">
              Session Expired
            </h2>
            <LogoutButton />
            <p className="text-gray-400 text-sm leading-relaxed">
              Your security clearance (JWT token) has expired. For zero-trust
              data protection, please re-authenticate your session.
            </p>
            <div className="pt-4">
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-full py-3 px-4 bg-green-600 hover:bg-green-500 text-black rounded-lg text-sm font-bold transition text-center"
              >
                Re-Authenticate / Refresh Token
              </a>
            </div>
          </div>
        </div>
      );
    }

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
            {error}
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
                isProcessing={false}
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
      <div className="p-10 flex flex-col items-center justify-center space-y-6 min-h-screen bg-black relative">
        {/* TCP Connection Indicator */}
        <div className="absolute top-8 right-8 flex items-center space-x-2 text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" : "bg-yellow-500 animate-pulse"}`}
          ></span>
          <span className={isConnected ? "text-green-500" : "text-yellow-500"}>
            {isConnected ? "TCP Stream Active" : "Establishing Handshake..."}
          </span>
        </div>

        <div className="h-12 w-64 bg-gray-800 rounded-md animate-pulse"></div>
        <div className="text-gray-400 font-mono text-sm animate-pulse">
          LangGraph AI Engine is reasoning on {ticker || "ASSET"}...
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
          {/* Subtle live indicator for the polished UI */}
          <span className="text-xs text-green-500 flex items-center border border-green-500/30 px-3 py-1 rounded bg-green-500/5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 shadow-[0_0_5px_rgba(34,197,94,1)]"></span>
            Live Data
          </span>
        </h1>

        <div className="max-w-4xl mx-auto">
          <IntelligenceCard data={jobState.result} />
          <ActionTriggers
            ticker={ticker}
            onDispatch={handleManualDispatch}
            isProcessing={false}
            cooldown={cooldown}
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
            isProcessing={false}
            cooldown={cooldown}
          />
        )}
      </div>
    </div>
  );
}
