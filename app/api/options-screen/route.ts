import { NextResponse } from 'next/server';
import { UNIVERSE } from '@/lib/universe';
import { screenOptionsStock, FNO_SET } from '@/lib/options-screener';
import type { OHLCVRow } from '@/lib/indicators';

export const maxDuration = 60;

const YF_BASE   = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BATCH_SZ  = 12;

async function fetchHistory(symbol: string): Promise<OHLCVRow[] | null> {
  try {
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1y&includeAdjustedClose=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const rows: OHLCVRow[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const close = quote.close[i];
      if (close == null || isNaN(close)) continue;
      rows.push({
        date:   new Date(timestamp[i] * 1000),
        open:   quote.open[i]   ?? close,
        high:   quote.high[i]   ?? close,
        low:    quote.low[i]    ?? close,
        close,
        volume: quote.volume[i] ?? 0,
      });
    }
    return rows.length >= 52 ? rows : null;
  } catch { return null; }
}

export async function GET() {
  const start = Date.now();

  // Intersect existing universe with F&O segment
  const fnoUniverse = UNIVERSE.filter(s => FNO_SET.has(s.nse_symbol));

  const results = [];

  for (let i = 0; i < fnoUniverse.length; i += BATCH_SZ) {
    const batch = fnoUniverse.slice(i, i + BATCH_SZ);
    const batchOut = await Promise.all(
      batch.map(async (stock) => {
        const rows = await fetchHistory(`${stock.nse_symbol}.NS`);
        if (!rows) return null;
        return screenOptionsStock(stock, rows);
      }),
    );
    for (const r of batchOut) {
      if (r !== null) results.push(r);
    }
  }

  results.sort((a, b) => b.score - a.score);

  const bullish  = results.filter(r => r.direction === 'CALL');
  const bearish  = results.filter(r => r.direction === 'PUT');
  const strong   = results.filter(r => r.confidence === 'Strong');
  const watchlist = results.filter(r => r.confidence === 'Watchlist');

  return NextResponse.json({
    results: results.slice(0, 25),
    stats: {
      bullishCount:   bullish.length,
      bearishCount:   bearish.length,
      strongCount:    strong.length,
      watchlistCount: watchlist.length,
      totalScanned:   fnoUniverse.length,
    },
    timestamp:  new Date().toISOString(),
    elapsedMs:  Date.now() - start,
  });
}
