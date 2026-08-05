import { NextRequest, NextResponse }                      from 'next/server';
import { fetchEquityIntraday315, fetchEquityQuotes }       from '@/lib/dhan-api';

export const dynamic     = 'force-dynamic';
export const maxDuration = 55;

// Returns Dhan prices for use as Prev Close.
//
// Two modes — picked automatically based on IST time:
//
//  After 3:15 PM on a weekday (incl. auto-capture timer firing at exactly 3:15):
//    → Dhan /v2/charts/intraday for TODAY — finds the actual 3:15 PM 1-min candle.
//      This is the exact traded price the user wants.
//
//  Before 3:15 PM / morning (page opened the next day, manual "Set Prev Close"):
//    → Dhan /v2/marketfeed/quote prevClose — previous session official close from Dhan.
//      Intraday endpoint only works for the live session, so this is the best
//      Dhan-only price available for the previous day.

function istNow() {
  const istMs = Date.now() + (5 * 3600 + 30 * 60) * 1000;
  const ist   = new Date(istMs);
  return {
    date: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`,
    mins: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    day:  ist.getUTCDay(),
  };
}

export async function GET(req: NextRequest) {
  const raw        = req.nextUrl.searchParams.get('symbols') ?? '';
  const nseSymbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!nseSymbols.length) return NextResponse.json({ prices: {} });

  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken)
    return NextResponse.json({ prices: {}, error: 'Dhan credentials required' }, { status: 401 });

  const { date, mins, day } = istNow();
  const isAfter315 = day !== 0 && day !== 6 && mins >= 15 * 60 + 15;

  if (isAfter315) {
    // ── Mode A: intraday 3:15 PM candle (same-day, works because session is/just-was live) ──
    const dhanMap = await fetchEquityIntraday315(nseSymbols, clientId, accessToken, date);
    if (dhanMap.size > 0) {
      const prices: Record<string, number> = {};
      for (const [sym, price] of dhanMap) prices[sym] = price;
      return NextResponse.json({ prices, source: 'dhan-intraday-315', date });
    }
    // Intraday returned nothing — fall through to prevClose below
  }

  // ── Mode B: Dhan market-feed prevClose (previous session official close, always available) ──
  const quoteMap = await fetchEquityQuotes(nseSymbols, clientId, accessToken);
  const prices: Record<string, number> = {};
  for (const [sym, q] of quoteMap) {
    if (q.prevClose > 0) prices[sym] = q.prevClose;
  }
  return NextResponse.json({ prices, source: 'dhan-prevclose', date });
}
