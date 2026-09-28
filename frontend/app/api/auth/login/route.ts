import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Format payload as form data for OAuth2 password grant
    const formData = new URLSearchParams();
    formData.append('username', email); 
    formData.append('password', password);

    // Forward credentials to backend auth service
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://fintech-api-gateway-m2yl.onrender.com';
    
    const backendRes = await fetch(`${backendUrl}/v1/auth/token`, { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!backendRes.ok) {
      let errorMsg = 'Invalid credentials or unauthorized';
      try {
        const errorData = await backendRes.json();
        if (typeof errorData.detail === 'string') {
          errorMsg = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMsg = errorData.detail.map((e: any) => e.msg).join(', ');
        }
      } catch {
        // Fall back to default error message if JSON parsing fails
      }

      return NextResponse.json(
        { error: errorMsg },
        { status: backendRes.status }
      );
    }

    const data = await backendRes.json();
    const token = data.access_token;

    // In Next.js 15 Route Handlers, cookies() is read-only.
    // Cookie mutation must happen on the NextResponse object directly.
    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: 'session_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;

  } catch (error: any) {
    console.error("BFF Authentication Error:", error);

    const isNetworkError =
      error?.code === 'ECONNREFUSED' ||
      error?.cause?.code === 'ECONNREFUSED' ||
      (error instanceof TypeError && error.message.includes('fetch failed'));

    return NextResponse.json(
      {
        error: isNetworkError
          ? 'Backend authentication service is unreachable. Ensure the backend FastAPI server is running.'
          : 'Internal Gateway Error',
      },
      { status: isNetworkError ? 503 : 500 }
    );
  }
}