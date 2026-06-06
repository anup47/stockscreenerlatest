import { NextRequest, NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import type { SupplyDemandSnapshot } from '@/lib/supply-demand-types';
import { mergeIntoTracker, EMPTY_TRACKER } from '@/lib/supply-demand-tracker';
import type { SupplyDemandTracker } from '@/lib/supply-demand-tracker';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = process.env.SD_UPLOAD_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'SD_UPLOAD_SECRET is not configured on this server.' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const snapshot = body as Partial<SupplyDemandSnapshot>;
  if (!Array.isArray(snapshot?.themes) || snapshot.themes.length < 1) {
    return NextResponse.json(
      { error: 'Invalid snapshot: themes must be a non-empty array' },
      { status: 422 }
    );
  }

  try {
    // ── 1. Save latest snapshot ──────────────────────────────────────────────
    const snapshotBlob = await put('sd-latest.json', JSON.stringify(body), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    // ── 2. Load existing tracker, merge new themes, save back ───────────────
    let currentTracker: SupplyDemandTracker = { ...EMPTY_TRACKER };
    try {
      const { blobs } = await list({ prefix: 'sd-tracker.json', limit: 1 });
      if (blobs.length > 0) {
        const res = await fetch(blobs[0].url, { cache: 'no-store' });
        if (res.ok) currentTracker = await res.json() as SupplyDemandTracker;
      }
    } catch { /* start fresh if tracker unreadable */ }

    const updatedTracker = mergeIntoTracker(currentTracker, snapshot.themes);

    await put('sd-tracker.json', JSON.stringify(updatedTracker), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return NextResponse.json({
      url:           snapshotBlob.url,
      uploadedAt:    new Date().toISOString(),
      themes:        snapshot.themes.length,
      trackerStories:updatedTracker.stories.length,
      trackerRuns:   updatedTracker.totalRuns,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
