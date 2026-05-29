import { NextResponse } from 'next/server';
import { UNIVERSE } from '@/lib/universe';
import { buildBtstScan, type BtstResult } from '@/lib/btst-engine';
import type { OHLCVRow } from '@/lib/indicators';

export const maxDuration = 60;

export interface BtstScreenData {
  results:      BtstResult[];
  total:        number;
  scanned:      number;
  niftyChange:  number;
  fetchedAt:    string;
  elapsedMs:    number;
  error?:       string;
}

const YF_BASE    = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BATCH_SIZE = 12;

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
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
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
  } catch {
    return null;
  }
}

interface OIBuildupRow {
  symbol: string;
}

interface OIBuildupResponse {
  lb?: OIBuildupRow[];
  sb?: OIBuildupRow[];
  sc?: OIBuildupRow[];
  lu?: OIBuildupRow[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>(res => setTimeout(() => res(null), ms))]);
}

export async function GET() {
  const start = Date.now();

  // 1 + 2: fetch Nifty and OI buildup in parallel with stock data
  const oiBuildupMap = new Map<string, 'lb' | 'sb' | 'sc' | 'lu'>();
  const fnoSet       = new Set<string>();

  const [niftyRows] = await Promise.all([
    // Nifty
    fetchHistory('%5ENSEI'),
    // OI buildup — cap at 8s so it never delays the scan
    withTimeout(
      (async () => {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
        const oiRes = await fetch(`${baseUrl}/api/dhan/oi-buildup`, { cache: 'no-store' });
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

  // 3. Fetch stock histories in batches of 20 (larger = fewer round trips)
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
    for (const r of batchResults) {
      if (r !== null) stockData.push(r);
    }
  }

  // 4. Run BTST scan
  const allResults = buildBtstScan(stockData, niftyChangePct, oiBuildupMap, fnoSet);
  const top10      = allResults.slice(0, 10);

  return NextResponse.json({
    results:     top10,
    total:       allResults.length,
    scanned:     stockData.length,
    niftyChange: niftyChangePct,
    fetchedAt:   new Date().toISOString(),
    elapsedMs:   Date.now() - start,
  } satisfies BtstScreenData);
}
