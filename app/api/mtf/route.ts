import { NextResponse } from 'next/server';
import { getLeverageHistory } from '@/lib/leverage-server';

// Weekly MTF book (NSE + BSE, ₹ crore), sourced from IndiaMTF.com.
export async function GET() {
  try {
    const h = await getLeverageHistory();
    return NextResponse.json({
      generatedAt: h.generatedAt,
      source: h.sources.mtf,
      weeks: h.weeks.filter(w => w.mtf != null).map(w => ({ week: w.week, date: w.mtfDate, total: w.mtf, nse: w.mtfNse, bse: w.mtfBse })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
