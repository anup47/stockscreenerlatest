import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = (searchParams.get('symbol') ?? 'BHEL').toUpperCase();

  try {
    const csvRes = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', { cache: 'no-store' });
    if (!csvRes.ok) return NextResponse.json({ error: `CSV HTTP ${csvRes.status}` });

    const text    = await csvRes.text();
    const lines   = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));

    // Return the first 5 raw lines that contain the symbol — no filtering at all
    const rawMatches: Record<string, string>[] = [];
    for (let i = 1; i < lines.length && rawMatches.length < 5; i++) {
      if (!lines[i].includes(symbol)) continue;
      const cols = lines[i].split(',');
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = cols[idx]?.trim().replace(/['"]/g, '') ?? '(missing)'; });
      rawMatches.push(obj);
    }

    return NextResponse.json({ headers, totalLines: lines.length, rawMatches });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
