import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export const maxDuration = 10;

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured.' },
      { status: 503 }
    );
  }

  let blobs;
  try {
    ({ blobs } = await list({ prefix: 'sd-latest.json', limit: 1 }));
  } catch (err) {
    return NextResponse.json(
      { error: `Blob list failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  if (blobs.length === 0) {
    return NextResponse.json(
      { error: 'No snapshot uploaded yet. Run the local script with --upload.' },
      { status: 404 }
    );
  }

  try {
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: `Could not fetch blob: HTTP ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read blob: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
