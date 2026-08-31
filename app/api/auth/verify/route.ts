import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const correctPin = process.env.APP_PIN || '1234';

    if (pin === correctPin) {
      const response = NextResponse.json({ success: true });
      response.cookies.set('app_pin', pin, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: 'lax',
      });
      return response;
    }

    return NextResponse.json({ success: false, error: 'Incorrect PIN' }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
