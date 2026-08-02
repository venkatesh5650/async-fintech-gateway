"use client"; // Required for client-side state management and polling intervals

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import IntelligenceCard from "@/components/IntelligenceCard";

// Strict type contracts mapping to the backend payload
interface JobState {
  status: "processing" | "completed" | "failed";
  job_id: string;
  result?: any; // Maps to IntelligenceResponse inside the component
}

export default function DynamicDashboardPage() {
  const params = useParams();

  // Extract and normalize the ticker parameter from the URL route
  const rawTicker = params?.ticker;
  const ticker = typeof rawTicker === "string" ? rawTicker.toUpperCase() : null;

  const [jobState, setJobState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Ensure the ticker parameter is available before initiating API requests
    if (!ticker) return;

    let pollingInterval: NodeJS.Timeout;

    const dispatchAndPoll = async () => {
      try {
        // 1. Dispatch the background job via the Next.js proxy route
        const dispatchRes = await fetch(`/api/jobs/${ticker}`, {
          method: "POST",
        });

        if (!dispatchRes.ok) {
          // Handle unauthorized responses (e.g., expired JWT session)
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
        setJobState({ status: "processing", job_id });

        // 2. Initialize polling to monitor job status
        pollingInterval = setInterval(async () => {
          const pollRes = await fetch(`/api/jobs/${job_id}`, {
            method: "GET",
          });

          if (!pollRes.ok) {
            if (pollRes.status === 401) {
              setError("SESSION_EXPIRED");
              clearInterval(pollingInterval);
            }
            return; // Silent fail on transient network blip, retry next tick
          }

          const currentJob = await pollRes.json();
          setJobState(currentJob);

          // 3. Terminate polling upon job completion or failure
          if (
            currentJob.status === "completed" ||
            currentJob.status === "failed"
          ) {
            clearInterval(pollingInterval);
          }
        }, 2000); // Poll every 2 seconds
      } catch (err: any) {
        setError(err.message);
      }
    };

    dispatchAndPoll();

    // Cleanup polling interval on component unmount to prevent memory leaks
    return () => clearInterval(pollingInterval);
  }, [ticker]);

  // --- UI RENDERING STATES ---

  if (error) {
    // State A: User Session Expired (401 Unauthorized)
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

    // State B: User Malformed Ticker Input (400 / 422 Validation Error)
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
            <br />
            <br />
            <span className="text-gray-300">Rule:</span> Tickers must consist of
            strictly 1 to 5 alphabetic characters (e.g.,{" "}
            <span className="text-green-400">AAPL</span>,{" "}
            <span className="text-green-400">TSLA</span>,{" "}
            <span className="text-green-400">NVDA</span>).
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

  // Skeleton loader state while job is processing
  if (!ticker || !jobState || jobState.status === "processing") {
    return (
      <div className="p-10 flex flex-col items-center justify-center space-y-6 min-h-screen bg-black">
        <div className="h-12 w-64 bg-gray-800 rounded-md animate-pulse"></div>
        <div className="text-gray-400 font-mono text-sm animate-pulse">
          LangGraph AI Engine is reasoning on {ticker || "ASSET"}...
        </div>
      </div>
    );
  }

  // Render finalized job results
  if (jobState.status === "completed") {
    return (
      <div className="p-10 min-h-screen bg-black">
        <h1 className="text-3xl font-bold text-white mb-6 border-b border-gray-800 pb-2 font-mono">
          {ticker} AI Analysis
        </h1>
        <div className="max-w-4xl mx-auto">
          <IntelligenceCard data={jobState.result} />
        </div>
      </div>
    );
  }

  // Fallback Failure State
  return (
    <div className="p-10 text-red-500 min-h-screen bg-black font-mono">
      Job failed or timed out. Please try again.
    </div>
  );
}