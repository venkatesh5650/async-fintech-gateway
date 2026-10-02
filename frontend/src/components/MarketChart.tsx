"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickSeries,
  HistogramSeries,
  AreaSeries,
  CrosshairMode,
} from "lightweight-charts";
import { useSoundFX } from "@/hooks/useSoundFX";

export interface ChartDataPoint {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

interface MarketChartProps {
  ticker: string;
  data: ChartDataPoint[];
  selectedTimeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
}

interface HoverLegendData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timeStr: string;
}

export default function MarketChart({
  ticker,
  data,
  selectedTimeframe = "5m",
  onTimeframeChange,
}: MarketChartProps) {
  const { playClick, playBlip } = useSoundFX();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Track series instances using refs
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Track state for incremental updates vs full reload
  const previousTickerRef = useRef<string>(ticker);
  const previousTimeframeRef = useRef<Timeframe>(selectedTimeframe);
  const previousChartTypeRef = useRef<"candlestick" | "area">("candlestick");
  const previousDataLengthRef = useRef<number>(0);

  // Active chart type state
  const [chartType, setChartType] = useState<"candlestick" | "area">("candlestick");

  // Hovered or latest OHLCV legend data for top-left overlay
  const [legendData, setLegendData] = useState<HoverLegendData | null>(null);

  // Sort and deduplicate dataset
  const cleanData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sorted = [...data].sort((a, b) => a.time - b.time);
    const unique: ChartDataPoint[] = [];
    const seenTimes = new Set<number>();

    for (const p of sorted) {
      if (!seenTimes.has(p.time) && p.open > 0 && p.close > 0) {
        seenTimes.add(p.time);
        unique.push(p);
      }
    }
    return unique;
  }, [data]);

  // Overall session change telemetry (first candle vs last candle)
  const priceTelemetry = useMemo(() => {
    if (cleanData.length === 0) return { current: 0, change: 0, changePercent: 0, isUp: true };
    const first = cleanData[0].open || cleanData[0].close;
    const last = cleanData[cleanData.length - 1].close;
    const diff = last - first;
    const percent = first > 0 ? (diff / first) * 100 : 0;
    return {
      current: last,
      change: diff,
      changePercent: percent,
      isUp: diff >= 0,
    };
  }, [cleanData]);

  // Initialize TradingView-styled Lightweight Chart Instance
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0d1117" },
        textColor: "#8b949e",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      grid: {
        vertLines: { color: "#161b22" },
        horzLines: { color: "#161b22" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#30363d",
          width: 1,
          style: 3, // Dashed
          labelBackgroundColor: "#21262d",
        },
        horzLine: {
          color: "#30363d",
          width: 1,
          style: 3,
          labelBackgroundColor: "#21262d",
        },
      },
      timeScale: {
        borderColor: "#21262d",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      rightPriceScale: {
        borderColor: "#21262d",
        alignLabels: true,
        autoScale: true,
      },
      width: containerRef.current.clientWidth || 600,
      height: 420,
    });

    // Add Volume Histogram Series with overlay margins
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair listener for TradingView-style top-left OHLCV tooltip legend
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
        if (cleanData.length > 0) {
          const last = cleanData[cleanData.length - 1];
          const diff = last.close - last.open;
          const pct = last.open > 0 ? (diff / last.open) * 100 : 0;
          const dt = new Date(last.time * 1000);
          setLegendData({
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume || 0,
            change: diff,
            changePercent: pct,
            timeStr: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
        }
        return;
      }

      const candleData = candlestickSeriesRef.current
        ? (param.seriesData.get(candlestickSeriesRef.current) as any)
        : null;
      const areaData = areaSeriesRef.current
        ? (param.seriesData.get(areaSeriesRef.current) as any)
        : null;
      const volData = param.seriesData.get(volumeSeries) as any;

      if (candleData) {
        const diff = candleData.close - candleData.open;
        const pct = candleData.open > 0 ? (diff / candleData.open) * 100 : 0;
        const dt = new Date((param.time as number) * 1000);
        setLegendData({
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value || 0,
          change: diff,
          changePercent: pct,
          timeStr: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      } else if (areaData) {
        const dt = new Date((param.time as number) * 1000);
        setLegendData({
          open: areaData.value,
          high: areaData.value,
          low: areaData.value,
          close: areaData.value,
          volume: volData?.value || 0,
          change: 0,
          changePercent: 0,
          timeStr: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      if (width > 0 && chartRef.current) {
        chartRef.current.resize(width, 420);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Synchronize Pricing Data & Update Chart (Incremental vs Full Reload)
  useEffect(() => {
    if (!chartRef.current || !volumeSeriesRef.current || cleanData.length === 0) return;

    const isTickerChanged = previousTickerRef.current !== ticker;
    const isTimeframeChanged = previousTimeframeRef.current !== selectedTimeframe;
    const isChartTypeChanged = previousChartTypeRef.current !== chartType;
    const isFullReload =
      isTickerChanged ||
      isTimeframeChanged ||
      isChartTypeChanged ||
      previousDataLengthRef.current === 0;

    previousTickerRef.current = ticker;
    previousTimeframeRef.current = selectedTimeframe;
    previousChartTypeRef.current = chartType;
    previousDataLengthRef.current = cleanData.length;

    // Full Series Re-mount on chart style change, ticker change, or timeframe change
    if (isFullReload || (!candlestickSeriesRef.current && !areaSeriesRef.current)) {
      if (candlestickSeriesRef.current) {
        chartRef.current.removeSeries(candlestickSeriesRef.current);
        candlestickSeriesRef.current = null;
      }
      if (areaSeriesRef.current) {
        chartRef.current.removeSeries(areaSeriesRef.current);
        areaSeriesRef.current = null;
      }

      if (chartType === "candlestick") {
        const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
          upColor: "#26a69a",
          downColor: "#ef5350",
          borderVisible: false,
          wickUpColor: "#26a69a",
          wickDownColor: "#ef5350",
        });

        candlestickSeries.setData(
          cleanData.map((p) => ({
            time: p.time as Time,
            open: p.open,
            high: p.high,
            low: p.low,
            close: p.close,
          }))
        );

        candlestickSeriesRef.current = candlestickSeries;
      } else {
        const areaSeries = chartRef.current.addSeries(AreaSeries, {
          lineColor: "#2962ff",
          topColor: "rgba(41, 98, 255, 0.28)",
          bottomColor: "rgba(41, 98, 255, 0.0)",
          lineWidth: 2,
          priceLineVisible: true,
        });

        areaSeries.setData(
          cleanData.map((p) => ({
            time: p.time as Time,
            value: p.close,
          }))
        );

        areaSeriesRef.current = areaSeries;
      }

      volumeSeriesRef.current.setData(
        cleanData.map((p) => ({
          time: p.time as Time,
          value: p.volume || 0,
          color: p.close >= p.open ? "rgba(38, 166, 154, 0.35)" : "rgba(239, 83, 80, 0.35)",
        }))
      );

      // Only fit content on initial reload to prevent resetting user pan/zoom
      requestAnimationFrame(() => {
        if (chartRef.current && cleanData.length > 0) {
          chartRef.current.timeScale().fitContent();
        }
      });
    } else {
      // Incremental WebSocket tick update — preserves user scroll/zoom with try-catch safety
      const lastPoint = cleanData[cleanData.length - 1];

      try {
        if (chartType === "candlestick" && candlestickSeriesRef.current) {
          candlestickSeriesRef.current.update({
            time: lastPoint.time as Time,
            open: lastPoint.open,
            high: lastPoint.high,
            low: lastPoint.low,
            close: lastPoint.close,
          });
        } else if (chartType === "area" && areaSeriesRef.current) {
          areaSeriesRef.current.update({
            time: lastPoint.time as Time,
            value: lastPoint.close,
          });
        }

        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: lastPoint.time as Time,
            value: lastPoint.volume || 0,
            color: lastPoint.close >= lastPoint.open ? "rgba(38, 166, 154, 0.35)" : "rgba(239, 83, 80, 0.35)",
          });
        }
      } catch (err) {
        // Fail-safe fallback if timestamp is out of order or older than series head
        if (chartType === "candlestick" && candlestickSeriesRef.current) {
          candlestickSeriesRef.current.setData(
            cleanData.map((p) => ({
              time: p.time as Time,
              open: p.open,
              high: p.high,
              low: p.low,
              close: p.close,
            }))
          );
        } else if (chartType === "area" && areaSeriesRef.current) {
          areaSeriesRef.current.setData(
            cleanData.map((p) => ({
              time: p.time as Time,
              value: p.close,
            }))
          );
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            cleanData.map((p) => ({
              time: p.time as Time,
              value: p.volume || 0,
              color: p.close >= p.open ? "rgba(38, 166, 154, 0.35)" : "rgba(239, 83, 80, 0.35)",
            }))
          );
        }
      }
    }

    // Default legend baseline to latest point
    const last = cleanData[cleanData.length - 1];
    const diff = last.close - last.open;
    const pct = last.open > 0 ? (diff / last.open) * 100 : 0;
    const dt = new Date(last.time * 1000);
    setLegendData({
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume || 0,
      change: diff,
      changePercent: pct,
      timeStr: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  }, [cleanData, chartType, ticker, selectedTimeframe]);

  const timeframes: { label: string; value: Timeframe }[] = [
    { label: "5m", value: "5m" },
    { label: "15m", value: "15m" },
    { label: "1H", value: "1h" },
    { label: "4H", value: "4h" },
    { label: "1D", value: "1d" },
  ];

  const formatNum = (val?: number) => (val !== undefined ? val.toFixed(2) : "0.00");
  const formatVol = (val?: number) => {
    if (!val) return "0";
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    return val.toString();
  };

  return (
    <div className="w-full hud-panel corner-reticle rounded-2xl p-4 sm:p-5 shadow-2xl font-mono text-left space-y-3 mb-6 border border-cyan-500/25">
      {/* TradingView Top Control Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-cyan-500/20 pb-3 gap-3">
        {/* Ticker & Price Telemetry Badge */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-1">
          <span className="text-white text-xl font-extrabold tracking-tight">{ticker}</span>
          {priceTelemetry.current > 0 && (
            <div className="flex items-center space-x-2 bg-slate-900/80 px-2.5 py-1 rounded-md border border-cyan-500/30">
              <span className="text-white text-sm font-semibold">${formatNum(priceTelemetry.current)}</span>
              <span
                className={`text-xs font-bold ${
                  priceTelemetry.isUp ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {priceTelemetry.isUp ? "+" : ""}
                {formatNum(priceTelemetry.change)} ({priceTelemetry.isUp ? "+" : ""}
                {formatNum(priceTelemetry.changePercent)}%)
              </span>
            </div>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Timeframe Selector Pills */}
          <div className="flex bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                type="button"
                onClick={() => {
                  playClick();
                  onTimeframeChange?.(tf.value);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                  selectedTimeframe === tf.value
                    ? "bg-cyan-500 text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Chart Style Toggle */}
          <div className="flex bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                playBlip();
                setChartType("candlestick");
              }}
              className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1.5 transition ${
                chartType === "candlestick"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>🕯️</span>
              <span>Candles</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playBlip();
                setChartType("area");
              }}
              className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1.5 transition ${
                chartType === "area"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>📈</span>
              <span>Area</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area with Floating TradingView Top-Left Legend */}
      <div className="relative w-full bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800/80">
        {/* Floating TradingView Top-Left Crosshair OHLCV Tooltip Overlay */}
        {legendData && (
          <div className="absolute top-3 left-3 z-10 pointer-events-none bg-[#161b22]/90 backdrop-blur-md border border-[#30363d] px-3 py-1.5 rounded-lg text-xs space-x-3 flex items-center shadow-lg font-mono">
            <span className="text-[#8b949e]">{legendData.timeStr}</span>
            <span className="text-[#8b949e]">
              O: <strong className="text-white">${formatNum(legendData.open)}</strong>
            </span>
            <span className="text-[#8b949e]">
              H: <strong className="text-[#26a69a]">${formatNum(legendData.high)}</strong>
            </span>
            <span className="text-[#8b949e]">
              L: <strong className="text-[#ef5350]">${formatNum(legendData.low)}</strong>
            </span>
            <span className="text-[#8b949e]">
              C: <strong className="text-white">${formatNum(legendData.close)}</strong>
            </span>
            <span className="text-[#8b949e]">
              V: <strong className="text-blue-400">{formatVol(legendData.volume)}</strong>
            </span>
          </div>
        )}

        {/* Chart Canvas Mount Point */}
        <div ref={containerRef} className="w-full h-[420px]" />
      </div>

      {/* Chart Footer Telemetry Legend */}
      <div className="flex flex-col sm:flex-row justify-between text-[10px] text-[#8b949e] border-t border-[#21262d] pt-2 gap-2">
        <div>
          <span>Drag to pan | Scroll to zoom | Double click canvas to reset scale</span>
        </div>
        <div className="flex space-x-4">
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 rounded bg-[#26a69a]/30 border border-[#26a69a] mr-1.5" />
            Bullish Bar
          </span>
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 rounded bg-[#ef5350]/30 border border-[#ef5350] mr-1.5" />
            Bearish Bar
          </span>
        </div>
      </div>
    </div>
  );
}
