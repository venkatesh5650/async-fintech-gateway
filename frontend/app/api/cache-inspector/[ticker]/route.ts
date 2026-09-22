import { NextResponse } from "next/server";

type Context = { params: Promise<{ ticker: string }> };

export async function GET(_request: Request, context: Context) {
  const resolvedParams = await context.params;
  const ticker = resolvedParams.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker symbol required." }, { status: 400 });
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const response = await fetch(`${backendUrl}/v1/intelligence/cache-inspector/${ticker}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || `Cache inspector backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Cache inspector gateway unreachable" },
      { status: 503 }
    );
  }
}
