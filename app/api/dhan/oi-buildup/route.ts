import { NextRequest, NextResponse } from 'next/server';
import { fetchFuturesQuotesFromNSE } from '@/lib/dhan-api';

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
  scripMasterSize:  number;
  availableExpiries: string[];
  fetchedAt:        string;
  error?:           string;
}

export async function GET(req: NextRequest) {
  const expiry = req.nextUrl.searchParams.get('expiry') ?? undefined;

  const { quotes, availableExpiries, scripMasterSize, rawQuotesSize, loadError } =
    await fetchFuturesQuotesFromNSE(expiry);

  let error: string | undefined;
  if (scripMasterSize === 0) {
    error = `Futures OI data unavailable: ${loadError || 'API did not respond'}`;
  } else if (rawQuotesSize === 0) {
    error = 'No futures data returned. Market may be closed or APIs unavailable.';
  }

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
    fetched:         quotes.size,
    scripMasterSize,
    availableExpiries,
    fetchedAt:       new Date().toISOString(),
    ...(error ? { error } : {}),
  } satisfies OIBuildupData);
}
