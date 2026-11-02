import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { buildCommodities } from '@/lib/commodities/build';
import { readCommoditiesUncached, writeCommodities } from '@/lib/commodities/store';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Vercel cron, daily 09:00 IST (vercel.json). Also callable by hand; without ?force=1 a run
// within 30 minutes of the last one is skipped, so the public URL can't hammer the sources.
export async function GET(req: Request) {
  const prev = await readCommoditiesUncached();
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (!force && prev && Date.now() - Date.parse(prev.updatedAt) < 30 * 60_000) {
    return NextResponse.json({ skipped: true, updatedAt: prev.updatedAt, health: prev.health });
  }
  try {
    const feed = await buildCommodities(prev);
    await writeCommodities(feed);
    revalidateTag('commodities');
    return NextResponse.json({
      updatedAt: feed.updatedAt,
      latest: Object.fromEntries(Object.values(feed.commodities).map(c => [c.code, { ...c.latest, signal: c.signal.label, score: c.signal.score }])),
      health: feed.health,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
