import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type Context = { params: Promise<{ ticker: string }> };

export async function GET(request: Request, context: Context) {
  const resolvedParams = await context.params;
  const ticker = resolvedParams.ticker;

  const { searchParams } = new URL(request.url);
  const interval = searchParams.get("interval") || "5m";

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

    const response = await fetch(
      `${backendUrl}/v1/market-data/history/${ticker}?interval=${interval}`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = "Backend Gateway Error";

      if (errorData.detail) {
        errorMessage = Array.isArray(errorData.detail)
          ? errorData.detail[0].msg
          : errorData.detail;
      }

      const res = NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
      if (response.status === 401 || response.status === 403) {
        res.cookies.delete("session_token");
      }
      return res;
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch historical market data" },
      { status: 500 },
    );
  }
}
