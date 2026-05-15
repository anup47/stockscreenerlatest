import { NextRequest, NextResponse } from 'next/server';
import { generateTOTP } from '@/lib/totp';

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const pin         = req.headers.get('x-dhan-pin')          ?? '';
  const totpSecret  = req.headers.get('x-dhan-totp-secret')  ?? '';

  if (!clientId || !pin || !totpSecret) {
    return NextResponse.json({ error: 'Missing clientId, pin, or totpSecret' }, { status: 400 });
  }

  let totp: string;
  try {
    totp = generateTOTP(totpSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid TOTP secret — check it is a valid base32 string' }, { status: 400 });
  }

  const url = `https://auth.dhan.co/app/generateAccessToken?dhanClientId=${encodeURIComponent(clientId)}&pin=${encodeURIComponent(pin)}&totp=${totp}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return NextResponse.json({ error: `Network error: ${String(e)}` }, { status: 502 });
  }

  let body: unknown;
  try { body = await res.json(); } catch { body = {}; }

  if (!res.ok) {
    const msg = (body as Record<string, unknown>)?.message ?? (body as Record<string, unknown>)?.error ?? res.statusText;
    return NextResponse.json({ error: `Dhan returned ${res.status}: ${msg}` }, { status: res.status });
  }

  const token = (body as Record<string, unknown>)?.accessToken as string | undefined;
  if (!token) {
    return NextResponse.json({ error: 'Dhan response did not include an accessToken', raw: body }, { status: 502 });
  }

  return NextResponse.json({ accessToken: token, generatedAt: new Date().toISOString() });
}
