import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry, fetchDhanOptionChain, getScripAndSeg } from '@/lib/dhan-api';
import { findAtmIndex } from '@/lib/oi-calculations';
import type { OIScreenerRow, SymbolDebug } from '@/lib/oi-screener';

export const maxDuration = 55;

// Top-40 focused screener — runs Dhan option-chain analysis on a custom
// symbol list (the caller passes the top 10 per OI-buildup category).
// 40 symbols = 20 pairs × 1.5 s gap ≈ 30 s → safely under maxDuration.

const WEEKLY_INDEX_SYMS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY']);

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json({ error: 'Missing Dhan credentials. Configure them in Settings.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const symbols = symbolsParam
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });
  }

  const n = Math.min(20, Math.max(1, parseInt(searchParams.get('n') ?? '7', 10)));

  // Fetch expiries internally (2 parallel calls, ~1–2s)
  const [weeklyRes, stockRes] = await Promise.all([
    fetchDhanExpiry('NIFTY',    clientId, accessToken),
    fetchDhanExpiry('RELIANCE', clientId, accessToken),
  ]);
  const weeklyExpiry = weeklyRes.data?.expiries?.[0] ?? null;
  const stockExpiry  = stockRes.data?.expiries?.[0]  ?? null;

  if (!weeklyExpiry || !stockExpiry) {
    return NextResponse.json({
      error: `Expiry fetch failed — NIFTY: ${weeklyRes.error ?? (weeklyExpiry ? 'ok' : 'empty')}  RELIANCE: ${stockRes.error ?? (stockExpiry ? 'ok' : 'empty')}`,
    }, { status: 502 });
  }

  const withExpiry = symbols.map(sym => ({
    sym,
    expiry:     WEEKLY_INDEX_SYMS.has(sym) ? weeklyExpiry : stockExpiry,
    hasScripId: !!getScripAndSeg(sym),
  }));

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
      const atmIdx     = findAtmIndex(data.strikes, data.underlyingPrice);
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

  rows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);

  return NextResponse.json({
    all:          rows,
    scanned:      rows.length,
    scannedAt:    new Date().toISOString(),
    weeklyExpiry,
    stockExpiry,
    n,
    _debug:       { symbols: debugLog },
  });
}
