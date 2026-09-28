import React, { useState, useEffect } from "react";

export interface SnapshotItem {
  version: number;
  timestamp: string | null;
  composite_score: number | null;
  recommendation: string;
  rsi_14: number | null;
  volatility_30d_pct: number | null;
  sharpe_ratio: number | null;
}

export interface SnapshotDiffResponse {
  symbol: string;
  has_diff: boolean;
  current_version?: number;
  previous_version?: number;
  current_snapshot?: SnapshotItem;
  previous_snapshot?: SnapshotItem;
  deltas?: {
    composite_score_delta: number;
    rsi_14_delta: number;
    volatility_delta: number;
    recommendation_changed: boolean;
    recommendation_from: string;
    recommendation_to: string;
  };
  message?: string;
  trace_id?: string;
}

const DEFAULT_TICKERS = ["AAPL", "NVDA", "TSLA", "AMD", "MSFT", "GOOGL", "AMZN", "META"];

export default function SignalVersionDiff({ initialTicker = "AAPL" }: { initialTicker?: string }) {
  const [ticker, setTicker] = useState<string>(initialTicker);
  const [diffData, setDiffData] = useState<SnapshotDiffResponse | null>(null);
  const [history, setHistory] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiHost = process.env.NEXT_PUBLIC_API_URL || "https://fintech-api-gateway-m2yl.onrender.com";
      const headers = {
        "X-N8N-API-KEY": "super_secure_internal_orchestration_secret_key_2026",
      };

      const [diffRes, histRes] = await Promise.all([
        fetch(`${apiHost}/v1/analytics/snapshots/diff/${ticker}`, { headers }),
        fetch(`${apiHost}/v1/analytics/snapshots/${ticker}?limit=10`, { headers }),
      ]);

      if (!diffRes.ok || !histRes.ok) {
        throw new Error("Failed to retrieve signal snapshot versioning telemetry");
      }

      const diffJson = await diffRes.json();
      const histJson = await histRes.json();

      setDiffData(diffJson);
      setHistory(histJson.snapshots || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch snapshot diff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [ticker]);

  return (
    <div className="w-full bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-4 sm:p-6 font-mono text-gray-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
            <span>📜</span> Real-time Signal Versioning & Audit Diff
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Track quantitative signal revisions and model state drift over time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="bg-black border border-gray-700 text-amber-300 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-amber-500"
          >
            {DEFAULT_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            onClick={fetchData}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-3.5 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Syncing..." : "Refresh Audit"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-400 text-xs rounded mb-4">
          Error: {error}
        </div>
      )}

      {loading && (
        <div className="p-8 text-center text-xs text-gray-500 animate-pulse">
          Fetching versioned signal snapshots from PostgreSQL database...
        </div>
      )}

      {!loading && diffData && (
        <div className="space-y-6">
          {/* Version Diff Card */}
          {diffData.has_diff && diffData.deltas ? (
            <div className="bg-black/60 border border-amber-900/40 p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <span className="text-amber-400 text-xs uppercase font-bold tracking-wider flex items-center gap-2">
                  <span>⚡</span> Version Delta Matrix (v{diffData.previous_version} → v{diffData.current_version})
                </span>

                {diffData.deltas.recommendation_changed ? (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    SIGNAL REVISED: {diffData.deltas.recommendation_from} ➔ {diffData.deltas.recommendation_to}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
                    SIGNAL STABLE ({diffData.deltas.recommendation_to})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <div className="text-gray-500 text-[10px] uppercase">Composite Delta</div>
                  <div
                    className={`text-base font-bold mt-1 ${
                      diffData.deltas.composite_score_delta >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {diffData.deltas.composite_score_delta >= 0
                      ? `+${diffData.deltas.composite_score_delta} pts`
                      : `${diffData.deltas.composite_score_delta} pts`}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {diffData.previous_snapshot?.composite_score} ➔ {diffData.current_snapshot?.composite_score}
                  </div>
                </div>

                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <div className="text-gray-500 text-[10px] uppercase">RSI(14) Delta</div>
                  <div
                    className={`text-base font-bold mt-1 ${
                      diffData.deltas.rsi_14_delta >= 0 ? "text-cyan-400" : "text-purple-400"
                    }`}
                  >
                    {diffData.deltas.rsi_14_delta >= 0
                      ? `+${diffData.deltas.rsi_14_delta}`
                      : `${diffData.deltas.rsi_14_delta}`}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {diffData.previous_snapshot?.rsi_14} ➔ {diffData.current_snapshot?.rsi_14}
                  </div>
                </div>

                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <div className="text-gray-500 text-[10px] uppercase">Volatility Delta</div>
                  <div
                    className={`text-base font-bold mt-1 ${
                      diffData.deltas.volatility_delta >= 0 ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {diffData.deltas.volatility_delta >= 0
                      ? `+${diffData.deltas.volatility_delta}%`
                      : `${diffData.deltas.volatility_delta}%`}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {diffData.previous_snapshot?.volatility_30d_pct}% ➔ {diffData.current_snapshot?.volatility_30d_pct}%
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-400 text-center">
              {diffData.message || "Single snapshot recorded. Run another query to generate version delta."}
            </div>
          )}

          {/* Historical Version Timeline Table */}
          <div>
            <h3 className="text-gray-400 uppercase text-xs tracking-wider mb-3 border-b border-gray-800 pb-2">
              Snapshot Audit Log ({history.length} Versions Recorded)
            </h3>

            {history.length > 0 ? (
              <div className="max-h-56 overflow-y-auto border border-gray-800 rounded-lg">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-black sticky top-0 border-b border-gray-800 text-gray-400">
                    <tr>
                      <th className="p-2.5">Ver</th>
                      <th className="p-2.5">Captured Timestamp</th>
                      <th className="p-2.5">Composite Score</th>
                      <th className="p-2.5">Recommendation</th>
                      <th className="p-2.5">RSI(14)</th>
                      <th className="p-2.5">Volatility</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 bg-gray-950/40">
                    {history.map((snap, idx) => (
                      <tr key={idx} className="hover:bg-gray-900/50 transition-colors">
                        <td className="p-2.5 font-bold text-amber-400">v{snap.version}</td>
                        <td className="p-2.5 text-gray-400">
                          {snap.timestamp ? new Date(snap.timestamp).toLocaleString() : "N/A"}
                        </td>
                        <td className="p-2.5 font-bold text-cyan-300">
                          {snap.composite_score !== null ? `${snap.composite_score}/100` : "N/A"}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              snap.recommendation.includes("BUY")
                                ? "bg-green-500/20 text-green-400"
                                : snap.recommendation.includes("SELL")
                                ? "bg-red-500/20 text-red-400"
                                : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            {snap.recommendation}
                          </span>
                        </td>
                        <td className="p-2.5 text-gray-300">{snap.rsi_14 ?? "N/A"}</td>
                        <td className="p-2.5 text-purple-300">{snap.volatility_30d_pct ? `${snap.volatility_30d_pct}%` : "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-gray-500 bg-gray-950 rounded">
                No historical snapshots found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
