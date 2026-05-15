import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry } from '@/lib/dhan-api';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol      = (searchParams.get('symbol') ?? 'NIFTY').toUpperCase();
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json({ error: 'Missing Dhan credentials. Configure them in Settings.' }, { status: 401 });
  }

  const { data, error } = await fetchDhanExpiry(symbol, clientId, accessToken);
  if (!data) {
    return NextResponse.json({ error: error ?? `Failed to fetch expiry list for ${symbol}` }, { status: 502 });
  }

  return NextResponse.json(data);
}
