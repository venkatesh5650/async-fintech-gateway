import { NextResponse } from "next/server";

type Context = { params: Promise<{ ticker: string }> };

export async function POST(request: Request, context: Context) {
  const resolvedParams = await context.params;
  const ticker = resolvedParams.ticker;

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  try {
    const response = await fetch(
      `${backendUrl}/v1/intelligence/jobs/${ticker}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdHJpbmciLCJleHAiOjE3ODU3NDg5MDd9.39j5Eck67F1CaVC3OZGpooP9v_H97IIL_FpAEoydbfc`,
        },
      },
    );

    if (!response.ok) {
      // Extract detailed validation errors from the backend response payload
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = "Backend Gateway Error";

      if (errorData.detail) {
        errorMessage = Array.isArray(errorData.detail)
          ? errorData.detail[0].msg
          : errorData.detail;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to dispatch worker" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, context: Context) {
  const resolvedParams = await context.params;
  const jobId = resolvedParams.ticker;

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  try {
    const response = await fetch(
      `${backendUrl}/v1/intelligence/jobs/${jobId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdHJpbmciLCJleHAiOjE3ODU3NDg5MDd9.39j5Eck67F1CaVC3OZGpooP9v_H97IIL_FpAEoydbfc`,
        },
      },
    );

    if (!response.ok) {
      // Extract detailed validation errors from the backend response payload
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = "Backend Gateway Error";

      if (errorData.detail) {
        errorMessage = Array.isArray(errorData.detail)
          ? errorData.detail[0].msg
          : errorData.detail;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to poll worker" },
      { status: 500 },
    );
  }
}
