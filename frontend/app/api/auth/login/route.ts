import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // 1. The OAuth2 Translation Layer
    const formData = new URLSearchParams();
    formData.append('username', email); 
    formData.append('password', password);

    // 2. The Internal Network Fetch
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

    // 3. The 1% Maneuver: Next.js 15 Async Cookie Serialization
    const cookieStore = await cookies(); // <-- Next.js 15 requires awaiting this
    
    cookieStore.set({
      name: 'session_token',
      value: token,
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'lax', 
      path: '/',
      maxAge: 60 * 60 * 24 * 7, 
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("BFF Authentication Error:", error);
    return NextResponse.json(
      { error: 'Internal Gateway Error' },
      { status: 500 }
    );
  }
}