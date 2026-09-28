import React, { useState, useEffect } from "react";

export interface EquityCurvePoint {
  date: string;
  price: number;
  equity: number;
  benchmark_equity: number;
  action: "BUY" | "SELL" | "HOLD" | string;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  initial_capital: number;
  final_equity: number;
  strategy_return_pct: number;
  benchmark_return_pct: number;
  alpha_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  total_trades: number;
  winning_trades: number;
  win_rate_pct: number;
  equity_curve: EquityCurvePoint[];
}

const DEFAULT_TICKERS = ["AAPL", "NVDA", "TSLA", "AMD", "MSFT", "GOOGL", "AMZN", "META"];

export default function BacktestResultsPanel({ initialTicker = "AAPL" }: { initialTicker?: string }) {
  const [ticker, setTicker] = useState<string>(initialTicker);
  const [strategy, setStrategy] = useState<string>("SMA_CROSSOVER");
  const [days, setDays] = useState<number>(90);
  const [capital, setCapital] = useState<number>(10000);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiHost = process.env.NEXT_PUBLIC_API_URL || "https://fintech-api-gateway-m2yl.onrender.com";
      const res = await fetch(`${apiHost}/v1/analytics/backtest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": "super_secure_internal_orchestration_secret_key_2026",
        },
        body: JSON.stringify({
          ticker,
          initial_capital: capital,
          strategy,
          days,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to execute backtest calculation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBacktest();
  }, [ticker, strategy, days]);

  return (
    <div className="w-full bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-4 sm:p-6 font-mono text-gray-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
            <span>📊</span> Algorithmic Strategy Backtest Engine
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Simulate historical alpha returns vs Buy & Hold benchmark using PostgreSQL time-series execution.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="bg-black border border-gray-700 text-cyan-300 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            {DEFAULT_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="bg-black border border-gray-700 text-purple-300 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-purple-500"
          >
            <option value="SMA_CROSSOVER">SMA Crossover (10/50)</option>
            <option value="RSI_THRESHOLD">RSI Momentum Threshold</option>
            <option value="COMPOSITE_SCORE">Multi-Factor Composite</option>
          </select>

          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-black border border-gray-700 text-gray-300 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value={30}>30 Days</option>
            <option value={60}>60 Days</option>
            <option value={90}>90 Days</option>
            <option value={180}>180 Days</option>
          </select>

          <button
            onClick={fetchBacktest}
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs px-4 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Simulating..." : "Run Backtest"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-400 text-xs rounded mb-4">
          Error: {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-black/60 border border-gray-800 p-3.5 rounded-lg">
              <div className="text-gray-500 uppercase text-[10px]">Strategy Return</div>
              <div
                className={`text-lg font-bold mt-1 ${
                  result.strategy_return_pct >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {result.strategy_return_pct >= 0 ? `+${result.strategy_return_pct}%` : `${result.strategy_return_pct}%`}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Final: ${result.final_equity.toLocaleString()}
              </div>
            </div>

            <div className="bg-black/60 border border-gray-800 p-3.5 rounded-lg">
              <div className="text-gray-500 uppercase text-[10px]">Benchmark (Buy & Hold)</div>
              <div
                className={`text-lg font-bold mt-1 ${
                  result.benchmark_return_pct >= 0 ? "text-blue-400" : "text-amber-400"
                }`}
              >
                {result.benchmark_return_pct >= 0 ? `+${result.benchmark_return_pct}%` : `${result.benchmark_return_pct}%`}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Base: ${result.initial_capital.toLocaleString()}</div>
            </div>

            <div className="bg-black/60 border border-cyan-900/40 p-3.5 rounded-lg">
              <div className="text-cyan-400 uppercase text-[10px]">Generated Alpha</div>
              <div
                className={`text-lg font-bold mt-1 ${
                  result.alpha_pct >= 0 ? "text-cyan-300" : "text-rose-400"
                }`}
              >
                {result.alpha_pct >= 0 ? `+${result.alpha_pct}%` : `${result.alpha_pct}%`}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">Outperformance Delta</div>
            </div>

            <div className="bg-black/60 border border-gray-800 p-3.5 rounded-lg">
              <div className="text-gray-500 uppercase text-[10px]">Win Rate & Trades</div>
              <div className="text-lg font-bold text-purple-400 mt-1">
                {result.win_rate_pct}%
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {result.winning_trades} wins / {result.total_trades} total trades
              </div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-950 p-3 rounded border border-gray-800 flex justify-between items-center">
              <span className="text-gray-400">Sharpe Ratio (Annualized):</span>
              <span className="font-bold text-emerald-400">{result.sharpe_ratio}</span>
            </div>

            <div className="bg-gray-950 p-3 rounded border border-gray-800 flex justify-between items-center">
              <span className="text-gray-400">Maximum Peak-to-Trough Drawdown:</span>
              <span className="font-bold text-rose-400">-{result.max_drawdown_pct}%</span>
            </div>
          </div>

          {/* Equity Curve Table & Timeline */}
          <div>
            <h3 className="text-gray-400 uppercase text-xs tracking-wider mb-3 border-b border-gray-800 pb-2">
              Daily Equity Curve & Executed Signals ({result.equity_curve.length} Samples)
            </h3>

            <div className="max-h-64 overflow-y-auto border border-gray-800 rounded-lg">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-black sticky top-0 border-b border-gray-800 text-gray-400">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Price</th>
                    <th className="p-2.5">Strategy Equity</th>
                    <th className="p-2.5">Benchmark Equity</th>
                    <th className="p-2.5">Signal Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 bg-gray-950/40">
                  {result.equity_curve.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-900/50 transition-colors">
                      <td className="p-2.5 text-gray-400">{row.date}</td>
                      <td className="p-2.5 text-gray-200">${row.price}</td>
                      <td
                        className={`p-2.5 font-bold ${
                          row.equity >= result.initial_capital ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        ${row.equity.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-blue-400">${row.benchmark_equity.toLocaleString()}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.action === "BUY"
                              ? "bg-green-500/20 text-green-400 border border-green-500/40"
                              : row.action === "SELL"
                              ? "bg-red-500/20 text-red-400 border border-red-500/40"
                              : "text-gray-500"
                          }`}
                        >
                          {row.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
