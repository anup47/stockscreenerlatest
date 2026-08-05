import { NextRequest, NextResponse } from 'next/server';
import { loadNseEqMaster }           from '@/lib/dhan-api';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

// Debug endpoint — returns raw Dhan intraday response for one symbol.
// Usage: /api/debug/dhan-intraday?symbol=AXISBANK&date=2026-08-04
// Pass x-dhan-client-id + x-dhan-access-token headers (set via Dhan settings in the app).

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'AXISBANK').toUpperCase();
  const date   =  req.nextUrl.searchParams.get('date')   ?? (() => {
    // default: previous weekday
    const istMs = Date.now() + (5 * 3600 + 30 * 60) * 1000;
    const d     = new Date(istMs);
    do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
  })();

  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';
  if (!clientId || !accessToken)
    return NextResponse.json({ error: 'Dhan credentials required — configure in Settings first' });

  const master = await loadNseEqMaster();
  const secId  = master.get(symbol);
  if (!secId)
    return NextResponse.json({ error: `Symbol ${symbol} not found in NSE EQ master` });

  const body = {
    securityId:      String(secId),
    exchangeSegment: 'NSE_EQ',
    instrument:      'EQUITY',
    interval:        '1',
    fromDate:        date,
    toDate:          date,
  };

  const res  = await fetch('https://api.dhan.co/v2/charts/intraday', {
    method:  'POST',
    headers: { 'access-token': accessToken, 'client-id': clientId, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const raw       = await res.json() as Record<string, unknown>;
  const fieldKeys = Object.keys(raw);
  const lengths   = Object.fromEntries(
    fieldKeys.map(k => [k, Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : typeof raw[k]])
  );

  // Extract last 10 candles around 3:15 PM IST if data is available
  const target315Sec = Math.floor(new Date(`${date}T09:45:00Z`).getTime() / 1000);
  const tsField = ['start_Time','startTime','timestamp','time','t'].find(f => Array.isArray(raw[f]));
  const clField = ['close','Close','c'].find(f => Array.isArray(raw[f]));

  let candles315: object[] = [];
  if (tsField && clField) {
    const rawTs  = raw[tsField] as number[];
    const closes = raw[clField] as (number | null)[];
    const isMs   = rawTs.length > 0 && rawTs[0] > 1e12;
    candles315 = rawTs
      .map((ts, i) => ({
        idx: i,
        ts_raw: ts,
        ts_sec: isMs ? Math.floor(ts / 1000) : ts,
        ist_time: new Date(((isMs ? Math.floor(ts / 1000) : ts) + (5 * 3600 + 30 * 60)) * 1000).toISOString().slice(11, 19),
        close: closes[i],
        diff_from_315s: (isMs ? Math.floor(ts / 1000) : ts) - target315Sec,
      }))
      .filter(c => Math.abs(c.diff_from_315s) <= 600) // ±10 min window
      .slice(-15);
  }

  return NextResponse.json({
    symbol, secId, date, request_body: body,
    http_status: res.status,
    field_keys: fieldKeys,
    field_lengths: lengths,
    ts_field_found: tsField ?? 'NOT FOUND',
    close_field_found: clField ?? 'NOT FOUND',
    target_315_sec: target315Sec,
    candles_around_315: candles315,
  });
}
