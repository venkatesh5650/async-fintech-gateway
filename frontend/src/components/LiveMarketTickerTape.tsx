"use client";

import React from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Radio } from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";

interface TickerItem {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
}

export default function LiveMarketTickerTape() {
  const { playClick } = useSoundFX();

  const tickers: TickerItem[] = [
    { symbol: "AAPL", name: "Apple", price: "$330.32", change: "+1.42%", isPositive: true },
    { symbol: "TSLA", name: "Tesla", price: "$354.11", change: "+2.18%", isPositive: true },
    { symbol: "MSFT", name: "Microsoft", price: "$512.80", change: "-0.64%", isPositive: false },
    { symbol: "NVDA", name: "Nvidia", price: "$230.86", change: "+3.85%", isPositive: true },
    { symbol: "GOOGL", name: "Alphabet", price: "$338.24", change: "+0.91%", isPositive: true },
    { symbol: "AMZN", name: "Amazon", price: "$224.50", change: "+1.15%", isPositive: true },
  ];

  return (
    <div className="w-full border-y border-cyan-500/20 bg-slate-950/60 backdrop-blur-md py-2 overflow-x-auto no-scrollbar font-mono text-xs">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between min-w-max space-x-6">
        <div className="flex items-center space-x-2 text-cyan-400 font-bold shrink-0">
          <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
          <span className="text-[10px] tracking-widest uppercase">LIVE MARKET STREAM</span>
        </div>

        <div className="flex items-center space-x-6">
          {tickers.map((t) => (
            <Link
              key={t.symbol}
              href={`/dashboard/${t.symbol}`}
              onClick={() => playClick()}
              className="flex items-center space-x-2 px-2.5 py-1 rounded bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-800/80 transition-all group"
            >
              <span className="font-bold text-white group-hover:text-cyan-300">
                {t.symbol}
              </span>
              <span className="text-slate-400 text-[11px]">{t.price}</span>
              <span
                className={`text-[10px] font-bold flex items-center space-x-0.5 ${
                  t.isPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {t.isPositive ? (
                  <TrendingUp className="w-2.5 h-2.5 inline" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5 inline" />
                )}
                <span>{t.change}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="text-[10px] text-slate-500 shrink-0 font-mono">
          FEED: YFINANCE LIVE
        </div>
      </div>
    </div>
  );
}
