import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry, fetchDhanOptionChain } from '@/lib/dhan-api';

export const maxDuration = 55;

// Top 30 liquid stocks + 4 indices = 34 symbols screened
export const SCREEN_SYMBOLS = [
  // Indices (weekly expiry)
  'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY',
  // Large-cap liquid F&O stocks
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS',
  'SBIN', 'AXISBANK', 'KOTAKBANK', 'LT', 'BAJFINANCE',
  'BHARTIARTL', 'WIPRO', 'HCLTECH', 'MARUTI', 'TITAN',
  'ITC', 'HINDUNILVR', 'SUNPHARMA', 'DRREDDY',
  'ONGC', 'NTPC', 'TATAMOTORS', 'TATASTEEL', 'ADANIPORTS',
  'BAJAJFINSV', 'DIVISLAB', 'TECHM', 'ZOMATO',
  'HINDALCO', 'TATACONSUM',
];

export interface OIScreenerRow {
  symbol:       string;
  expiry:       string;
  ceOI:         number;
  peOI:         number;
  ceOIChg:      number;
  peOIChg:      number;
  netOIChg:     number;
  netOIChgPct:  number;
  totalOI:      number;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function batchRun<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number,
  delayMs: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) await sleep(delayMs);
  }
  return results;
}

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json(
      { error: 'Missing Dhan credentials. Configure them in Settings.' },
      { status: 401 },
    );
  }

  // Phase 1: fetch nearest expiry for each symbol (batches of 8, 200ms apart)
  const expiryResults = await batchRun(
    SCREEN_SYMBOLS,
    async (sym) => {
      const { data } = await fetchDhanExpiry(sym, clientId, accessToken);
      return { sym, expiry: data?.expiries?.[0] ?? null };
    },
    8,
    200,
  );

  const withExpiry = expiryResults.filter(
    (r): r is { sym: string; expiry: string } => r.expiry !== null,
  );

  // Phase 2: fetch option chains and aggregate CE/PE totals (batches of 8, 300ms apart)
  const chainResults = await batchRun(
    withExpiry,
    async ({ sym, expiry }) => {
      const { data } = await fetchDhanOptionChain(sym, expiry, clientId, accessToken);
      if (!data || data.strikes.length === 0) return null;

      let ceOI = 0, peOI = 0, ceOIChg = 0, peOIChg = 0;
      for (const s of data.strikes) {
        ceOI    += s.ce.oi;
        peOI    += s.pe.oi;
        ceOIChg += s.ce.oiChange;
        peOIChg += s.pe.oiChange;
      }

      const totalOI = ceOI + peOI;
      if (totalOI === 0) return null;

      const netOIChg    = peOIChg - ceOIChg;
      const netOIChgPct = (netOIChg / totalOI) * 100;

      return { symbol: sym, expiry, ceOI, peOI, ceOIChg, peOIChg, netOIChg, netOIChgPct, totalOI } as OIScreenerRow;
    },
    8,
    300,
  );

  const rows = chainResults.filter((r): r is OIScreenerRow => r !== null);
  rows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);

  const bullish = rows.slice(0, 5);
  const bearish = [...rows].slice(-5).reverse();

  return NextResponse.json({
    bullish,
    bearish,
    all: rows,
    scanned:   rows.length,
    scannedAt: new Date().toISOString(),
  });
}
