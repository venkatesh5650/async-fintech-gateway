import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getBackendBaseUrl(): string {
  const raw =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://fintech-api-gateway-m2yl.onrender.com";
  return raw.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const backendUrl = getBackendBaseUrl();
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get("ticker") || "AAPL";
  const scenario = searchParams.get("scenario") || "NOMINAL";
  const delayMs = searchParams.get("delay_ms") || "80";

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    const headers: Record<string, string> = {
      "X-N8N-API-KEY":
        process.env.N8N_API_KEY ||
        "super_secure_internal_orchestration_secret_key_2026",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const targetUrl = `${backendUrl}/v1/cloud/graph/stream?ticker=${encodeURIComponent(
      ticker
    )}&scenario=${encodeURIComponent(scenario)}&delay_ms=${encodeURIComponent(
      delayMs
    )}`;

    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Backend stream returned ${response.status}: ${errText}` },
        { status: response.status }
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to establish real-time SSE stream from gateway backend",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
