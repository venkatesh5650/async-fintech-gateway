// frontend/src/lib/apiClient.ts

import { cookies } from "next/headers";
import { IntelligenceResponse, SystemAuditResponse } from "@/types/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchIntelligence(
  ticker: string,
): Promise<IntelligenceResponse> {
  try {
    // Extract secure HTTP-only session token from cookie store server-side
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    // Attach Bearer token authorization header
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // Forward request to backend intelligence service
    const response = await fetch(
      `${API_BASE_URL}/v1/intelligence/public/${ticker}`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
    );

    if (response.status === 401) {
      throw new Error(
        "Session Expired: Cryptographic token invalid or missing.",
      );
    }

    if (!response.ok) {
      throw new Error(
        `API Gateway Error: ${response.status} ${response.statusText}`,
      );
    }

    const data: IntelligenceResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch intelligence payload:", error);
    return {
      ticker: ticker.toUpperCase(),
      signal: "INVALID",
      reasoning: "Gateway connection failed, timed out, or session expired.",
      execution_time_ms: 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Job Audit Registry — CQRS Read Client
// ─────────────────────────────────────────────────────────────────────────────
// Routes through the Next.js BFF proxy (/api/audit) rather than calling
// the backend directly, keeping the backend URL out of client-side bundles.
// No authentication header required — public CQRS read endpoint.
export async function fetchJobAudit(): Promise<SystemAuditResponse> {
  const EMPTY_STATE: SystemAuditResponse = {
    total_active_jobs: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    jobs: [],
    audit_timestamp_ms: Date.now(),
  };

  try {
    const response = await fetch("/api/audit", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[AUDIT] BFF proxy returned ${response.status}`);
      return EMPTY_STATE;
    }

    return (await response.json()) as SystemAuditResponse;
  } catch (error) {
    console.error("[AUDIT] Failed to fetch live job audit registry:", error);
    return EMPTY_STATE;
  }
}


