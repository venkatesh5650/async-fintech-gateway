import React, { useState, useEffect } from "react";

export interface SectorItem {
  sector: string;
  symbols: string[];
  avg_composite_score: number;
  avg_return_pct: number;
  rotation_status: "OUTPERFORMING" | "INFLOW" | "OUTFLOW" | "UNDERPERFORMING" | string;
  top_performing_symbol: string;
  top_symbol_return_pct: number;
}

export interface SectorRotationResponse {
  days_analyzed: number;
  total_sectors: number;
  sectors: SectorItem[];
  trace_id?: string;
}

export default function SectorHeatmap() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SectorRotationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiHost = process.env.NEXT_PUBLIC_API_URL || "https://fintech-api-gateway-m2yl.onrender.com";
      const res = await fetch(`${apiHost}/v1/analytics/sectors?days=${days}`, {
        headers: {
          "X-N8N-API-KEY": "super_secure_internal_orchestration_secret_key_2026",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to fetch sector rotation analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSectors();
  }, [days]);

  const getRotationBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "OUTPERFORMING":
        return "bg-green-500/20 text-green-400 border-green-500/40 shadow-[0_0_10px_rgba(34,197,94,0.2)]";
      case "INFLOW":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]";
      case "UNDERPERFORMING":
        return "bg-red-500/20 text-red-400 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]";
      default:
        return "bg-amber-500/20 text-amber-400 border-amber-500/40";
    }
  };

  return (
    <div className="w-full bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-4 sm:p-6 font-mono text-gray-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2">
            <span>🌐</span> Multi-Asset Sector Rotation & Relative Strength
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Aggregated cross-asset capital flows and sector technical momentum scores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {[14, 30, 60].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-xs transition-colors font-bold ${
                days === d
                  ? "bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                  : "bg-black border border-gray-800 text-gray-400 hover:border-gray-700"
              }`}
            >
              {d}D Lookback
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="p-8 text-center text-xs text-gray-500 animate-pulse">
          Computing cross-asset sector correlation and return averages...
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-400 text-xs rounded">
          Error: {error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.sectors.map((sec, idx) => {
            const badgeStyle = getRotationBadge(sec.rotation_status);
            return (
              <div
                key={idx}
                className="bg-black/60 border border-gray-800 hover:border-purple-900/60 p-4 rounded-xl space-y-4 transition-all"
              >
                {/* Sector Title & Status */}
                <div className="flex items-start justify-between gap-2 border-b border-gray-800/80 pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-gray-100">{sec.sector}</h3>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Assets: {sec.symbols.join(", ")}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold tracking-wider ${badgeStyle}`}
                  >
                    {sec.rotation_status}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-950 p-2.5 rounded border border-gray-800/80">
                    <div className="text-gray-500 text-[10px] uppercase">Avg Return ({days}D)</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        sec.avg_return_pct >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {sec.avg_return_pct >= 0 ? `+${sec.avg_return_pct}%` : `${sec.avg_return_pct}%`}
                    </div>
                  </div>

                  <div className="bg-gray-950 p-2.5 rounded border border-gray-800/80">
                    <div className="text-gray-500 text-[10px] uppercase">Composite Score</div>
                    <div className="text-sm font-bold text-purple-300 mt-0.5">
                      {sec.avg_composite_score}/100
                    </div>
                  </div>
                </div>

                {/* Sector Leader */}
                <div className="bg-purple-950/20 border border-purple-900/30 p-2.5 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-gray-400 text-[10px] uppercase">Sector Leader:</span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-purple-300">{sec.top_performing_symbol}</span>
                    <span
                      className={`text-[10px] ${
                        sec.top_symbol_return_pct >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      ({sec.top_symbol_return_pct >= 0 ? `+${sec.top_symbol_return_pct}%` : `${sec.top_symbol_return_pct}%`})
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
