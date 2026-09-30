import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

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
    const response = await fetch(`${backendUrl}/v1/system/openapi.json`, {
      method: "GET",
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (_err) {
    // Backend offline or unreachable: fall back to local public openapi.json
  }

  try {
    const localPath = path.join(process.cwd(), "public", "openapi.json");
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, "utf-8");
      return NextResponse.json(JSON.parse(content));
    }
  } catch (fsErr: any) {
    return NextResponse.json(
      { error: `Could not load OpenAPI specification: ${fsErr?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: "OpenAPI specification not available" },
    { status: 404 }
  );
}
