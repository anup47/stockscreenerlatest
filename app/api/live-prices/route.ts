import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface YFQuote {
  symbol:                      string;
  regularMarketPrice?:         number;
  regularMarketChange?:        number;
  regularMarketChangePercent?: number;
}

interface YFQuoteResponse {
  quoteResponse?: { result?: YFQuote[] };
}

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

export async function GET(req: NextRequest) {
  const raw        = req.nextUrl.searchParams.get('symbols') ?? '';
  const nseSymbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!nseSymbols.length) return NextResponse.json({ prices: {} });

  // Build forward + reverse maps
  const yfList: string[]           = nseSymbols.map(toYF);
  const yfToNse = new Map<string, string>();
  for (let i = 0; i < nseSymbols.length; i++) yfToNse.set(yfList[i], nseSymbols[i]);

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yfList.join(','))}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;

  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res   = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache:   'no-store',
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ prices: {} });

    const json: YFQuoteResponse = await res.json();
    const results = json.quoteResponse?.result ?? [];

    const prices: Record<string, LivePriceQuote> = {};
    for (const q of results) {
      if (!q.regularMarketPrice) continue;
      const nseSym = yfToNse.get(q.symbol)
        ?? q.symbol.replace(/\.NS$/, '').replace(/^\^/, '');
      prices[nseSym] = {
        price:     q.regularMarketPrice,
        change:    q.regularMarketChange           ?? 0,
        changePct: q.regularMarketChangePercent    ?? 0,
      };
    }

    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json({ prices: {} });
  }
}
