import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const query = searchParams.get("query");
  const topK = searchParams.get("top_k") || "5";
  const minSimilarity = searchParams.get("min_similarity") || "0.0";

  if (!ticker || !query) {
    return NextResponse.json(
      { error: "Both 'ticker' and 'query' query parameters are required." },
      { status: 400 }
    );
  }

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

    const targetUrl = new URL(`${backendUrl}/v1/documents/search`);
    targetUrl.searchParams.set("ticker", ticker);
    targetUrl.searchParams.set("query", query);
    targetUrl.searchParams.set("top_k", topK);
    targetUrl.searchParams.set("min_similarity", minSimilarity);

    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Backend returned ${response.status}: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Document semantic search service unreachable." },
      { status: 503 }
    );
  }
}
