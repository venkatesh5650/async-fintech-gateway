"use client";

import React, { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, Time, CandlestickSeries, HistogramSeries, AreaSeries } from "lightweight-charts";

interface ChartDataPoint {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface MarketChartProps {
  ticker: string;
  data: ChartDataPoint[];
}

export default function MarketChart({ ticker, data }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  // Track series instances using refs so we can reference them across render cycles
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Default to Area Line chart since ingest contains tick-by-tick single prices (flat candles)
  const [chartType, setChartType] = useState<"area" | "candlestick">("area");

  // 1. Initialize Chart Canvas & Volume Histogram (Always present)
  useEffect(() => {
    if (!containerRef.current) return;

    // Create the lightweight chart instance
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#000000" },
        textColor: "#9ca3af", // Tailwind gray-400
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      grid: {
        vertLines: { color: "#111827" }, // Tailwind gray-900 / dark grid line
        horzLines: { color: "#111827" },
      },
      crosshair: {
        mode: 1, // Magnet mode
        vertLine: {
          color: "#374151", // gray-700
          style: 1, // Dashed
          labelBackgroundColor: "#1f2937",
        },
        horzLine: {
          color: "#374151",
          style: 1,
          labelBackgroundColor: "#1f2937",
        },
      },
      timeScale: {
        borderColor: "#1f2937",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#1f2937",
      },
      width: containerRef.current.clientWidth || 600,
      height: 380,
    });

    // Add Volume Series (Histogram) - always kept on screen overlay
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#3b82f6", // Tailwind blue-500
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "", // overlay scale
    });

    // Configure overlay scale for volume (position it at the bottom 25% of the chart)
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.75,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    volumeSeriesRef.current = volumeSeries;

    // Handle Responsive Resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.resize(containerRef.current.clientWidth, 380);
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // 2. Synchronize Data and Series Type
  useEffect(() => {
    if (!chartRef.current || !volumeSeriesRef.current || !data) return;

    // Deduplicate and sort data to prevent lightweight-charts sorting errors
    const sortedData = [...data].sort((a, b) => a.time - b.time);
    
    const uniqueData: ChartDataPoint[] = [];
    const seenTimes = new Set<number>();
    
    for (const point of sortedData) {
      if (!seenTimes.has(point.time)) {
        seenTimes.add(point.time);
        uniqueData.push(point);
      }
    }

    // A. Remove previous series to prevent double overlay
    if (candlestickSeriesRef.current) {
      chartRef.current.removeSeries(candlestickSeriesRef.current);
      candlestickSeriesRef.current = null;
    }
    if (areaSeriesRef.current) {
      chartRef.current.removeSeries(areaSeriesRef.current);
      areaSeriesRef.current = null;
    }

    // B. Build the active series type and assign data
    if (chartType === "candlestick") {
      const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
        upColor: "#22c55e", // Tailwind green-500
        downColor: "#ef4444", // Tailwind red-500
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      candlestickSeries.setData(uniqueData.map(p => ({
        time: p.time as Time,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      })));
      
      candlestickSeriesRef.current = candlestickSeries;
    } else {
      const areaSeries = chartRef.current.addSeries(AreaSeries, {
        lineColor: "#22c55e", // Glowing green line
        topColor: "rgba(34, 197, 94, 0.25)", // Green gradient top
        bottomColor: "rgba(34, 197, 94, 0.0)", // Gradient fade bottom
        lineWidth: 2,
        priceLineVisible: true,
      });

      areaSeries.setData(uniqueData.map(p => ({
        time: p.time as Time,
        value: p.close,
      })));

      areaSeriesRef.current = areaSeries;
    }

    // C. Set volume histogram data
    volumeSeriesRef.current.setData(uniqueData.map(p => ({
      time: p.time as Time,
      value: p.volume || 0,
      color: p.close >= p.open ? "#22c55e20" : "#ef444420",
    })));

    // Fit content
    if (uniqueData.length > 0 && chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data, chartType]);

  return (
    <div className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl p-5 shadow-2xl font-mono text-left space-y-4 mb-6">
      {/* Header telemetry info */}
      <div className="flex justify-between items-center border-b border-gray-800 pb-3">
        <div className="flex items-center space-x-3">
          <span className="text-white text-lg font-bold tracking-wider">{ticker}</span>
          <span className="text-gray-400 text-[10px] px-2 py-0.5 rounded border border-gray-800 bg-black/50 tracking-wider uppercase">
            {chartType} View
          </span>
        </div>
        
        {/* Toggle Switch Controls */}
        <div className="flex items-center space-x-4">
          <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartType("area")}
              className={`px-3 py-1 rounded-md text-[10px] font-semibold transition ${
                chartType === "area"
                  ? "bg-green-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Area Line
            </button>
            <button
              type="button"
              onClick={() => setChartType("candlestick")}
              className={`px-3 py-1 rounded-md text-[10px] font-semibold transition ${
                chartType === "candlestick"
                  ? "bg-green-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Candlesticks
            </button>
          </div>

          <div className="text-[10px] text-gray-500 uppercase tracking-widest hidden sm:flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)] animate-pulse" />
            <span>Interactive Canvas Stream</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas mount point */}
      <div ref={containerRef} className="w-full h-[380px] bg-black rounded-lg overflow-hidden relative" />
      
      {/* Chart Footer legend */}
      <div className="flex flex-col sm:flex-row justify-between text-[10px] text-gray-500 border-t border-gray-800 pt-2.5 gap-2">
        <div>
          <span>Drag to pan | Scroll to zoom | Double click to reset scale</span>
        </div>
        <div className="flex space-x-4">
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 rounded bg-green-500/20 border border-green-500/50 mr-1.5" />
            Bullish Ingestion
          </span>
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 rounded bg-red-500/20 border border-red-500/50 mr-1.5" />
            Bearish Ingestion
          </span>
        </div>
      </div>
    </div>
  );
}
