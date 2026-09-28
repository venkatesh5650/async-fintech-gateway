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

    const incomingFormData = await request.formData();

    const forwardHeaders: Record<string, string> = {};
    if (token) {
      forwardHeaders["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${backendUrl}/v1/documents/ingest`, {
      method: "POST",
      headers: forwardHeaders,
      body: incomingFormData,
    });

    if (!response.ok) {
      let errorMsg = `Document ingestion failed (HTTP ${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson.detail) errorMsg = errJson.detail;
      } catch {
        // Fall back to default error text
      }
      return NextResponse.json({ error: errorMsg }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    const isNetworkError =
      error?.code === "ECONNREFUSED" ||
      error?.cause?.code === "ECONNREFUSED" ||
      (error instanceof TypeError && error.message.includes("fetch failed"));

    return NextResponse.json(
      {
        error: isNetworkError
          ? "Document processing service unreachable. Please ensure the backend is running."
          : "Internal Ingestion Gateway Error",
      },
      { status: isNetworkError ? 503 : 500 }
    );
  }
}
