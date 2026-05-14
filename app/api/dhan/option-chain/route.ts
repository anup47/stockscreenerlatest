import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanOptionChain } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol      = (searchParams.get('symbol') ?? 'NIFTY').toUpperCase();
  const expiry      = searchParams.get('expiry') ?? '';
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json({ error: 'Missing Dhan credentials. Configure them in Settings.' }, { status: 401 });
  }
  if (!expiry) {
    return NextResponse.json({ error: 'expiry parameter is required' }, { status: 400 });
  }

  const data = await fetchDhanOptionChain(symbol, expiry, clientId, accessToken);
  if (!data) {
    return NextResponse.json({ error: `Failed to fetch option chain for ${symbol} ${expiry}` }, { status: 502 });
  }

  return NextResponse.json(data);
}
