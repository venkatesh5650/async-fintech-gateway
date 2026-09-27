import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get("symbols");
  const days = searchParams.get("days") || "30";

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

    const queryUrl = new URL(`${backendUrl}/v1/analytics/correlation`);
    if (symbols) queryUrl.searchParams.set("symbols", symbols);
    if (days) queryUrl.searchParams.set("days", days);

    const response = await fetch(queryUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const res = NextResponse.json(
        { error: `Correlation analytics backend returned ${response.status}` },
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
      { error: "Correlation analytics service unreachable." },
      { status: 503 }
    );
  }
}
