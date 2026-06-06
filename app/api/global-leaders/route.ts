import { NextRequest, NextResponse } from 'next/server';
import { buildLeadersResponse, type Timeframe } from '@/lib/etf-engine';

export const maxDuration = 55;

// ISR cache: Vercel caches each unique URL for this many seconds.
// /api/global-leaders?timeframe=1D → 30 min
// /api/global-leaders?timeframe=1W → 1 hr
// (each query-param combo is a separate cache entry)
export const revalidate = 1800;

const VALID_TIMEFRAMES = new Set<Timeframe>(['1D', '1W', '1M', '3M', '6M', '1Y']);
const VALID_REGIONS    = new Set(['all', 'us', 'europe', 'asia', 'em', 'global', 'india', 'china', 'japan']);
const VALID_TYPES      = new Set(['all', 'etf']);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const timeframe = (searchParams.get('timeframe') ?? '1W').toUpperCase() as Timeframe;
  const region    = (searchParams.get('region')    ?? 'all').toLowerCase();
  const type      = (searchParams.get('type')      ?? 'all').toLowerCase();
  const theme     = searchParams.get('theme') || null;
  const limit     = Math.min(50, Math.max(5, parseInt(searchParams.get('limit') ?? '30', 10)));

  // Input validation
  if (!VALID_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: `Invalid timeframe. Use: ${[...VALID_TIMEFRAMES].join(', ')}` }, { status: 400 });
  }
  if (!VALID_REGIONS.has(region)) {
    return NextResponse.json({ error: `Invalid region. Use: ${[...VALID_REGIONS].join(', ')}` }, { status: 400 });
  }
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'Invalid type. Use: all, etf' }, { status: 400 });
  }

  try {
    const data = await buildLeadersResponse({ timeframe, region, type, theme, limit });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Internal error: ${msg}` }, { status: 500 });
  }
}
