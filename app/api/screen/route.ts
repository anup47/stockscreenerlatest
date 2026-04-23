import { NextResponse } from 'next/server';
import { UNIVERSE } from '@/lib/universe';
import { screenStock, type OHLCVRow } from '@/lib/indicators';

export const maxDuration = 60; // seconds (Vercel Pro); hobby plan = 10s

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
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
      // Next.js: skip cache so each request is fresh
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

export async function GET() {
  const start = Date.now();

  // Nifty 50 benchmark return (3 months ≈ 63 trading days)
  let niftyReturn63d = 0;
  try {
    const niftyRows = await fetchHistory('%5ENSEI');
    if (niftyRows && niftyRows.length >= 64) {
      const closes = niftyRows.map(r => r.adjClose ?? r.close);
      niftyReturn63d =
        (closes[closes.length - 1] / closes[closes.length - 64] - 1) * 100;
    }
  } catch {/* non-fatal */}

  const results = [];

  // Process universe in parallel batches
  for (let i = 0; i < UNIVERSE.length; i += BATCH_SIZE) {
    const batch = UNIVERSE.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (stock) => {
        const rows = await fetchHistory(`${stock.nse_symbol}.NS`);
        if (!rows || rows.length < 200) return null;
        return screenStock(stock, rows, niftyReturn63d);
      }),
    );
    for (const r of batchResults) {
      if (r !== null) results.push(r);
    }
  }

  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    results: results.slice(0, 25),
    timestamp: new Date().toISOString(),
    scanned: results.length,
    universeSize: UNIVERSE.length,
    elapsedMs: Date.now() - start,
  });
}
