import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

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

    // Persist JWT token in secure HTTP-only cookie
    const cookieStore = await cookies();
    
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