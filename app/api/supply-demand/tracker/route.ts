import { NextResponse } from 'next/server';
import { list, head } from '@vercel/blob';
import type { SupplyDemandTracker } from '@/lib/supply-demand-tracker';
import { EMPTY_TRACKER } from '@/lib/supply-demand-tracker';

export const maxDuration = 10;

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(EMPTY_TRACKER);
  }
  try {
    const { blobs } = await list({ prefix: 'sd-tracker.json', limit: 1 });
    if (blobs.length === 0) return NextResponse.json(EMPTY_TRACKER);
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json(EMPTY_TRACKER);
    const data: SupplyDemandTracker = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(EMPTY_TRACKER);
  }
}
