import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type Context = { params: Promise<{ traceId: string }> };

/**
 * BFF Proxy: Distributed Trace Waterfall
 *
 * Fetches the end-to-end distributed span execution lifecycle for a given trace_id.
 */
export async function GET(request: Request, context: Context) {
  const { traceId } = await context.params;
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Session missing or expired." },
        { status: 401 }
      );
    }

    const response = await fetch(
      `${backendUrl}/v1/intelligence/trace/${traceId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        cookieStore.delete("session_token");
      }
      return NextResponse.json(
        { error: `Trace query returned status ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Trace telemetry gateway unreachable" },
      { status: 503 }
    );
  }
}
