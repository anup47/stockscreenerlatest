import { NextRequest, NextResponse } from 'next/server';
import { fetchNseOptionChain } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = (searchParams.get('symbol') ?? 'NIFTY').toUpperCase();
  const expiry = searchParams.get('expiry') ?? '';

  if (!expiry) return NextResponse.json({ error: 'expiry required' }, { status: 400 });

  const { data, expiries, error } = await fetchNseOptionChain(symbol, expiry);
  if (!data) return NextResponse.json({ error: error ?? 'Failed to fetch from NSE' }, { status: 502 });

  return NextResponse.json({ ...data, expiries });
}
