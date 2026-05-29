import { NextResponse } from 'next/server';
import { UNIVERSE } from '@/lib/universe';
import { buildBtstScan, calcBtstScore, type BtstResult } from '@/lib/btst-engine';
import type { OHLCVRow } from '@/lib/indicators';

export const maxDuration = 60;

export interface HistoryScan {
  results:     BtstResult[];
  total:       number;
  niftyChange: number;
}

export interface BtstScreenData {
  results:      BtstResult[];
  total:        number;
  scanned:      number;
  niftyChange:  number;
  fetchedAt:    string;
  elapsedMs:    number;
  error?:       string;
  // 90-day history keyed by "YYYY-MM-DD", computed from same fetched data
  history?:     Record<string, HistoryScan>;
  historyDates?: string[]; // newest-first
}

const YF_BASE    = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BATCH_SIZE = 12;
const HISTORY_DAYS = 90;

interface YFResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }>;
        adjclose?: Array<{ adjclose: number[] }>;
      };
    }>;
    error?: unknown;
  };
}

async function fetchHistory(symbol: string): Promise<OHLCVRow[] | null> {
  try {
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1y&includeAdjustedClose=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (!res.ok) return null;
    const json: YFResponse = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const { timestamp, indicators } = result;
    const quote    = indicators.quote[0];
    const adjClose = indicators.adjclose?.[0]?.adjclose ?? [];
    const rows: OHLCVRow[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const close = quote.close[i];
      if (close == null || isNaN(close)) continue;
      rows.push({
        date:     new Date(timestamp[i] * 1000),
        open:     quote.open[i],
        high:     quote.high[i],
        low:      quote.low[i],
        close,
        adjClose: adjClose[i] ?? close,
        volume:   quote.volume[i] ?? 0,
      });
    }
    return rows;
  } catch { return null; }
}

interface OIBuildupRow  { symbol: string }
interface OIBuildupResponse {
  lb?: OIBuildupRow[]; sb?: OIBuildupRow[];
  sc?: OIBuildupRow[]; lu?: OIBuildupRow[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>(res => setTimeout(() => res(null), ms))]);
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

export async function GET() {
  const start = Date.now();

  // 1. Fetch Nifty + OI buildup in parallel (OI capped at 8s)
  const oiBuildupMap = new Map<string, 'lb' | 'sb' | 'sc' | 'lu'>();
  const fnoSet       = new Set<string>();

  const [niftyRows] = await Promise.all([
    fetchHistory('%5ENSEI'),
    withTimeout(
      (async () => {
        const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const oiRes = await fetch(`${base}/api/dhan/oi-buildup`, { cache: 'no-store' });
        if (!oiRes.ok) return;
        const oiData: OIBuildupResponse = await oiRes.json();
        for (const [key, rows] of [
          ['lb', oiData.lb ?? []], ['sb', oiData.sb ?? []],
          ['sc', oiData.sc ?? []], ['lu', oiData.lu ?? []],
        ] as Array<[string, OIBuildupRow[]]>) {
          for (const row of rows) {
            oiBuildupMap.set(row.symbol, key as 'lb' | 'sb' | 'sc' | 'lu');
            fnoSet.add(row.symbol);
          }
        }
      })(),
      8_000,
    ),
  ]);

  const niftyChangePct = niftyRows && niftyRows.length >= 2
    ? (niftyRows[niftyRows.length - 1].close - niftyRows[niftyRows.length - 2].close)
      / niftyRows[niftyRows.length - 2].close * 100
    : 0;

  // 2. Fetch all stock histories in batches
  const stockData: Array<{ symbol: string; company: string; rows: OHLCVRow[] }> = [];
  for (let i = 0; i < UNIVERSE.length; i += BATCH_SIZE) {
    const batch = UNIVERSE.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (stock) => {
        const rows = await fetchHistory(`${stock.nse_symbol}.NS`);
        if (!rows || rows.length < 65) return null;
        return { symbol: stock.nse_symbol, company: stock.company, rows };
      }),
    );
    for (const r of batchResults) { if (r !== null) stockData.push(r); }
  }

  // 3. Today's BTST scan
  const allResults = buildBtstScan(stockData, niftyChangePct, oiBuildupMap, fnoSet);

  // 4. 90-day history — pure computation on already-fetched data (~30ms total)
  const history: Record<string, HistoryScan> = {};
  const historyDates: string[] = [];

  if (niftyRows && niftyRows.length >= HISTORY_DAYS + 2) {
    // Build nifty change per date
    const niftyChgMap = new Map<string, number>();
    for (let i = 1; i < niftyRows.length; i++) {
      const chg = (niftyRows[i].close - niftyRows[i - 1].close) / niftyRows[i - 1].close * 100;
      niftyChgMap.set(isoDate(niftyRows[i].date), chg);
    }

    // Pre-build date→index maps per stock
    const stockMaps = stockData.map(s => ({
      ...s,
      dateIdx: new Map(s.rows.map((r, i) => [isoDate(r.date), i])),
    }));

    // Last 90 trading dates from Nifty (skip today — already in main results)
    const tradingDates = niftyRows.slice(-HISTORY_DAYS - 1, -1).map(r => isoDate(r.date)).reverse();

    for (const date of tradingDates) {
      const niftyChange = niftyChgMap.get(date) ?? 0;
      const dayResults: BtstResult[] = [];

      for (const { symbol, company, rows, dateIdx } of stockMaps) {
        const idx = dateIdx.get(date);
        if (idx === undefined || idx < 64) continue;
        const r = calcBtstScore(symbol, company, rows.slice(0, idx + 1), niftyChange, undefined, false);
        if (r && r.score >= 30) dayResults.push(r);
      }
      dayResults.sort((a, b) => b.score - a.score);
      history[date] = { results: dayResults.slice(0, 10), total: dayResults.length, niftyChange };
      historyDates.push(date);
    }
  }

  return NextResponse.json({
    results:      allResults.slice(0, 10),
    total:        allResults.length,
    scanned:      stockData.length,
    niftyChange:  niftyChangePct,
    fetchedAt:    new Date().toISOString(),
    elapsedMs:    Date.now() - start,
    history,
    historyDates,
  } satisfies BtstScreenData);
}
