import { NextRequest, NextResponse } from 'next/server';
import { UNIVERSE } from '@/lib/universe';
import { screenTriangleStock, aggregateWeekly } from '@/lib/triangle-screener';
import type { OHLCVRow } from '@/lib/indicators';

export const maxDuration = 60;

const YF_BASE  = 'https://query1.finance.yahoo.com/v8/finance/chart';
const BATCH_SZ = 12;

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
    return rows.length >= 60 ? rows : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const tf = (req.nextUrl.searchParams.get('tf') ?? 'daily') as 'daily' | 'weekly';

  const results = [];

  for (let i = 0; i < UNIVERSE.length; i += BATCH_SZ) {
    const batch = UNIVERSE.slice(i, i + BATCH_SZ);
    const batchOut = await Promise.all(
      batch.map(async stock => {
        const rows = await fetchHistory(`${stock.nse_symbol}.NS`);
        if (!rows) return null;
        const finalRows = tf === 'weekly' ? aggregateWeekly(rows) : rows;
        if (tf === 'weekly' && finalRows.length < 30) return null;
        return screenTriangleStock(stock, finalRows, tf === 'daily' ? 'Daily' : 'Weekly');
      }),
    );
    for (const r of batchOut) {
      if (r !== null) results.push(r);
    }
  }

  results.sort((a, b) => b.totalScore - a.totalScore);

  const avgScore = results.length
    ? +(results.reduce((s, r) => s + r.totalScore, 0) / results.length).toFixed(1)
    : 0;

  return NextResponse.json({
    results: results.slice(0, 30),
    stats: {
      total:          results.length,
      nearBreakout:   results.filter(r => !r.isAboveResistance && r.breakoutDistPct <= 5).length,
      recentBreakout: results.filter(r => r.isAboveResistance).length,
      avgScore,
      universeSize:   UNIVERSE.length,
    },
    timeframe: tf,
    timestamp:  new Date().toISOString(),
    elapsedMs:  Date.now() - start,
  });
}
