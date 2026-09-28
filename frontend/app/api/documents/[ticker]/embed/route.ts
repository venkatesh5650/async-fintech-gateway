import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: documentId } = await params;
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
      `${backendUrl}/v1/documents/${encodeURIComponent(documentId)}/embed`,
      {
        method: "POST",
        headers,
        cache: "no-store",
      }
    );

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
      { error: "Document embedding pipeline unreachable." },
      { status: 503 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: documentId } = await params;
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
      `${backendUrl}/v1/documents/${encodeURIComponent(documentId)}/progress`,
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
      { error: "Embedding progress service unreachable." },
      { status: 503 }
    );
  }
}
