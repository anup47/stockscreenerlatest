import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry, fetchDhanOptionChain, getScripAndSeg } from '@/lib/dhan-api';
import type { OIScreenerRow } from '@/lib/oi-screener';

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

export interface SymbolDebug {
  sym:     string;
  expiry:  string;
  status:  'ok' | 'api-error' | 'zero-oi' | 'no-strikes' | 'no-scrip';
  error?:  string;
  strikes?: number;
  totalOI?: number;
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

  // Phase 1 — 3 reference expiry calls only (not one per symbol)
  const [weeklyRes, midcpRes, stockRes] = await Promise.all([
    fetchDhanExpiry('NIFTY',      clientId, accessToken),
    fetchDhanExpiry('MIDCPNIFTY', clientId, accessToken),
    fetchDhanExpiry('RELIANCE',   clientId, accessToken),
  ]);

  const weeklyExpiry = weeklyRes.data?.expiries?.[0] ?? null;
  const midcpExpiry  = midcpRes.data?.expiries?.[0]  ?? null;
  const stockExpiry  = stockRes.data?.expiries?.[0]  ?? null;

  if (!weeklyExpiry || !stockExpiry) {
    return NextResponse.json({
      error: `Expiry fetch failed. NIFTY: ${weeklyRes.error ?? (weeklyExpiry ? 'ok' : 'empty')}  RELIANCE: ${stockRes.error ?? (stockExpiry ? 'ok' : 'empty')}`,
    }, { status: 502 });
  }

  // Build per-symbol list with assigned expiry
  const withExpiry = SCREEN_SYMBOLS.map(sym => ({
    sym,
    expiry: WEEKLY_INDEX_SYMS.has(sym) ? weeklyExpiry
          : sym === 'MIDCPNIFTY'        ? (midcpExpiry ?? weeklyExpiry)
          :                              stockExpiry,
    hasScripId: !!getScripAndSeg(sym),
  }));

  // Phase 2 — sequential pairs (batch=2) with 1.5 s gap to avoid rate limiting
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

      let ceOI = 0, peOI = 0, ceOIChg = 0, peOIChg = 0;
      for (const s of data.strikes) {
        ceOI    += s.ce.oi;
        peOI    += s.pe.oi;
        ceOIChg += s.ce.oiChange;
        peOIChg += s.pe.oiChange;
      }

      const totalOI = ceOI + peOI;
      if (totalOI === 0) {
        debugLog.push({ sym, expiry, status: 'zero-oi', strikes: data.strikes.length });
        return null;
      }

      const netOIChg    = peOIChg - ceOIChg;
      const netOIChgPct = (netOIChg / totalOI) * 100;

      debugLog.push({ sym, expiry, status: 'ok', strikes: data.strikes.length, totalOI });
      return { symbol: sym, expiry, ceOI, peOI, ceOIChg, peOIChg, netOIChg, netOIChgPct, totalOI } as OIScreenerRow;
    }));

    for (const r of pairResults) {
      if (r !== null) rows.push(r);
    }

    if (i + 2 < withExpiry.length) await sleep(1500);
  }

  rows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);

  return NextResponse.json({
    bullish:   rows.slice(0, 5),
    bearish:   [...rows].slice(-5).reverse(),
    all:       rows,
    scanned:   rows.length,
    scannedAt: new Date().toISOString(),
    _debug: {
      expiries: { weekly: weeklyExpiry, midcp: midcpExpiry, stock: stockExpiry },
      symbols:  debugLog,
    },
  });
}
