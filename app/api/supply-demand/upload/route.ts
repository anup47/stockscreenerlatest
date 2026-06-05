import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import type { SupplyDemandSnapshot } from '@/lib/supply-demand-types';

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
  if (!Array.isArray(snapshot?.themes) || snapshot.themes.length < 4) {
    return NextResponse.json(
      { error: 'Invalid snapshot: themes must be an array with at least 4 entries' },
      { status: 422 }
    );
  }

  const blob = await put('sd-latest.json', JSON.stringify(body), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });

  return NextResponse.json({
    url:        blob.url,
    uploadedAt: new Date().toISOString(),
    themes:     snapshot.themes.length,
  });
}
