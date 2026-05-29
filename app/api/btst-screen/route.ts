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

export async function GET() {
  const start = Date.now();

  // 1. Fetch Nifty daily change
  let niftyChangePct = 0;
  try {
    const niftyRows = await fetchHistory('%5ENSEI');
    if (niftyRows && niftyRows.length >= 2) {
      const last  = niftyRows[niftyRows.length - 1].close;
      const prev  = niftyRows[niftyRows.length - 2].close;
      niftyChangePct = ((last - prev) / prev) * 100;
    }
  } catch {/* non-fatal */}

  // 2. Fetch OI buildup map
  const oiBuildupMap = new Map<string, 'lb' | 'sb' | 'sc' | 'lu'>();
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const oiRes = await fetch(`${baseUrl}/api/dhan/oi-buildup`, { cache: 'no-store' });
    if (oiRes.ok) {
      const oiData: OIBuildupResponse = await oiRes.json();
      const categories = [
        { key: 'lb' as const, rows: oiData.lb ?? [] },
        { key: 'sb' as const, rows: oiData.sb ?? [] },
        { key: 'sc' as const, rows: oiData.sc ?? [] },
        { key: 'lu' as const, rows: oiData.lu ?? [] },
      ];
      for (const { key, rows } of categories) {
        for (const row of rows) {
          oiBuildupMap.set(row.symbol, key);
        }
      }
    }
  } catch {/* non-fatal — proceed with empty map */}

  // 3. fnoSet = anything in OI buildup data
  const fnoSet = new Set<string>(oiBuildupMap.keys());

  // 4. Fetch stock histories in batches
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

  // 5. Run BTST scan
  const allResults = buildBtstScan(stockData, niftyChangePct, oiBuildupMap, fnoSet);
  const top10      = allResults.slice(0, 10);

  const response: BtstScreenData = {
    results:     top10,
    total:       allResults.length,
    scanned:     stockData.length,
    niftyChange: niftyChangePct,
    fetchedAt:   new Date().toISOString(),
    elapsedMs:   Date.now() - start,
  };

  return NextResponse.json(response);
}
