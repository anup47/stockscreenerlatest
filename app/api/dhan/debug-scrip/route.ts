import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = (searchParams.get('symbol') ?? 'BHEL').toUpperCase();
  const expiry = searchParams.get('expiry') ?? '';

  try {
    const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', {
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ error: `CSV fetch failed: HTTP ${res.status}` });

    const text = await res.text();
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));

    // Find all rows for this symbol in NSE_FO
    const iSeg     = headers.indexOf('SEM_SEGMENT');
    const iInstr   = headers.indexOf('SEM_INSTRUMENT_NAME');
    const iUnderly = headers.indexOf('SEM_UNDERLYING_SYMBOL');

    const matchingRows: string[][] = [];
    for (let i = 1; i < lines.length && matchingRows.length < 10; i++) {
      const line = lines[i];
      if (!line.includes(symbol)) continue;
      const cols = line.split(',');
      if (cols[iSeg]?.trim() !== 'NSE_FO') continue;
      const instr = cols[iInstr]?.trim() ?? '';
      if (instr !== 'OPTIDX' && instr !== 'OPTSTK') continue;
      const underlying = cols[iUnderly]?.trim().replace(/['"]/g, '') ?? '';
      if (underlying !== symbol) continue;
      matchingRows.push(cols.map(c => c.trim().replace(/['"]/g, '')));
    }

    // Build a sample row as object for readability
    const sampleObjects = matchingRows.slice(0, 3).map(cols => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
      return obj;
    });

    return NextResponse.json({
      totalLines: lines.length,
      headers,
      symbol,
      expiry,
      matchingRowCount: matchingRows.length,
      sampleRows: sampleObjects,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
