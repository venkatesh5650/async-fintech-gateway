import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSessionCookie } from "@/lib/sessionCookie";

export async function POST() {
  const cookieStore = await cookies();
  clearSessionCookie(cookieStore);

  const response = NextResponse.json(
    { success: true, message: "Session destroyed." },
    { headers: { "Cache-Control": "no-store" } }
  );
  clearSessionCookie(response.cookies);
  return response;
}
