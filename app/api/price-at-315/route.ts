import { NextRequest, NextResponse }      from 'next/server';
import { fetchEquityIntraday315 }         from '@/lib/dhan-api';

export const dynamic     = 'force-dynamic';
export const maxDuration = 55;

// Returns the close price of the 1-minute candle at 3:15 PM IST for each symbol.
// This is the ACTUAL traded price at 3:15 PM -- not the official closing price
// set by the closing-session auction at 3:30-3:40 PM.
//
// Source priority:
//   1. Dhan /v2/charts/intraday (if x-dhan-* headers present)
//   2. Yahoo Finance v8/finance/chart?interval=1m (no auth needed)

// ── Yahoo Finance 1-min fallback ──────────────────────────────────────────────

const YF_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com/',
};

const INDEX_YF: Record<string, string> = {
  NIFTY:      '^NSEI',
  NIFTY50:    '^NSEI',
  BANKNIFTY:  '^NSEBANK',
  FINNIFTY:   'NIFTY_FIN_SERVICE.NS',
  MIDCPNIFTY: 'NIFTY_MIDCAP_SELECT.NS',
  SENSEX:     '^BSESN',
};

function toYF(sym: string): string {
  return INDEX_YF[sym.toUpperCase()] ?? `${sym.toUpperCase()}.NS`;
}

function ist315Unix(): number {
  const istMs  = Date.now() + (5 * 3600 + 30 * 60) * 1000;
  const ist    = new Date(istMs);
  const yy     = ist.getUTCFullYear();
  const mm     = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd     = String(ist.getUTCDate()).padStart(2, '0');
  return Math.floor(new Date(`${yy}-${mm}-${dd}T09:45:00Z`).getTime() / 1000);
}

async function yfAt315(yfSym: string, target: number): Promise<number | null> {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res   = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?interval=1m&range=1d`,
      { headers: YF_HEADERS, cache: 'no-store', signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    const json = await res.json() as {
      chart?: { result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }> };
    };

    const result     = json?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp ?? [];
    const closes     = result.indicators?.quote?.[0]?.close ?? [];

    let bestIdx = -1; let bestDiff = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const diff = Math.abs(timestamps[i] - target);
      if (diff < bestDiff && diff <= 120) { bestDiff = diff; bestIdx = i; }
    }
    if (bestIdx < 0) return null;
    const price = closes[bestIdx];
    return price != null && price > 0 ? Math.round(price * 100) / 100 : null;
  } catch { return null; }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const raw        = req.nextUrl.searchParams.get('symbols') ?? '';
  const nseSymbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!nseSymbols.length) return NextResponse.json({ prices: {} });

  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  // 1. Dhan intraday (authenticated, most accurate for NSE)
  if (clientId && accessToken) {
    const dhanMap = await fetchEquityIntraday315(nseSymbols, clientId, accessToken);
    if (dhanMap.size > 0) {
      const prices: Record<string, number> = {};
      for (const [sym, price] of dhanMap) prices[sym] = price;
      // If we got most symbols, return; otherwise supplement with Yahoo below
      if (dhanMap.size >= nseSymbols.length * 0.8) {
        return NextResponse.json({ prices, source: 'dhan', targetTime: '15:15 IST' });
      }
      // Partial result — supplement missing ones via Yahoo Finance
      const missing = nseSymbols.filter(s => !dhanMap.has(s));
      const target  = ist315Unix();
      const yf      = await Promise.allSettled(
        missing.map(async s => ({ s, price: await yfAt315(toYF(s), target) }))
      );
      for (const r of yf) {
        if (r.status === 'fulfilled' && r.value.price !== null)
          prices[r.value.s] = r.value.price;
      }
      return NextResponse.json({ prices, source: 'dhan+yf', targetTime: '15:15 IST' });
    }
  }

  // 2. Yahoo Finance 1-min fallback (no auth needed)
  const target  = ist315Unix();
  const results = await Promise.allSettled(
    nseSymbols.map(async nseSym => ({ nseSym, price: await yfAt315(toYF(nseSym), target) }))
  );
  const prices: Record<string, number> = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.price !== null)
      prices[r.value.nseSym] = r.value.price;
  }
  return NextResponse.json({ prices, source: 'yf', targetTime: '15:15 IST' });
}
