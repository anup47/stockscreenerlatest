import { NextRequest, NextResponse } from 'next/server';
import { dhanHeaders } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol      = (searchParams.get('symbol') ?? 'NIFTY').toUpperCase();
  const clientId    = req.headers.get('x-dhan-client-id')    ?? searchParams.get('cid') ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? searchParams.get('tok') ?? '';

  try {
    // ── 1. Scrip master: get first matching option row ───────────────────────
    const csvRes = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', { cache: 'no-store' });
    if (!csvRes.ok) return NextResponse.json({ error: `CSV HTTP ${csvRes.status}` });

    const text    = await csvRes.text();
    const lines   = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));

    const col = (name: string) => headers.indexOf(name);
    const iSecId   = col('SEM_SMST_SECURITY_ID');
    const iSeg     = col('SEM_SEGMENT');
    const iInstr   = col('SEM_INSTRUMENT_NAME');
    const iExpiry  = col('SEM_EXPIRY_DATE');
    const iStrike  = col('SEM_STRIKE_PRICE');
    const iOptType = col('SEM_OPTION_TYPE');
    const iUnderly = col('SM_SYMBOL_NAME');

    let firstRow: Record<string, string> | null = null;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(symbol)) continue;
      const cols = line.split(',');
      if (cols[iSeg]?.trim() !== 'NSE_FO') continue;
      const instr = cols[iInstr]?.trim() ?? '';
      if (instr !== 'OPTIDX' && instr !== 'OPTSTK') continue;
      const underlying = cols[iUnderly]?.trim().replace(/['"]/g, '') ?? '';
      if (underlying !== symbol) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim().replace(/['"]/g, '') ?? ''; });
      firstRow = obj;
      break;
    }

    if (!firstRow || !clientId || !accessToken) {
      return NextResponse.json({ headers, foundRow: firstRow, note: 'Add ?cid=&tok= to test APIs' });
    }

    const secId      = firstRow['SEM_SMST_SECURITY_ID'];
    const instrument = firstRow['SEM_INSTRUMENT_NAME'];

    const d = new Date();
    d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    const dateStr = d.toISOString().split('T')[0];

    // ── 2. Test A: historical API ────────────────────────────────────────────
    const hRes = await fetch('https://api.dhan.co/v2/charts/historical', {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({
        securityId: secId,
        exchangeSegment: 'NSE_FO',
        instrument,
        expiryCode: 0,
        fromDate: dateStr,
        toDate: dateStr,
      }),
    });
    const hText = await hRes.text();
    let hJson: unknown;
    try { hJson = JSON.parse(hText); } catch { hJson = hText.slice(0, 500); }

    // ── 3. Test B: market feed OHLC ──────────────────────────────────────────
    const mRes = await fetch('https://api.dhan.co/v2/marketfeed/ohlc', {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({ NSE_FO: [secId] }),
    });
    const mText = await mRes.text();
    let mJson: unknown;
    try { mJson = JSON.parse(mText); } catch { mJson = mText.slice(0, 500); }

    // ── 4. Test C: market feed full quote ────────────────────────────────────
    const qRes = await fetch('https://api.dhan.co/v2/marketfeed/quote', {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({ NSE_FO: [secId] }),
    });
    const qText = await qRes.text();
    let qJson: unknown;
    try { qJson = JSON.parse(qText); } catch { qJson = qText.slice(0, 500); }

    return NextResponse.json({
      scripRow: firstRow,
      testDate: dateStr,
      historicalAPI: { status: hRes.status, response: hJson },
      marketFeedOHLC: { status: mRes.status, response: mJson },
      marketFeedQuote: { status: qRes.status, response: qJson },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
