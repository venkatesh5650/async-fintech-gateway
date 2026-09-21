import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * BFF Proxy: Dead-Letter Queue (DLQ) Registry
 *
 * Proxies client requests to the backend CQRS DLQ endpoint with bearer token authentication.
 * Masks internal network topology and centralizes session lifecycle enforcement.
 */
export async function GET(request: Request) {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const { searchParams } = new URL(request.url);
  const count = searchParams.get("count") || "50";

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
      `${backendUrl}/v1/intelligence/dlq?count=${count}`,
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
        { error: `DLQ backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "DLQ gateway unreachable" },
      { status: 503 }
    );
  }
}
