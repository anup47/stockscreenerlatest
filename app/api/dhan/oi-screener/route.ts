import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry, fetchDhanOptionChain, getScripAndSeg } from '@/lib/dhan-api';
import type { OIScreenerRow } from '@/lib/oi-screener';

export const maxDuration = 55;

// Indices with weekly Thursday expiry
const WEEKLY_INDEX_SYMS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY']);

// ~30 liquid F&O symbols — must all exist in IDX_SCRIP or FNO_SCRIP in lib/dhan-api.ts
const SCREEN_SYMBOLS = [
  // Indices
  'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY',
  // Large-cap liquid F&O stocks
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS',
  'SBIN', 'AXISBANK', 'KOTAKBANK', 'LT', 'BAJFINANCE',
  'BHARTIARTL', 'WIPRO', 'HCLTECH', 'MARUTI', 'TITAN',
  'HINDUNILVR', 'SUNPHARMA', 'DRREDDY', 'EICHERMOT',
  'ONGC', 'NTPC', 'TATASTEEL', 'ADANIPORTS',
  'BAJAJFINSV', 'DIVISLAB', 'TECHM', 'ASIANPAINT',
  'HINDALCO', 'TATACONSUM',
];

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

  // Phase 1: fetch 3 reference expiries in parallel (not 34 individual calls).
  // NIFTY gives the weekly Thursday expiry for all weekly-expiry indices.
  // MIDCPNIFTY has its own weekly expiry (Monday).
  // RELIANCE gives the monthly expiry used for all stocks.
  const [weeklyRes, midcpRes, stockRes] = await Promise.all([
    fetchDhanExpiry('NIFTY',      clientId, accessToken),
    fetchDhanExpiry('MIDCPNIFTY', clientId, accessToken),
    fetchDhanExpiry('RELIANCE',   clientId, accessToken),
  ]);

  const weeklyExpiry = weeklyRes.data?.expiries?.[0] ?? null;
  const midcpExpiry  = midcpRes.data?.expiries?.[0]  ?? null;
  const stockExpiry  = stockRes.data?.expiries?.[0]  ?? null;

  if (!weeklyExpiry || !stockExpiry) {
    const detail = [
      !weeklyExpiry ? `NIFTY expiry: ${weeklyRes.error ?? 'no data'}` : '',
      !stockExpiry  ? `RELIANCE expiry: ${stockRes.error ?? 'no data'}` : '',
    ].filter(Boolean).join('; ');
    return NextResponse.json({ error: `Could not fetch expiry dates. ${detail}` }, { status: 502 });
  }

  // Assign expiry per symbol — skip any symbol not in the scrip maps
  const withExpiry = SCREEN_SYMBOLS
    .filter(sym => !!getScripAndSeg(sym))
    .map(sym => ({
      sym,
      expiry: WEEKLY_INDEX_SYMS.has(sym) ? weeklyExpiry
            : sym === 'MIDCPNIFTY'        ? (midcpExpiry ?? weeklyExpiry)
            :                              stockExpiry,
    }));

  // Phase 2: fetch option chains — batches of 5 with 1 s gap (conservative, avoids rate limits)
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
    5,
    1000,
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
