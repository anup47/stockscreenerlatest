import { NextRequest, NextResponse } from 'next/server';
import { fetchEquityQuotes }         from '@/lib/dhan-api';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

// Quick debug: call Dhan market-feed quote for a symbol and return prevClose + ltp.
// Usage: /api/debug/dhan-intraday?symbol=AXISBANK
export async function GET(req: NextRequest) {
  const symbol      = (req.nextUrl.searchParams.get('symbol') ?? 'AXISBANK').toUpperCase();
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken)
    return NextResponse.json({ error: 'Dhan credentials required' });

  const map = await fetchEquityQuotes([symbol], clientId, accessToken);
  const q   = map.get(symbol);
  return NextResponse.json({ symbol, quote: q ?? null });
}
