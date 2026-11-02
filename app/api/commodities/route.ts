import { NextResponse } from 'next/server';
import { readCommodities } from '@/lib/commodities/store';

// The stored feed keeps ~10 years of daily bars for seasonality; the page only charts the
// last ~3 years, so trim them to keep the response small.
export async function GET() {
  const feed = await readCommodities();
  if (!feed) return NextResponse.json({ error: 'Commodity data not built yet' }, { status: 503 });
  const commodities = Object.fromEntries(Object.entries(feed.commodities).map(([k, c]) => [k, { ...c, bars: c.bars.slice(-800) }]));
  return NextResponse.json({ ...feed, commodities });
}
