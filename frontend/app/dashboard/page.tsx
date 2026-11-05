"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectorHeatmap from "@/components/SectorHeatmap";
import TickerSearchModal from "@/components/TickerSearchModal";

const OPEN_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD"];

export default function OverviewPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [lastTicker, setLastTicker] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("aer-last-ticker");
    if (stored) setLastTicker(stored);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Open a stock to see its price, quantitative indicators, AI memo, and filings on
            separate tabs. The full filing library is under Filings. Batch progress is on Runs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600"
        >
          Search a stock
        </button>
      </div>

      {lastTicker && (
        <Link
          href={`/dashboard/${lastTicker}`}
          className="block rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 hover:border-slate-700"
        >
          Continue {lastTicker}
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-300">Open research</h2>
        <div className="flex flex-wrap gap-2">
          {OPEN_SYMBOLS.map((symbol) => (
            <Link
              key={symbol}
              href={`/dashboard/${symbol}`}
              className="rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-800 hover:text-cyan-200"
            >
              {symbol}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">Sector snapshot</h2>
        <SectorHeatmap />
      </section>

      <TickerSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
