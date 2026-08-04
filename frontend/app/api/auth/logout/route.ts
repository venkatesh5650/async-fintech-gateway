import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  // 1. Acess the secure cookie store
  const cookieStore = await cookies();

  // 2. Mathematically destroy the session envelope
  cookieStore.delete("session_token");

  // 3. Return a successful 200 OK signal
  return NextResponse.json({ success: true, message: "Session destroyed." });
}
