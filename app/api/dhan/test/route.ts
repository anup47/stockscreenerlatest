import { NextRequest, NextResponse } from 'next/server';
import { testDhanCredentials } from '@/lib/dhan-api';

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json({ ok: false, error: 'Missing credentials' }, { status: 400 });
  }

  const result = await testDhanCredentials(clientId, accessToken);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Dhan API rejected the credentials' },
      { status: result.status ?? 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
