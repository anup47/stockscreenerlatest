import { NextRequest, NextResponse } from 'next/server';
import { dhanHeaders } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol      = (searchParams.get('symbol') ?? 'BHEL').toUpperCase();
  const clientId    = searchParams.get('cid') ?? '';
  const accessToken = searchParams.get('tok') ?? '';

  try {
    const csvRes = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', { cache: 'no-store' });
    if (!csvRes.ok) return NextResponse.json({ error: `CSV HTTP ${csvRes.status}` });

    const text    = await csvRes.text();
    const lines   = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));

    // Show first 5 raw rows that contain the symbol — zero filtering
    const rawRows: Record<string, string>[] = [];
    const segmentsFound = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].includes(symbol)) continue;
      const cols = lines[i].split(',');
      const iSeg = headers.indexOf('SEM_SEGMENT');
      if (iSeg >= 0) segmentsFound.add(cols[iSeg]?.trim() ?? '(empty)');
      if (rawRows.length < 5) {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim().replace(/['"]/g, '') ?? ''; });
        rawRows.push(obj);
      }
      if (rawRows.length >= 5 && segmentsFound.size >= 5) break;
    }

    // Also look specifically for NSE_FO rows
    const nseRows: Record<string, string>[] = [];
    const iSeg     = headers.indexOf('SEM_SEGMENT');
    const iInstr   = headers.indexOf('SEM_INSTRUMENT_NAME');
    const iTrading = headers.indexOf('SEM_TRADING_SYMBOL');
    for (let i = 1; i < lines.length && nseRows.length < 3; i++) {
      if (!lines[i].includes(symbol)) continue;
      const cols = lines[i].split(',');
      const seg = cols[iSeg]?.trim() ?? '';
      if (!seg.includes('NSE') && !seg.includes('FO') && !seg.includes('FNO')) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim().replace(/['"]/g, '') ?? ''; });
      nseRows.push(obj);
    }

    // Test historical API with first NSE row's security ID
    let historyTest: Record<string, unknown> = {};
    const firstNse = nseRows[0];
    if (clientId && accessToken && firstNse) {
      const secId  = firstNse['SEM_SMST_SECURITY_ID'];
      const instr  = firstNse['SEM_INSTRUMENT_NAME'];
      const d = new Date(); d.setDate(d.getDate() - 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      const dateStr = d.toISOString().split('T')[0];

      const hRes = await fetch('https://api.dhan.co/v2/charts/historical', {
        method: 'POST',
        headers: dhanHeaders(clientId, accessToken),
        body: JSON.stringify({ securityId: secId, exchangeSegment: 'NSE_FO', instrument: instr, expiryCode: 0, fromDate: dateStr, toDate: dateStr }),
      });
      const hText = await hRes.text();
      let hJson: unknown; try { hJson = JSON.parse(hText); } catch { hJson = hText.slice(0, 500); }
      historyTest = { secId, instr, dateStr, status: hRes.status, response: hJson };
    }

    return NextResponse.json({
      headers,
      totalLines: lines.length,
      segmentsFound: [...segmentsFound],
      rawRows,      // first 5 rows containing symbol — unfiltered
      nseRows,      // first 3 rows where segment contains NSE/FO/FNO
      colIndexes: { iSeg, iInstr, iTrading },
      historyTest,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
