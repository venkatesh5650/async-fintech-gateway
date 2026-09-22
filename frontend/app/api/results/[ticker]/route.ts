import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type Context = { params: Promise<{ ticker: string }> };

export async function GET(request: Request, context: Context) {
  const resolvedParams = await context.params;
  const ticker = resolvedParams.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker symbol required." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const targetUrl = `${backendUrl}/v1/intelligence/results/${ticker}${refresh ? "?refresh=true" : ""}`;
    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || `Backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Cache-Aside result gateway unreachable" },
      { status: 503 }
    );
  }
}
