import { NextRequest, NextResponse } from 'next/server';
import { fetchFuturesQuotes, ALL_FNO_SYMBOLS } from '@/lib/dhan-api';

export const maxDuration = 55;

export interface OIBuildupRow {
  symbol:      string;
  expiry:      string;
  price:       number;
  changePct:   number;
  oi:          number;
  oiChangePct: number;
}

export interface OIBuildupData {
  lb:               OIBuildupRow[];
  sb:               OIBuildupRow[];
  sc:               OIBuildupRow[];
  lu:               OIBuildupRow[];
  total:            number;
  fetched:          number;
  availableExpiries: string[];
  fetchedAt:        string;
  error?:           string;
}

const ALL_SCREEN_SYMBOLS = [
  ...ALL_FNO_SYMBOLS.indices,
  ...ALL_FNO_SYMBOLS.stocks,
];

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json(
      { error: 'Missing Dhan credentials. Configure them in Settings.' },
      { status: 401 },
    );
  }

  const expiry = req.nextUrl.searchParams.get('expiry') ?? undefined;
  const { quotes, availableExpiries } = await fetchFuturesQuotes(
    ALL_SCREEN_SYMBOLS, clientId, accessToken, expiry,
  );

  const lb: OIBuildupRow[] = [];
  const sb: OIBuildupRow[] = [];
  const sc: OIBuildupRow[] = [];
  const lu: OIBuildupRow[] = [];

  for (const q of quotes.values()) {
    const row: OIBuildupRow = {
      symbol: q.symbol, expiry: q.expiry,
      price: q.price, changePct: q.changePct,
      oi: q.oi, oiChangePct: q.oiChangePct,
    };
    if      (q.changePct > 0 && q.oiChangePct > 0) lb.push(row);
    else if (q.changePct < 0 && q.oiChangePct > 0) sb.push(row);
    else if (q.changePct > 0 && q.oiChangePct < 0) sc.push(row);
    else if (q.changePct < 0 && q.oiChangePct < 0) lu.push(row);
  }

  lb.sort((a, b) => b.oiChangePct - a.oiChangePct);
  sb.sort((a, b) => b.oiChangePct - a.oiChangePct);
  sc.sort((a, b) => a.oiChangePct - b.oiChangePct);
  lu.sort((a, b) => a.oiChangePct - b.oiChangePct);

  const total = lb.length + sb.length + sc.length + lu.length;

  return NextResponse.json({
    lb, sb, sc, lu, total,
    fetched: quotes.size,
    availableExpiries,
    fetchedAt: new Date().toISOString(),
  } satisfies OIBuildupData);
}
