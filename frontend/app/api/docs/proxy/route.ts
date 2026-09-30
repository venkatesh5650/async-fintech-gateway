import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getBackendBaseUrl(): string {
  const raw =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";
  return raw.replace(/\/+$/, "");
}

async function forwardRequest(request: NextRequest, method: string) {
  const backendUrl = getBackendBaseUrl();
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("path");

  if (!targetPath) {
    return NextResponse.json(
      { error: "Missing required query parameter: 'path'" },
      { status: 400 }
    );
  }

  // Ensure path starts with /
  const sanitizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  const fullTargetUrl = `${backendUrl}${sanitizedPath}`;

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

    const contentType = request.headers.get("content-type");
    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    const t0 = performance.now();

    const fetchOptions: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };

    if (method !== "GET" && method !== "HEAD") {
      try {
        const bodyText = await request.text();
        if (bodyText) {
          fetchOptions.body = bodyText;
        }
      } catch {
        // Body reading failed or empty
      }
    }

    const backendResponse = await fetch(fullTargetUrl, fetchOptions);
    const t1 = performance.now();
    const latencyMs = Math.round(t1 - t0);

    const responseContentType = backendResponse.headers.get("content-type") || "";
    let responseData: any = null;

    if (responseContentType.includes("application/json")) {
      try {
        responseData = await backendResponse.json();
      } catch {
        responseData = await backendResponse.text();
      }
    } else {
      responseData = await backendResponse.text();
    }

    return NextResponse.json({
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      latencyMs,
      targetUrl: sanitizedPath,
      data: responseData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal BFF Gateway error";
    return NextResponse.json(
      {
        status: 503,
        error: `Could not connect to backend service at ${backendUrl}: ${message}`,
      },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest) {
  return forwardRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return forwardRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return forwardRequest(request, "PUT");
}

export async function DELETE(request: NextRequest) {
  return forwardRequest(request, "DELETE");
}
