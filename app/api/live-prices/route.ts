import { NextRequest, NextResponse } from 'next/server';

export const dynamic   = 'force-dynamic';
export const maxDuration = 20;

export interface LivePriceQuote {
  price:     number;
  change:    number;
  changePct: number;
}

// NSE symbol → Yahoo Finance symbol
const INDEX_YF: Record<string, string> = {
  NIFTY:      '^NSEI',
  NIFTY50:    '^NSEI',
  BANKNIFTY:  '^NSEBANK',
  FINNIFTY:   'NIFTY_FIN_SERVICE.NS',
  MIDCPNIFTY: 'NIFTY_MIDCAP_SELECT.NS',
  SENSEX:     '^BSESN',
  VIX:        '^INDIAVIX',
};

function toYF(sym: string): string {
  return INDEX_YF[sym.toUpperCase()] ?? `${sym.toUpperCase()}.NS`;
}

const YF_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com/',
};

// Fetch a single symbol via YF v8 chart API (works from server without crumb)
async function fetchOne(yfSym: string): Promise<{ price: number; change: number; changePct: number } | null> {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6_000);
    const res   = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?interval=1d&range=1d`,
      { headers: YF_HEADERS, cache: 'no-store', signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json() as {
      chart?: { result?: Array<{ meta?: {
        regularMarketPrice?:         number;
        regularMarketPreviousClose?: number;
        chartPreviousClose?:         number;
        regularMarketChange?:        number;
        regularMarketChangePercent?: number;
      } }> };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price     = meta.regularMarketPrice;
    const prevClose = meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? 0;
    const change    = meta.regularMarketChange    ?? (prevClose > 0 ? price - prevClose : 0);
    const changePct = meta.regularMarketChangePercent ?? (prevClose > 0 ? (change / prevClose) * 100 : 0);
    return { price, change, changePct };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw        = req.nextUrl.searchParams.get('symbols') ?? '';
  const nseSymbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!nseSymbols.length) return NextResponse.json({ prices: {} });

  // Fetch all symbols in parallel (v8 chart API — one request per symbol but no crumb needed)
  const results = await Promise.allSettled(
    nseSymbols.map(async (nseSym) => {
      const q = await fetchOne(toYF(nseSym));
      return { nseSym, q };
    })
  );

  const prices: Record<string, LivePriceQuote> = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.q) {
      prices[r.value.nseSym] = r.value.q;
    }
  }

  return NextResponse.json({ prices });
}
