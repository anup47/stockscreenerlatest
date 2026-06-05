import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry, fetchDhanOptionChain, getScripAndSeg, ALL_FNO_SYMBOLS } from '@/lib/dhan-api';
import { findAtmIndex } from '@/lib/oi-calculations';
import type { OIScreenerRow, SymbolDebug } from '@/lib/oi-screener';

export const maxDuration = 55;

const WEEKLY_INDEX_SYMS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY']);

// All F&O symbols: indices first, then stocks alphabetically
const ALL_SCREEN_SYMBOLS = [
  ...ALL_FNO_SYMBOLS.indices,
  ...ALL_FNO_SYMBOLS.stocks,
];

const TOTAL_BATCHES = 4;
const BATCH_SIZE = Math.ceil(ALL_SCREEN_SYMBOLS.length / TOTAL_BATCHES);

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Retry once on Dhan rate-limit (HTTP 429 / error code 805) after a longer backoff.
async function fetchOptionChainSafe(
  sym: string, expiry: string, clientId: string, accessToken: string,
) {
  const first = await fetchDhanOptionChain(sym, expiry, clientId, accessToken);
  if (first.error && first.error.includes('429')) {
    await sleep(6000);
    return fetchDhanOptionChain(sym, expiry, clientId, accessToken);
  }
  return first;
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
  const n = Math.min(20, Math.max(1, parseInt(searchParams.get('n') ?? '7', 10)));
  const batchNum = Math.min(TOTAL_BATCHES, Math.max(1, parseInt(searchParams.get('batch') ?? '1', 10)));

  // Slice symbols for this batch
  const SCREEN_SYMBOLS = ALL_SCREEN_SYMBOLS.slice(
    (batchNum - 1) * BATCH_SIZE,
    batchNum * BATCH_SIZE,
  );

  // Phase 1 — use pre-supplied expiries (from /prefetch) or fetch them now
  const preWeekly = searchParams.get('weeklyExpiry') ?? '';
  const preMidcp  = searchParams.get('midcpExpiry')  ?? '';
  const preStock  = searchParams.get('stockExpiry')  ?? '';

  let weeklyExpiry: string | null;
  let midcpExpiry:  string | null;
  let stockExpiry:  string | null;
  let allStockExpiries: string[];

  if (preWeekly && preStock) {
    // Expiries supplied by client — skip Phase 1 entirely
    weeklyExpiry     = preWeekly;
    midcpExpiry      = preMidcp || null;
    stockExpiry      = preStock;
    allStockExpiries = [];
  } else {
    const [weeklyRes, midcpRes, stockRes] = await Promise.all([
      fetchDhanExpiry('NIFTY',      clientId, accessToken),
      fetchDhanExpiry('MIDCPNIFTY', clientId, accessToken),
      fetchDhanExpiry('RELIANCE',   clientId, accessToken),
    ]);
    weeklyExpiry     = weeklyRes.data?.expiries?.[0] ?? null;
    midcpExpiry      = midcpRes.data?.expiries?.[0]  ?? null;
    allStockExpiries = stockRes.data?.expiries        ?? [];
    stockExpiry      = allStockExpiries[0] ?? null;

    if (!weeklyExpiry || !stockExpiry) {
      return NextResponse.json({
        error: `Expiry fetch failed. NIFTY: ${weeklyRes.error ?? (weeklyExpiry ? 'ok' : 'empty')}  RELIANCE: ${stockRes.error ?? (stockExpiry ? 'ok' : 'empty')}`,
      }, { status: 502 });
    }
  }

  const withExpiry = SCREEN_SYMBOLS.map(sym => ({
    sym,
    expiry: WEEKLY_INDEX_SYMS.has(sym) ? weeklyExpiry
          : sym === 'MIDCPNIFTY'        ? (midcpExpiry ?? weeklyExpiry)
          :                              stockExpiry,
    hasScripId: !!getScripAndSeg(sym),
  }));

  // Phase 2 — sequential pairs with 1.5s gap
  const rows: OIScreenerRow[] = [];
  const debugLog: SymbolDebug[] = [];

  for (let i = 0; i < withExpiry.length; i += 2) {
    const pair = withExpiry.slice(i, i + 2);

    const pairResults = await Promise.all(pair.map(async ({ sym, expiry, hasScripId }) => {
      if (!hasScripId) {
        debugLog.push({ sym, expiry, status: 'no-scrip' });
        return null;
      }

      const { data, error } = await fetchOptionChainSafe(sym, expiry, clientId, accessToken);

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
    if (i + 2 < withExpiry.length) await sleep(2500);
  }

  rows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);

  return NextResponse.json({
    all:           rows,
    scanned:       rows.length,
    scannedAt:     new Date().toISOString(),
    stockExpiry,
    stockExpiries: allStockExpiries,
    weeklyExpiry,
    n,
    batchNum,
    totalBatches:  TOTAL_BATCHES,
    _debug: {
      expiries: { weekly: weeklyExpiry, midcp: midcpExpiry, stock: stockExpiry },
      symbols:  debugLog,
    },
  });
}
