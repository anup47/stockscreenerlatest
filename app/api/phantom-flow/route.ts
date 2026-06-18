import { NextRequest, NextResponse } from 'next/server';
import { runPhantomFlow, type OHLCVRow } from '@/lib/phantom-flow-engine';

export const maxDuration = 30;

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YFResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open:   number[];
          high:   number[];
          low:    number[];
          close:  number[];
          volume: number[];
        }>;
      };
    }>;
    error?: unknown;
  };
}

// Special symbols that need exact Yahoo Finance tickers
const SPECIAL_SYMBOLS: Record<string, string> = {
  NIFTY:     '^NSEI',
  NIFTY50:   '^NSEI',
  BANKNIFTY: '^NSEBANK',
  SENSEX:    '^BSESN',
  NIFTYIT:   '^CNXIT',
};

function toYFSymbol(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (SPECIAL_SYMBOLS[upper]) return SPECIAL_SYMBOLS[upper];
  if (upper.startsWith('^') || upper.includes('.')) return upper;
  return upper + '.NS';
}

async function fetchBars(yfSymbol: string, interval: string, range: string): Promise<OHLCVRow[] | null> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9_000);
  try {
    const url = `${YF_BASE}/${encodeURIComponent(yfSymbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache:   'no-store',
      signal:  ctrl.signal,
    });
    if (!res.ok) return null;
    const json: YFResponse = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const ts    = result.timestamp;
    const quote = result.indicators.quote[0];
    const rows: OHLCVRow[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = quote.open[i], h = quote.high[i], l = quote.low[i], c = quote.close[i], v = quote.volume[i];
      if (c == null || isNaN(c)) continue;
      rows.push({ date: new Date(ts[i] * 1000), open: o ?? c, high: h ?? c, low: l ?? c, close: c, volume: v ?? 0 });
    }
    return rows.length >= 30 ? rows : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawSymbol = searchParams.get('symbol') ?? 'RELIANCE';
  const tf        = searchParams.get('tf') === '1wk' ? '1wk' : '1d';
  const range     = tf === '1wk' ? '2y' : '1y';

  const yfSymbol = toYFSymbol(rawSymbol);
  const bars     = await fetchBars(yfSymbol, tf, range);

  if (!bars) {
    return NextResponse.json(
      { error: `Could not fetch data for "${rawSymbol}" (tried ${yfSymbol}). Check the symbol and try again.` },
      { status: 422 },
    );
  }

  const result = runPhantomFlow(rawSymbol.toUpperCase(), bars);
  return NextResponse.json({ result, scannedAt: new Date().toISOString() });
}
