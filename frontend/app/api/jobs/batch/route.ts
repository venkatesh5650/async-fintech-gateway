import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BatchAnalysisRequest } from "@/types/api";

export async function POST(request: Request) {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Session missing or expired." },
        { status: 401 }
      );
    }

    const body: BatchAnalysisRequest = await request.json().catch(() => ({ tickers: [] }));

    const response = await fetch(`${backendUrl}/v1/intelligence/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = "Backend Gateway Error";

      if (errorData.detail) {
        errorMessage = Array.isArray(errorData.detail)
          ? errorData.detail[0].msg
          : errorData.detail;
      } else if (errorData.error_type === "DataFirewallViolation") {
        errorMessage = "Data Firewall Violation: Invalid or malformed ticker array.";
      }

      return NextResponse.json(
        { error: errorMessage, details: errorData.details || undefined },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 202 });
  } catch (error) {
    console.error("Batch Dispatch Gateway Error:", error);
    return NextResponse.json(
      { error: "Failed to dispatch batch worker. Check backend gateway connection." },
      { status: 500 }
    );
  }
}
