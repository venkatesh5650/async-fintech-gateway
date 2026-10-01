import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getBackendBaseUrl(): string {
  const raw =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://fintech-api-gateway-m2yl.onrender.com";
  return raw.replace(/\/+$/, "");
}

export async function GET() {
  const backendUrl = getBackendBaseUrl();

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    const headers: Record<string, string> = {
      "X-N8N-API-KEY":
        process.env.N8N_API_KEY ||
        "super_secure_internal_orchestration_secret_key_2026",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${backendUrl}/v1/cloud/health/matrix`, {
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal BFF gateway error" },
      { status: 500 }
    );
  }
}
