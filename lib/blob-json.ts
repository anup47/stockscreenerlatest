import { put, list } from '@vercel/blob';

// JSON documents stored under a fixed Vercel Blob pathname.
export async function readJsonBlob<T>(key: string, empty: () => T): Promise<T> {
  try {
    const { blobs } = await list({ prefix: key });
    if (!blobs.length) return empty();
    // Cache-buster: an overwritten public blob can be served stale by the CDN.
    const res = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: 'no-store' });
    return await res.json() as T;
  } catch {
    return empty();
  }
}

export async function writeJsonBlob(key: string, data: unknown): Promise<void> {
  await put(key, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
  });
}
