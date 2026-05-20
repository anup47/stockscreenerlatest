import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry, fetchDhanOptionChain, getScripAndSeg } from '@/lib/dhan-api';
import { findAtmIndex } from '@/lib/oi-calculations';
import type { OIScreenerRow, SymbolDebug } from '@/lib/oi-screener';

export const maxDuration = 55;

const WEEKLY_INDEX_SYMS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY']);

const SCREEN_SYMBOLS = [
  'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY',
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

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json(
      { error: 'Missing Dhan credentials. Configure them in Settings.' },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const reqStockExpiry = searchParams.get('stockExpiry') ?? '';
  // n = strikes per side of ATM (default 7 → 15 total)
  const n = Math.min(20, Math.max(1, parseInt(searchParams.get('n') ?? '7', 10)));

  // Phase 1 — 3 reference expiry calls
  const [weeklyRes, midcpRes, stockRes] = await Promise.all([
    fetchDhanExpiry('NIFTY',      clientId, accessToken),
    fetchDhanExpiry('MIDCPNIFTY', clientId, accessToken),
    fetchDhanExpiry('RELIANCE',   clientId, accessToken),
  ]);

  const weeklyExpiry      = weeklyRes.data?.expiries?.[0] ?? null;
  const midcpExpiry       = midcpRes.data?.expiries?.[0]  ?? null;
  const allStockExpiries  = stockRes.data?.expiries        ?? [];

  const stockExpiry = (reqStockExpiry && allStockExpiries.includes(reqStockExpiry))
    ? reqStockExpiry
    : allStockExpiries[0] ?? null;

  if (!weeklyExpiry || !stockExpiry) {
    return NextResponse.json({
      error: `Expiry fetch failed. NIFTY: ${weeklyRes.error ?? (weeklyExpiry ? 'ok' : 'empty')}  RELIANCE: ${stockRes.error ?? (stockExpiry ? 'ok' : 'empty')}`,
    }, { status: 502 });
  }

  const withExpiry = SCREEN_SYMBOLS.map(sym => ({
    sym,
    expiry: WEEKLY_INDEX_SYMS.has(sym) ? weeklyExpiry
          : sym === 'MIDCPNIFTY'        ? (midcpExpiry ?? weeklyExpiry)
          :                              stockExpiry,
    hasScripId: !!getScripAndSeg(sym),
  }));

  // Phase 2 — sequential pairs with 1.5 s gap
  const rows: OIScreenerRow[] = [];
  const debugLog: SymbolDebug[] = [];

  for (let i = 0; i < withExpiry.length; i += 2) {
    const pair = withExpiry.slice(i, i + 2);

    const pairResults = await Promise.all(pair.map(async ({ sym, expiry, hasScripId }) => {
      if (!hasScripId) {
        debugLog.push({ sym, expiry, status: 'no-scrip' });
        return null;
      }

      const { data, error } = await fetchDhanOptionChain(sym, expiry, clientId, accessToken);

      if (error || !data) {
        debugLog.push({ sym, expiry, status: 'api-error', error: error ?? 'null data' });
        return null;
      }

      if (data.strikes.length === 0) {
        debugLog.push({ sym, expiry, status: 'no-strikes' });
        return null;
      }

      const atmIdx = findAtmIndex(data.strikes, data.underlyingPrice);

      const nearStrikes = data.strikes.slice(
        Math.max(0, atmIdx - n),
        Math.min(data.strikes.length, atmIdx + n + 1),
      );

      let ceOI = 0, peOI = 0, ceOIChg = 0, peOIChg = 0;
      for (const s of nearStrikes) {
        ceOI    += s.ce.oi;
        peOI    += s.pe.oi;
        ceOIChg += s.ce.oiChange;
        peOIChg += s.pe.oiChange;
      }

      const totalOI = ceOI + peOI;
      if (totalOI === 0) {
        debugLog.push({ sym, expiry, status: 'zero-oi', strikes: nearStrikes.length });
        return null;
      }

      const netOIChg    = peOIChg - ceOIChg;
      const netOIChgPct = (netOIChg / totalOI) * 100;

      debugLog.push({ sym, expiry, status: 'ok', strikes: nearStrikes.length, totalOI });
      return { symbol: sym, expiry, ceOI, peOI, ceOIChg, peOIChg, netOIChg, netOIChgPct, totalOI } as OIScreenerRow;
    }));

    for (const r of pairResults) if (r !== null) rows.push(r);
    if (i + 2 < withExpiry.length) await sleep(1500);
  }

  // Sort all descending; derive bullish (>0 desc) and bearish (<0 asc = most-negative first)
  rows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);
  const bullish = rows.filter(r => r.netOIChgPct > 0).slice(0, 5);
  const bearish = rows.filter(r => r.netOIChgPct < 0).reverse().slice(0, 5);

  return NextResponse.json({
    bullish,
    bearish,
    all:            rows,
    scanned:        rows.length,
    scannedAt:      new Date().toISOString(),
    stockExpiry,
    stockExpiries:  allStockExpiries,
    weeklyExpiry,
    n,
    _debug: {
      expiries: { weekly: weeklyExpiry, midcp: midcpExpiry, stock: stockExpiry },
      symbols:  debugLog,
    },
  });
}
