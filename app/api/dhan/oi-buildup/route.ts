import { NextResponse } from 'next/server';

export const maxDuration = 15;

export interface OIBuildupRow {
  symbol:      string;
  price:       number;
  changePct:   number;  // price % change
  oi:          number;  // open interest (contracts)
  oiChangePct: number;  // OI % change (positive = buildup, negative = reduction)
}

export interface OIBuildupData {
  lb:        OIBuildupRow[];  // Long Buildup  : price↑ + OI↑
  sb:        OIBuildupRow[];  // Short Buildup : price↓ + OI↑
  sc:        OIBuildupRow[];  // Short Covering: price↑ + OI↓
  lu:        OIBuildupRow[];  // Long Unwinding: price↓ + OI↓
  fetchedAt: string;
  total:     number;
}

export async function GET() {
  try {
    const body = {
      filter: [
        { left: 'exchange',      operation: 'equal',   right: 'NSE' },
        { left: 'is_primary',    operation: 'equal',   right: true  },
        { left: 'open_interest', operation: 'greater', right: 0     },
      ],
      options: {},
      symbols: { query: { types: [] }, tickers: [] },
      columns: ['name', 'close', 'change', 'open_interest', 'open_interest_change'],
      sort:    { sortBy: 'open_interest', sortOrder: 'desc' },
      range:   [0, 500],
    };

    const res = await fetch('https://scanner.tradingview.com/india/scan', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `TradingView scanner returned ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json() as { data?: { s: string; d: unknown[] }[] };
    const rows = json.data ?? [];

    const lb: OIBuildupRow[] = [];
    const sb: OIBuildupRow[] = [];
    const sc: OIBuildupRow[] = [];
    const lu: OIBuildupRow[] = [];

    for (const row of rows) {
      const d = row.d;
      const symbol      = String(d[0] ?? row.s?.replace('NSE:', '') ?? '').trim();
      const price       = Number(d[1] ?? 0);
      const changePct   = Number(d[2] ?? 0);   // price % change
      const oi          = Number(d[3] ?? 0);   // open interest
      const oiChangePct = Number(d[4] ?? 0);   // OI % change from TradingView

      if (!symbol || price === 0 || oi === 0) continue;

      const entry: OIBuildupRow = { symbol, price, changePct, oi, oiChangePct };

      if      (changePct > 0 && oiChangePct > 0) lb.push(entry); // Long Buildup
      else if (changePct < 0 && oiChangePct > 0) sb.push(entry); // Short Buildup
      else if (changePct > 0 && oiChangePct < 0) sc.push(entry); // Short Covering
      else if (changePct < 0 && oiChangePct < 0) lu.push(entry); // Long Unwinding
    }

    // Sort each bucket
    lb.sort((a, b) => b.oiChangePct - a.oiChangePct);  // highest OI buildup first
    sb.sort((a, b) => b.oiChangePct - a.oiChangePct);  // highest OI buildup first
    sc.sort((a, b) => a.oiChangePct - b.oiChangePct);  // most OI reduction first
    lu.sort((a, b) => a.oiChangePct - b.oiChangePct);  // most OI reduction first

    return NextResponse.json({
      lb, sb, sc, lu,
      total:     lb.length + sb.length + sc.length + lu.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
