import { NextRequest, NextResponse } from 'next/server';
import {
  fetchDhanExpiry, fetchDhanOptionChain, getScripAndSeg,
  ALL_FNO_SYMBOLS, FNO_SCRIP, dhanHeaders, fetchNseIndices,
} from '@/lib/dhan-api';
import { findAtmIndex } from '@/lib/oi-calculations';

export const maxDuration = 55;

export interface OIBuildupRow {
  symbol:    string;
  expiry:    string;
  price:     number;    // underlying spot price
  changePct: number;    // price % change from prev close
  ceOI:      number;
  peOI:      number;
  ceOIChg:   number;
  peOIChg:   number;
  totalOI:   number;    // ceOI + peOI (near ATM)
  oiChgPct:  number;    // (ceOIChg + peOIChg) / prevTotalOI × 100
}

export interface OIBuildupData {
  lb:           OIBuildupRow[];
  sb:           OIBuildupRow[];
  sc:           OIBuildupRow[];
  lu:           OIBuildupRow[];
  batchNum:     number;
  totalBatches: number;
  scanned:      number;
  scannedAt:    string;
  stockExpiry:  string;
  weeklyExpiry: string;
  n:            number;
  error?:       string;
}

const WEEKLY_INDEX_SYMS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY']);
const INDEX_SYMS        = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']);

