import { NextResponse } from 'next/server';
import { fetchNseCookies, fetchNseOptionOIBulk } from '@/lib/dhan-api';
import type { OIScreenerRow } from '@/lib/oi-screener';

export const maxDuration = 30;

// ── NSE-backed OI screener ────────────────────────────────────────────────────
// Replaced the original per-symbol Dhan option-chain approach (200 sequential
// calls → always timed out on Vercel) with NSE's bulk CE/PE OI endpoint — same
// data source already used by the OI Buildup tab. Single call, ~5s, no auth.

export async function GET() {
  const cookies = await fetchNseCookies();
  const { ceMap, peMap } = await fetchNseOptionOIBulk(cookies);

  if (ceMap.size === 0 && peMap.size === 0) {
    return NextResponse.json(
      { error: 'NSE option OI data unavailable — NSE may be blocking server-side requests. Try again in a few seconds.' },
      { status: 502 },
    );
  }

  const symbols = new Set([...ceMap.keys(), ...peMap.keys()]);
  const rows: OIScreenerRow[] = [];

  for (const symbol of symbols) {
    const ce = ceMap.get(symbol);
    const pe = peMap.get(symbol);
    const ceOI    = ce?.latestOI   ?? 0;
    const peOI    = pe?.latestOI   ?? 0;
    const ceOIChg = ce?.changeInOI ?? 0;
    const peOIChg = pe?.changeInOI ?? 0;
    const totalOI = ceOI + peOI;
    if (totalOI === 0) continue;

    const netOIChg    = peOIChg - ceOIChg;
    const netOIChgPct = (netOIChg / totalOI) * 100;

    rows.push({ symbol, expiry: 'Aggregate', ceOI, peOI, ceOIChg, peOIChg, netOIChg, netOIChgPct, totalOI });
  }

  rows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);

  return NextResponse.json({
    all:        rows,
    scanned:    rows.length,
    scannedAt:  new Date().toISOString(),
  });
}
