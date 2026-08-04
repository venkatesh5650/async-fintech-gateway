import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // 1. Extract the secure HTTP-Only cookie set by your BFF proxy
  const token = request.cookies.get('session_token')?.value;

  // 2. The Zero-Trust Gate: Unauthenticated users trying to access protected routes -> Bounce to Login
  if (request.nextUrl.pathname.startsWith('/dashboard') && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 3. The UX Gate: Authenticated users trying to access the login page -> Bounce to Dashboard
  if (request.nextUrl.pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/dashboard/AAPL', request.url));
  }

  // 4. Pass-through for authorized traffic
  return NextResponse.next();
}

// 5. The Performance Filter (Matcher)
// We only run this on specific routes to preserve maximum edge rendering speed.
export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};