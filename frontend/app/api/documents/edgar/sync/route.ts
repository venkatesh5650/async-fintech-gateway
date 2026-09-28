import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
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

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      formData = new FormData();
    }

    const response = await fetch(`${backendUrl}/v1/documents/edgar/sync`, {
      method: "POST",
      headers,
      body: formData,
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
      { error: "SEC EDGAR synchronization service unreachable." },
      { status: 503 }
    );
  }
}
