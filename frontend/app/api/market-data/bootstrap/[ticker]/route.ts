import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ ticker: string }> };

function getBackendBaseUrl(): string {
  const raw =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";
  return raw.replace(/\/+$/, "");
}

export async function POST(request: Request, context: Context) {
  const resolvedParams = await context.params;
  const ticker = resolvedParams.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker parameter" }, { status: 400 });
  }

  const backendUrl = getBackendBaseUrl();

  try {
    const response = await fetch(`${backendUrl}/v1/market-data/bootstrap/${ticker}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    return NextResponse.json(
      { status: "fallback_initiated", ticker, message: err.message },
      { status: 200 }
    );
  }
}
