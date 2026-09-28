import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(
      `${backendUrl}/v1/intelligence/rag-context/${encodeURIComponent(ticker)}`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "RAG context service unreachable." },
      { status: 503 }
    );
  }
}
