import { NextRequest, NextResponse } from 'next/server';
import { dhanHeaders, fetchDhanOptionChain } from '@/lib/dhan-api';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol      = (searchParams.get('symbol') ?? 'BHEL').toUpperCase();
  const expiry      = searchParams.get('expiry') ?? '';
  const clientId    = searchParams.get('cid') ?? '';
  const accessToken = searchParams.get('tok') ?? '';

  try {
    const csvRes = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', { cache: 'no-store' });
    if (!csvRes.ok) return NextResponse.json({ error: `CSV HTTP ${csvRes.status}` });

    const text    = await csvRes.text();
    const lines   = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
    const iSeg    = headers.indexOf('SEM_SEGMENT');

    // 1. Collect ALL unique segments in the entire CSV (first 50k rows)
    const allSegments = new Set<string>();
    for (let i = 1; i < Math.min(lines.length, 50_000); i++) {
      const cols = lines[i].split(',');
      const seg = cols[iSeg]?.trim();
      if (seg) allSegments.add(seg);
    }

    // 2. Show first 3 rows for each unique segment (to understand formats)
    const segmentSamples: Record<string, Record<string, string>[]> = {};
    for (const seg of allSegments) {
      segmentSamples[seg] = [];
    }
    for (let i = 1; i < Math.min(lines.length, 50_000); i++) {
      const cols = lines[i].split(',');
      const seg = cols[iSeg]?.trim() ?? '';
      if (segmentSamples[seg] && segmentSamples[seg].length < 2) {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim().replace(/['"]/g, '') ?? ''; });
        segmentSamples[seg].push(obj);
      }
    }

    // 3. Find first BSE option row for the symbol (segment D) — to test historical API
    const iInstr   = headers.indexOf('SEM_INSTRUMENT_NAME');
    const iSecId   = headers.indexOf('SEM_SMST_SECURITY_ID');
    let bseOptionRow: Record<string, string> | null = null;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].includes(symbol)) continue;
      const cols = lines[i].split(',');
      if (cols[iSeg]?.trim() !== 'D') continue;
      const instr = cols[iInstr]?.trim() ?? '';
      if (instr !== 'OPTSTK' && instr !== 'OPTIDX') continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim().replace(/['"]/g, '') ?? ''; });
      bseOptionRow = obj;
      break;
    }

    // 4. Test historical API: try BSE segment with BSE option security ID
    let bseHistTest: Record<string, unknown> = {};
    if (clientId && accessToken && bseOptionRow) {
      const secId = bseOptionRow['SEM_SMST_SECURITY_ID'];
      const instr = bseOptionRow['SEM_INSTRUMENT_NAME'];
      const d = new Date(); d.setDate(d.getDate() - 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      const dateStr = d.toISOString().split('T')[0];

      for (const seg of ['BSE_FO', 'BSE_EQ', 'D']) {
        const hRes = await fetch('https://api.dhan.co/v2/charts/historical', {
          method: 'POST',
          headers: dhanHeaders(clientId, accessToken),
          body: JSON.stringify({ securityId: secId, exchangeSegment: seg, instrument: instr, expiryCode: 0, fromDate: dateStr, toDate: dateStr }),
        });
        const hText = await hRes.text();
        let hJson: unknown; try { hJson = JSON.parse(hText); } catch { hJson = hText.slice(0, 300); }
        bseHistTest[seg] = { status: hRes.status, response: hJson };
      }
      bseHistTest['secId'] = secId;
      bseHistTest['instr'] = instr;
      bseHistTest['dateStr'] = dateStr;
    }

    // 5. Fetch live option chain and check if rawSample has security ID fields
    let rawSample: Record<string, unknown> | null = null;
    if (clientId && accessToken) {
      const useExpiry = expiry || '2025-05-29'; // adjust if needed
      const { rawSample: rs } = await fetchDhanOptionChain(symbol, useExpiry, clientId, accessToken);
      rawSample = rs ?? null;
    }

    return NextResponse.json({
      totalLines: lines.length,
      allSegments: [...allSegments],
      segmentSamples,
      bseOptionRow,
      bseHistTest,
      rawSample,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
