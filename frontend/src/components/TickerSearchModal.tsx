"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Loader2,
  Building2,
  Layers,
  Coins,
  Compass,
} from "lucide-react";
import { useSoundFX } from "@/hooks/useSoundFX";
import { useBikeTransition } from "@/context/BikeTransitionContext";

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
  industry?: string;
  score?: number;
}

interface TickerSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicker?: (ticker: string) => void;
}

const POPULAR_TICKERS = [
  { symbol: "NVDA", label: "NVIDIA", type: "EQUITY" },
  { symbol: "TSLA", label: "Tesla", type: "EQUITY" },
  { symbol: "AAPL", label: "Apple", type: "EQUITY" },
  { symbol: "MSFT", label: "Microsoft", type: "EQUITY" },
  { symbol: "GOOGL", label: "Alphabet", type: "EQUITY" },
  { symbol: "AMZN", label: "Amazon", type: "EQUITY" },
  { symbol: "META", label: "Meta", type: "EQUITY" },
  { symbol: "BTC-USD", label: "Bitcoin", type: "CRYPTO" },
];

export default function TickerSearchModal({
  isOpen,
  onClose,
  onSelectTicker,
}: TickerSearchModalProps) {
  const router = useRouter();
  const { playClick, playBlip } = useSoundFX();
  const { launchBikeTransition } = useBikeTransition();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterType, setFilterType] = useState<string>("ALL");

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input automatically on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      fetchResults("");
    }
  }, [isOpen]);

  // Fetch ticker search results
  const fetchResults = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const q = encodeURIComponent(searchQuery.trim());
      const res = await fetch(`/api/tickers/search${q ? `?q=${q}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setSelectedIndex(0);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced input handler
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchResults(val);
    }, 200);
  };

  const handleSelectTicker = (symbol: string) => {
    const sym = symbol.toUpperCase().trim();
    playClick();

    onClose();

    if (onSelectTicker) {
      onSelectTicker(sym);
    } else {
      launchBikeTransition(sym);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filteredResults.length ? prev + 1 : 0));
        playBlip();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredResults.length - 1));
        playBlip();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredResults.length > 0 && filteredResults[selectedIndex]) {
          handleSelectTicker(filteredResults[selectedIndex].symbol);
        } else if (query.trim()) {
          handleSelectTicker(query.trim());
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, results, filterType, query, onClose, playBlip]);

  // Filtered results based on category tab
  const filteredResults = results.filter((item) => {
    if (filterType === "ALL") return true;
    if (filterType === "EQUITY") return item.quoteType === "EQUITY";
    if (filterType === "ETF") return item.quoteType === "ETF";
    if (filterType === "CRYPTO") return item.quoteType === "CRYPTOCURRENCY";
    return true;
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4">
        {/* Backdrop blur overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative w-full max-w-2xl bg-gray-950/95 border border-cyan-500/40 rounded-2xl shadow-[0_0_50px_rgba(0,240,255,0.2)] overflow-hidden font-mono z-10"
        >
          {/* Top Laser Accent */}
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

          {/* Search Header Bar */}
          <div className="p-3 sm:p-4 border-b border-gray-800/80 bg-black/40">
            <div className="relative flex items-center">
              <Search className="w-5 h-5 text-cyan-400 absolute left-3.5 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search any global stock, ETF, or crypto (e.g. NVDA, TSLA, Apple, BTC)..."
                className="w-full pl-11 pr-24 py-3 bg-gray-900/80 border border-gray-800 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 rounded-xl text-sm text-white placeholder:text-gray-500 outline-none transition-all"
              />

              <div className="absolute right-3 flex items-center gap-1.5">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                ) : query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      fetchResults("");
                    }}
                    className="text-gray-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-900 border border-gray-800 rounded">
                    ESC
                  </kbd>
                )}
              </div>
            </div>

            {/* Quick Popular Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-3 pb-0.5 text-xs">
              <span className="text-gray-500 text-[11px] shrink-0 uppercase tracking-wider flex items-center gap-1 mr-1">
                <TrendingUp className="w-3 h-3 text-cyan-400" />
                <span>Trending:</span>
              </span>
              {POPULAR_TICKERS.map((t) => (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() => handleSelectTicker(t.symbol)}
                  className="shrink-0 px-2 py-1 rounded-lg bg-gray-900/80 hover:bg-cyan-950/60 border border-gray-800 hover:border-cyan-500/40 text-gray-300 hover:text-cyan-300 text-[11px] font-semibold transition-all active:scale-95"
                >
                  {t.symbol}
                </button>
              ))}
            </div>

            {/* Filter Category Tabs */}
            <div className="flex items-center gap-1 pt-2.5 border-t border-gray-900 mt-2 text-[11px]">
              {[
                { id: "ALL", label: "All Assets", icon: Compass },
                { id: "EQUITY", label: "Equities", icon: Building2 },
                { id: "ETF", label: "ETFs", icon: Layers },
                { id: "CRYPTO", label: "Crypto", icon: Coins },
              ].map((tab) => {
                const Icon = tab.icon;
                const isSelected = filterType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterType(tab.id)}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors ${
                      isSelected
                        ? "bg-cyan-500/15 border border-cyan-400/40 text-cyan-300"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            className="max-h-80 overflow-y-auto p-2 space-y-1 divide-y divide-gray-900/60 scrollbar-thin scrollbar-thumb-gray-800"
          >
            {filteredResults.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="text-gray-500 text-sm">
                  {isLoading
                    ? "Searching global market registries..."
                    : `No assets found for "${query}"`}
                </div>
                {query && (
                  <button
                    type="button"
                    onClick={() => handleSelectTicker(query)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 text-xs hover:bg-cyan-900/40"
                  >
                    <span>Analyze custom symbol &ldquo;{query.toUpperCase()}&rdquo;</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              filteredResults.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={`${item.symbol}-${index}`}
                    type="button"
                    onClick={() => handleSelectTicker(item.symbol)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all group ${
                      isSelected
                        ? "bg-cyan-950/40 border border-cyan-500/40 shadow-sm"
                        : "border border-transparent hover:bg-gray-900/60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                          isSelected
                            ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.4)]"
                            : "bg-gray-900 border-gray-800 text-gray-300"
                        }`}
                      >
                        {item.symbol.slice(0, 4)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-bold text-sm ${
                              isSelected ? "text-cyan-300" : "text-white"
                            }`}
                          >
                            {item.symbol}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800 text-gray-400">
                            {item.exchange}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              item.quoteType === "CRYPTOCURRENCY"
                                ? "bg-amber-950/60 border border-amber-800 text-amber-300"
                                : item.quoteType === "ETF"
                                ? "bg-purple-950/60 border border-purple-800 text-purple-300"
                                : "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                            }`}
                          >
                            {item.quoteType}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">
                          {item.name}
                          {item.industry && item.industry !== item.name && (
                            <span className="text-gray-600 ml-1.5">
                              • {item.industry}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span
                        className={`text-xs font-semibold hidden sm:flex items-center gap-1 ${
                          isSelected ? "text-cyan-400" : "text-gray-500 group-hover:text-gray-300"
                        }`}
                      >
                        <span>Launch Deck</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="p-3 bg-gray-950 border-t border-gray-900 flex items-center justify-between text-[11px] text-gray-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-900 border border-gray-800 rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-900 border border-gray-800 rounded">↓</kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-900 border border-gray-800 rounded">↵</kbd>
                <span>Select</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-cyan-400/80">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Live Yahoo Finance Integration</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
