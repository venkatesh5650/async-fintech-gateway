import { NextResponse } from "next/server";

/**
 * BFF Proxy: Stream Health & Concurrency Telemetry
 *
 * Proxies live Redis Stream metrics (lag, PEL count, consumer pool, health status)
 * from the backend CQRS observability endpoint.
 */
export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const response = await fetch(`${backendUrl}/v1/intelligence/stream-health`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Stream health backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Stream health telemetry gateway unreachable" },
      { status: 503 }
    );
  }
}
