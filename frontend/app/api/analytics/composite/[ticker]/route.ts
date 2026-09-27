import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
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

    const response = await fetch(
      `${backendUrl}/v1/analytics/composite/${encodeURIComponent(ticker)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const res = NextResponse.json(
        { error: `Composite analytics backend returned ${response.status}` },
        { status: response.status }
      );
      if (response.status === 401 || response.status === 403) {
        res.cookies.delete("session_token");
      }
      return res;
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Composite analytics service unreachable." },
      { status: 503 }
    );
  }
}
