import { NextRequest, NextResponse } from 'next/server';
import { fetchNseOptionChain } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = (searchParams.get('symbol') ?? 'NIFTY').toUpperCase();

  // Fetch without expiry filter — we only need the expiry list from the response
  const { expiries, error } = await fetchNseOptionChain(symbol, '');
  if (error && expiries.length === 0) {
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ expiries });
}
