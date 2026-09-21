import { NextResponse } from "next/server";

/**
 * BFF Proxy: LLM Circuit Breaker & Upstream Rate-Limit Telemetry
 *
 * Proxies live circuit state, cooldown timers, strike counters, and failure
 * diagnostics from the backend CQRS observability endpoint.
 */
export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const response = await fetch(`${backendUrl}/v1/intelligence/circuit-breaker`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Circuit breaker backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Circuit breaker telemetry gateway unreachable" },
      { status: 503 }
    );
  }
}
