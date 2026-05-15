import { NextRequest, NextResponse } from 'next/server';
import { dhanHeaders, getScripAndSeg } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol      = (searchParams.get('symbol') ?? 'NIFTY').toUpperCase();
  const expiry      = searchParams.get('expiry') ?? '';
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }
  if (!expiry) {
    return NextResponse.json({ error: 'expiry required' }, { status: 400 });
  }

  const meta = getScripAndSeg(symbol);
  if (!meta) return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 });

  const res = await fetch('https://api.dhan.co/v2/optionchain', {
    method: 'POST',
    headers: dhanHeaders(clientId, accessToken),
    body: JSON.stringify({ UnderlyingScrip: meta.scrip, UnderlyingSeg: meta.seg, Expiry: expiry }),
  });

  const raw = await res.json() as Record<string, unknown>;

  // Extract first 2 strikes from the oc map so we can see the exact field names
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const oc   = (data.oc ?? {}) as Record<string, Record<string, unknown>>;
  const strikeSample = Object.entries(oc).slice(0, 2).map(([k, v]) => ({ strike: k, raw: v }));

  return NextResponse.json({
    httpStatus: res.status,
    topLevelKeys: Object.keys(raw),
    dataKeys: Object.keys(data),
    underlyingPrice: data.last_price ?? data.underlyingValue ?? data.underlying_price,
    strikeSample,
  });
}
