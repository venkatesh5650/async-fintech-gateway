import { NextResponse } from "next/server";

/**
 * BFF Proxy: Live Job Audit Registry
 *
 * Routes client-side audit polls through this Route Handler to prevent
 * direct client exposure to backend topology.
 * CQRS public read endpoint.
 */
export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const response = await fetch(`${backendUrl}/v1/intelligence/audit`, {
      method: "GET",
      // Disable Next.js fetch cache — we always want the live Redis state
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Audit backend returned ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    // 503 signals the client to show a degraded state without crashing
    return NextResponse.json(
      { error: "Audit gateway unreachable" },
      { status: 503 },
    );
  }
}
