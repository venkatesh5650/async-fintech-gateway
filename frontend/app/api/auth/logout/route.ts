import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Session destroyed." });
  response.cookies.delete("session_token");
  return response;
}
