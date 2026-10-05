import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const targetUrl = `${backendBaseUrl}/${path.join("/")}`;
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
      
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const res = await fetch(targetUrl, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
    
    return NextResponse.json({ error: "Unsupported Media Type" }, { status: 415 });
  } catch (error: any) {
    console.error("Backend Proxy Error:", error);
    return NextResponse.json({ error: "Backend unreachable or proxy failed" }, { status: 502 });
  }
}
