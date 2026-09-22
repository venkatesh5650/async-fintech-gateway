import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type Context = { params: Promise<{ ticker: string }> };

export async function POST(_request: Request, context: Context) {
  const resolvedParams = await context.params;
  const ticker = resolvedParams.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker symbol required." }, { status: 400 });
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": process.env.N8N_API_KEY || "super_secure_internal_orchestration_secret_key__2026",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${backendUrl}/v1/intelligence/cache/invalidate/${ticker}`, {
      method: "POST",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || `Cache eviction returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Cache eviction gateway unreachable" },
      { status: 503 }
    );
  }
}
