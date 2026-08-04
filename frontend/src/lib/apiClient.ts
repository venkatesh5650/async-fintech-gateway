// frontend/src/lib/apiClient.ts

import { cookies } from 'next/headers';
import { IntelligenceResponse } from "@/types/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchIntelligence(ticker: string): Promise<IntelligenceResponse> {
  try {
    // 1. The 1% Maneuver: Extract the secure HTTP-Only cookie server-side (Next.js 16 standard)
    const cookieStore = await cookies();
    const token = cookieStore.get("session_token")?.value;

    // 2. Build secure headers with dynamic Bearer token injection
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    };

    // 3. Execute request against the protected or backend route
    const response = await fetch(`${API_BASE_URL}/v1/intelligence/public/${ticker}`, {
      method: "GET", 
      headers,
      cache: "no-store", 
    });

    if (response.status === 401) {
      throw new Error("Session Expired: Cryptographic token invalid or missing.");
    }

    if (!response.ok) {
      throw new Error(`API Gateway Error: ${response.status} ${response.statusText}`);
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