const ALL_SCREEN_SYMBOLS = [
  ...ALL_FNO_SYMBOLS.indices,
  ...ALL_FNO_SYMBOLS.stocks,
];
const TOTAL_BATCHES = 4;
const BATCH_SIZE    = Math.ceil(ALL_SCREEN_SYMBOLS.length / TOTAL_BATCHES);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Fetch equity price change % for all FNO stocks from Dhan market feed OHLC API.
// Runs chunks of 100 in parallel; market feed has much higher rate limits than option chain.
async function fetchEquityChangePct(
  clientId: string,
  accessToken: string,
): Promise<Map<string, number>> {
  const map     = new Map<string, number>();
  const entries = Object.entries(FNO_SCRIP);  // [symbol, scripId]
  const CHUNK   = 100;

  const chunks: [string, number][][] = [];
  for (let i = 0; i < entries.length; i += CHUNK) {
    chunks.push(entries.slice(i, i + CHUNK));
  }

  await Promise.all(chunks.map(async chunk => {
    try {
      const res = await fetch('https://api.dhan.co/v2/marketfeed/ohlc', {
        method:  'POST',
        headers: dhanHeaders(clientId, accessToken),
        body:    JSON.stringify({ NSE_EQ: chunk.map(([, id]) => id) }),
      });
      if (!res.ok) return;

      const json = await res.json() as {
        data?: { NSE_EQ?: Record<string, Record<string, unknown>> };
      };
      const data = json.data?.NSE_EQ ?? {};

      for (const [sym, scrip] of chunk) {
        const q = data[String(scrip)];
        if (!q) continue;
        const ltp       = Number(q.last_price ?? q.ltp       ?? 0);
        const prevClose = Number(q.close      ?? q.prev_close ?? q.previous_close ?? 0);
        if (prevClose > 0) map.set(sym, ((ltp - prevClose) / prevClose) * 100);
      }
    } catch { /* leave symbol out of map — won't be classified */ }
  }));

  return map;
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
  const n        = Math.min(20, Math.max(1, parseInt(searchParams.get('n')     ?? '7', 10)));
  const batchNum = Math.min(TOTAL_BATCHES, Math.max(1, parseInt(searchParams.get('batch') ?? '1', 10)));

  const SCREEN_SYMBOLS = ALL_SCREEN_SYMBOLS.slice(
    (batchNum - 1) * BATCH_SIZE,
    batchNum * BATCH_SIZE,
  );

  // Expiry dates — use pre-supplied params or fetch fresh
  const preWeekly = searchParams.get('weeklyExpiry') ?? '';
  const preMidcp  = searchParams.get('midcpExpiry')  ?? '';
  const preStock  = searchParams.get('stockExpiry')  ?? '';

  let weeklyExpiry: string;
  let midcpExpiry:  string | null;
  let stockExpiry:  string;

  if (preWeekly && preStock) {
    weeklyExpiry = preWeekly;
    midcpExpiry  = preMidcp || null;
    stockExpiry  = preStock;
  } else {
    const [wRes, mRes, sRes] = await Promise.all([
      fetchDhanExpiry('NIFTY',      clientId, accessToken),
      fetchDhanExpiry('MIDCPNIFTY', clientId, accessToken),
      fetchDhanExpiry('RELIANCE',   clientId, accessToken),
    ]);
    weeklyExpiry = wRes.data?.expiries?.[0] ?? '';
    midcpExpiry  = mRes.data?.expiries?.[0] ?? null;
    stockExpiry  = sRes.data?.expiries?.[0] ?? '';

    if (!weeklyExpiry || !stockExpiry) {
      return NextResponse.json({ error: 'Expiry fetch failed' }, { status: 502 });
    }
  }

  // Fetch price data for equities (Dhan market feed) and indices (NSE) in parallel
  const [changePctMap, nseIndices] = await Promise.all([
    fetchEquityChangePct(clientId, accessToken),
    fetchNseIndices(),
  ]);
  for (const q of nseIndices) {
    if (INDEX_SYMS.has(q.symbol)) changePctMap.set(q.symbol, q.changePct);
  }

  // Build symbol → expiry mapping for this batch
  const withExpiry = SCREEN_SYMBOLS.map(sym => ({
    sym,
    expiry:     WEEKLY_INDEX_SYMS.has(sym) ? weeklyExpiry
              : sym === 'MIDCPNIFTY'        ? (midcpExpiry ?? weeklyExpiry)
              :                              stockExpiry,
    hasScripId: !!getScripAndSeg(sym),
  }));

  const lb: OIBuildupRow[] = [];
  const sb: OIBuildupRow[] = [];
  const sc: OIBuildupRow[] = [];
  const lu: OIBuildupRow[] = [];

  // Phase 2 — sequential pairs with 1.5 s gap (proven Dhan rate limit)
  for (let i = 0; i < withExpiry.length; i += 2) {
    const pair = withExpiry.slice(i, i + 2);

    const results = await Promise.all(pair.map(async ({ sym, expiry, hasScripId }) => {
      if (!hasScripId) return null;

      const { data } = await fetchDhanOptionChain(sym, expiry, clientId, accessToken);
      if (!data || data.strikes.length === 0) return null;

      const atmIdx      = findAtmIndex(data.strikes, data.underlyingPrice);
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
      if (totalOI === 0) return null;

      const totalOIChg  = ceOIChg + peOIChg;
      const prevTotalOI = totalOI - totalOIChg;
      const oiChgPct    = prevTotalOI !== 0 ? (totalOIChg / Math.abs(prevTotalOI)) * 100 : 0;

      const changePct = changePctMap.get(sym) ?? 0;

      return {
        symbol: sym, expiry,
        price:  data.underlyingPrice, changePct,
        ceOI, peOI, ceOIChg, peOIChg, totalOI, oiChgPct,
      } as OIBuildupRow;
    }));

    for (const r of results) {
      if (!r) continue;
      if      (r.changePct > 0 && r.oiChgPct > 0) lb.push(r);
      else if (r.changePct < 0 && r.oiChgPct > 0) sb.push(r);
      else if (r.changePct > 0 && r.oiChgPct < 0) sc.push(r);
      else if (r.changePct < 0 && r.oiChgPct < 0) lu.push(r);
    }

    if (i + 2 < withExpiry.length) await sleep(1500);
  }

  lb.sort((a, b) => b.oiChgPct - a.oiChgPct);   // highest OI buildup first
  sb.sort((a, b) => b.oiChgPct - a.oiChgPct);
  sc.sort((a, b) => a.oiChgPct - b.oiChgPct);   // most OI reduction first
  lu.sort((a, b) => a.oiChgPct - b.oiChgPct);

  return NextResponse.json({
    lb, sb, sc, lu,
    batchNum,
    totalBatches: TOTAL_BATCHES,
    scanned:      lb.length + sb.length + sc.length + lu.length,
    scannedAt:    new Date().toISOString(),
    stockExpiry,
    weeklyExpiry,
    n,
  } satisfies OIBuildupData);
}
