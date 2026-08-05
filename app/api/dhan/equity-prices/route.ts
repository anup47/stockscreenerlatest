import { NextRequest, NextResponse } from 'next/server';
import { fetchEquityQuotes }         from '@/lib/dhan-api';

export const maxDuration = 35;
export const dynamic     = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw     = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) return NextResponse.json({ quotes: {} });

  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';
  if (!clientId || !accessToken) {
    return NextResponse.json({ error: 'Missing Dhan credentials', quotes: {} }, { status: 401 });
  }

  let quoteMap: Awaited<ReturnType<typeof fetchEquityQuotes>>;
  try {
    quoteMap = await fetchEquityQuotes(symbols, clientId, accessToken);
  } catch (err) {
    if (err instanceof Error && err.message === 'RATE_LIMITED') {
      return NextResponse.json({ error: 'rate_limited', quotes: {} }, { status: 429 });
    }
    return NextResponse.json({ error: 'fetch_failed', quotes: {} }, { status: 500 });
  }

  const quotes: Record<string, { ltp: number; prevClose: number; change: number; changePct: number }> = {};
  for (const [sym, q] of quoteMap) {
    quotes[sym] = {
      ltp:       q.ltp,
      prevClose: q.prevClose,
      change:    q.change,
      changePct: q.changePct,
    };
  }

  return NextResponse.json({ quotes, fetchedAt: new Date().toISOString() });
}
