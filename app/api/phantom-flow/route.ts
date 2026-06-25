import { NextRequest, NextResponse } from 'next/server';
import { runPhantomFlow, type OHLCVRow } from '@/lib/phantom-flow-engine';
import { UNIVERSE } from '@/lib/universe';

export const maxDuration = 60;

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

// ── Batch scan ────────────────────────────────────────────────────────────────

export interface BatchScanItem {
  symbol:          string;
  company:         string;
  currentPrice:    number;
  bias:            'Bullish' | 'Bearish' | 'Neutral';
  trend:           'Bullish' | 'Bearish' | 'Consolidating';
  confluenceScore: number;
  zone:            'Premium' | 'Equilibrium' | 'Discount';
  rsi:             number;
  recentEvent:     string | null;
  poc:             number;
}

async function runBatchScan(): Promise<BatchScanItem[]> {
  const CHUNK = 8;
  const results: BatchScanItem[] = [];

  for (let i = 0; i < UNIVERSE.length; i += CHUNK) {
    const chunk = UNIVERSE.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(
      chunk.map(async (stock) => {
        const bars = await fetchBars(toYFSymbol(stock.nse_symbol), '1d', '1y');
        if (!bars) return null;
        const r = runPhantomFlow(stock.nse_symbol, bars);
        return {
          symbol:          stock.nse_symbol,
          company:         stock.company,
          currentPrice:    r.currentPrice,
          bias:            r.summary.bias,
          trend:           r.marketStructure.trend,
          confluenceScore: r.tradeSetup.confluenceScore,
          zone:            r.marketStructure.zone,
          rsi:             +r.momentum.rsi.toFixed(1),
          recentEvent:     r.marketStructure.recentEvent
            ? `${r.marketStructure.recentEvent.type} ${r.marketStructure.recentEvent.direction}`
            : null,
          poc: r.volumeProfile.poc,
        } satisfies BatchScanItem;
      }),
    );
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) results.push(s.value);
    }
  }

  return results.sort((a, b) => b.confluenceScore - a.confluenceScore);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode      = searchParams.get('mode');
  const rawSymbol = searchParams.get('symbol') ?? 'RELIANCE';
  const tf        = searchParams.get('tf') === '1wk' ? '1wk' : '1d';

  // ── Batch scan ───────────────────────────────────────────────────────────
  if (mode === 'batch') {
    const items = await runBatchScan();
    return NextResponse.json({ items, scannedAt: new Date().toISOString() });
  }

  // ── Single symbol ────────────────────────────────────────────────────────
  const range    = tf === '1wk' ? '2y' : '1y';
  const yfSymbol = toYFSymbol(rawSymbol);
  const bars     = await fetchBars(yfSymbol, tf, range);

  if (!bars) {
    return NextResponse.json(
      { error: `Could not fetch data for "${rawSymbol}" (tried ${yfSymbol}). Check the symbol and try again.` },
      { status: 422 },
    );
  }

  const result = runPhantomFlow(rawSymbol.toUpperCase(), bars);

  // Multi-timeframe: when user selects 1D, also run weekly structure
  let weeklyResult: null | {
    trend:           'Bullish' | 'Bearish' | 'Consolidating';
    zone:            'Premium' | 'Equilibrium' | 'Discount';
    confluenceScore: number;
    recentEvent:     string | null;
    poc:             number;
    vah:             number;
    val:             number;
  } = null;

  if (tf === '1d') {
    const weeklyBars = await fetchBars(yfSymbol, '1wk', '3y');
    if (weeklyBars) {
      const wr = runPhantomFlow(rawSymbol.toUpperCase(), weeklyBars);
      weeklyResult = {
        trend:           wr.marketStructure.trend,
        zone:            wr.marketStructure.zone,
        confluenceScore: wr.tradeSetup.confluenceScore,
        recentEvent:     wr.marketStructure.recentEvent
          ? `${wr.marketStructure.recentEvent.type} ${wr.marketStructure.recentEvent.direction} @ ${wr.marketStructure.recentEvent.price.toFixed(2)}`
          : null,
        poc: wr.volumeProfile.poc,
        vah: wr.volumeProfile.vah,
        val: wr.volumeProfile.val,
      };
    }
  }

  return NextResponse.json({ result, weeklyResult, scannedAt: new Date().toISOString() });
}
