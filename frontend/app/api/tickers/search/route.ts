import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
  industry?: string;
  score?: number;
}

// Curated institutional trending tickers as instant fallback & default suggestions
const TRENDING_TICKERS: TickerSearchResult[] = [
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", quoteType: "EQUITY", industry: "Semiconductors" },
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", quoteType: "EQUITY", industry: "Consumer Electronics" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", quoteType: "EQUITY", industry: "Software Infrastructure" },
  { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", quoteType: "EQUITY", industry: "Auto Manufacturers" },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", quoteType: "EQUITY", industry: "Internet Content" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", quoteType: "EQUITY", industry: "E-Commerce" },
  { symbol: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", quoteType: "EQUITY", industry: "Social Media" },
  { symbol: "BTC-USD", name: "Bitcoin USD", exchange: "CCC", quoteType: "CRYPTOCURRENCY", industry: "Digital Asset" },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  // If no query is provided, return popular trending assets immediately
  if (!q || q.length === 0) {
    return NextResponse.json({
      query: "",
      count: TRENDING_TICKERS.length,
      results: TRENDING_TICKERS,
      source: "curated_trending",
    });
  }

  try {
    const encoded = encodeURIComponent(q);
    const yahooUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=10&newsCount=0&enableFuzzyQuery=true`;

    const res = await fetch(yahooUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      // Fallback: filter local curated list if external provider is throttling
      const localMatches = TRENDING_TICKERS.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q.toLowerCase()) ||
          t.name.toLowerCase().includes(q.toLowerCase())
      );
      return NextResponse.json({
        query: q,
        count: localMatches.length,
        results: localMatches,
        source: "fallback_local",
      });
    }

    const data = await res.json();
    const rawQuotes: any[] = data.quotes || [];

    const allowedTypes = new Set(["EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX", "MUTUALFUND"]);

    const results: TickerSearchResult[] = rawQuotes
      .filter((item) => {
        if (!item.symbol) return false;
        if (item.quoteType && !allowedTypes.has(item.quoteType.toUpperCase())) return false;
        return true;
      })
      .map((item) => ({
        symbol: String(item.symbol).toUpperCase(),
        name: String(item.shortname || item.longname || item.name || item.symbol),
        exchange: String(item.exchange || item.exchDisp || "GLOBAL"),
        quoteType: String(item.quoteType || "EQUITY").toUpperCase(),
        industry: item.industry || item.sector || item.typeDisp || "Market Asset",
        score: item.score || 0,
      }));

    // If Yahoo returned 0 quotes, check if query looks like a valid symbol and provide as direct option
    if (results.length === 0 && /^[A-Z0-9.-]{1,12}$/i.test(q)) {
      results.push({
        symbol: q.toUpperCase(),
        name: `${q.toUpperCase()} Asset`,
        exchange: "GLOBAL",
        quoteType: "EQUITY",
        industry: "Direct Symbol Lookup",
      });
    }

    return NextResponse.json({
      query: q,
      count: results.length,
      results,
      source: "yahoo_finance_live",
    });
  } catch (err: any) {
    const localMatches = TRENDING_TICKERS.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q.toLowerCase()) ||
        t.name.toLowerCase().includes(q.toLowerCase())
    );

    return NextResponse.json({
      query: q,
      count: localMatches.length,
      results: localMatches.length > 0 ? localMatches : [
        {
          symbol: q.toUpperCase(),
          name: `${q.toUpperCase()} Asset`,
          exchange: "GLOBAL",
          quoteType: "EQUITY",
          industry: "Direct Symbol Lookup",
        },
      ],
      source: "exception_fallback",
    });
  }
}
