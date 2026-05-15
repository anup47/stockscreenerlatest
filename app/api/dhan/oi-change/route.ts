import { NextRequest, NextResponse } from 'next/server';
import { fetchPrevDayOIForChain } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';
  if (!clientId || !accessToken) {
    return NextResponse.json({ error: 'Missing Dhan credentials' }, { status: 401 });
  }

  const body = await req.json() as { symbol?: string; expiry?: string; strikes?: number[] };
  const { symbol, expiry, strikes } = body;
  if (!symbol || !expiry || !Array.isArray(strikes) || strikes.length === 0) {
    return NextResponse.json({ error: 'symbol, expiry, strikes required' }, { status: 400 });
  }

  const result = await fetchPrevDayOIForChain(symbol, expiry, strikes, clientId, accessToken);
  return NextResponse.json(result);
}
