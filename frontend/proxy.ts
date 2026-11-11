import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  hasLiveSessionToken,
} from "@/lib/sessionCookie";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = path === "/dashboard" || path.startsWith("/dashboard/");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const signedIn = hasLiveSessionToken(token);

  if (isProtectedRoute && !signedIn) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    if (token) clearSessionCookie(response.cookies);
    return response;
  }

  if (path === "/login" && signedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login"],
};
