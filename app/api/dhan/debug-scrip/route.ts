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

    const col = (name: string) => headers.indexOf(name);
    const iSeg     = col('SEM_SEGMENT');
    const iInstr   = col('SEM_INSTRUMENT_NAME');
    const iTrading = col('SEM_TRADING_SYMBOL');

    // Find first 3 NSE_FO option rows for the symbol
    const nseRows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length && nseRows.length < 3; i++) {
      if (!lines[i].includes(symbol)) continue;
      const cols = lines[i].split(',');
      if (cols[iSeg]?.trim() !== 'NSE_FO') continue;
      const instr = cols[iInstr]?.trim() ?? '';
      if (instr !== 'OPTIDX' && instr !== 'OPTSTK') continue;
      if (!cols[iTrading]?.toUpperCase().startsWith(symbol)) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim().replace(/['"]/g, '') ?? ''; });
      nseRows.push(obj);
    }

    // Test historical API with first NSE row's security ID
    let historyTest: Record<string, unknown> = {};
    if (clientId && accessToken && nseRows[0]) {
      const secId  = nseRows[0]['SEM_SMST_SECURITY_ID'];
      const instr  = nseRows[0]['SEM_INSTRUMENT_NAME'];
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

    return NextResponse.json({ nseRowCount: nseRows.length, nseRows, historyTest });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
