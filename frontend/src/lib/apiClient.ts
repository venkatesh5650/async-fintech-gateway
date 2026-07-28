// frontend/src/lib/apiClient.ts

/**
 * API Client Bridge Module
 * ------------------------
 * Manages communication between the Next.js frontend presentation layer
 * and the backend FastAPI microservice gateway, ensuring type-safe contract validation.
 */

import { IntelligenceResponse } from "@/types/api";

// Resolve API base URL from runtime environment variables with a local development fallback
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Secure Server-Side Bridge to fetch FinTech Intelligence payloads.
 * Enforces strict typing against the IntelligenceResponse contract.
 * * @param ticker - Target equity or asset symbol (e.g., AAPL, TSLA)
 * @returns A promise resolving to the strongly-typed IntelligenceResponse payload
 */
export async function fetchIntelligence(ticker: string): Promise<IntelligenceResponse> {
  try {
    // Ensure it targets the public query path, NOT the protected jobs path
    const response = await fetch(`${API_BASE_URL}/v1/intelligence/public/${ticker}`, {
      method: "GET", // Must be GET
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store", 
    });

    // Validate network response status
    if (!response.ok) {
      throw new Error(`API Gateway Error: ${response.status} ${response.statusText}`);
    }

    // Parse and return the resolved JSON data contract
    const data: IntelligenceResponse = await response.json();
    return data;
  } catch (error) {
    // Catch connection timeouts or gateway failures and return a safe fallback structure
    console.error("Failed to fetch intelligence payload:", error);
    return {
      ticker: ticker.toUpperCase(),
      signal: "INVALID",
      reasoning: "Gateway connection failed or timed out.",
      execution_time_ms: 0,
    };
  }
}