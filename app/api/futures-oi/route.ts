import { NextResponse } from 'next/server';
import { getLeverageHistory } from '@/lib/leverage-server';

// Weekly futures open-interest notional (₹ crore) from the NSE F&O bhavcopy.
export async function GET() {
  try {
    const h = await getLeverageHistory();
    return NextResponse.json({
      generatedAt: h.generatedAt,
      source: h.sources.futures,
      weeks: h.weeks.filter(w => w.fut != null).map(w => ({ week: w.week, date: w.futDate, total: w.fut, stock: w.futStock, index: w.futIndex, final: w.futFinal })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
