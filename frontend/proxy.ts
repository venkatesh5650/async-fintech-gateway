import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // 1. Define the protected territory
  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard");

  // 2. Extract the secure HTTP-Only cookie set by your BFF
  const sessionToken = request.cookies.get("session_token")?.value;

  // 3. The Zero-Trust Gate
  if (isProtectedRoute && !sessionToken) {
    // Intercepted: Redirect unauthorized traffic to the login screen
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Pass-through for authenticated users or public routes
  return NextResponse.next();
}

// 5. The Performance Filter (Matcher)
// We only want this middleware to run on pages, not on static assets or API routes,
// to preserve maximum rendering speed.
export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
