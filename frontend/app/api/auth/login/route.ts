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
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    const backendRes = await fetch(`${backendUrl}/v1/auth/token`, { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: 'Invalid credentials or unauthorized' },
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

  } catch (error) {
    console.error("BFF Authentication Error:", error);
    return NextResponse.json(
      { error: 'Internal Gateway Error' },
      { status: 500 }
    );
  }
}