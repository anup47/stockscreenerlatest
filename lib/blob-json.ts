import { put, head } from '@vercel/blob';

// JSON documents stored under a fixed Vercel Blob pathname.
// head() is a "simple" Blob operation; list() would count against the smaller advanced-ops quota.
export async function readJsonBlob<T>(key: string, empty: () => T): Promise<T> {
  try {
    const { url } = await head(key);
    // Cache-buster: an overwritten public blob can be served stale by the CDN.
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? await res.json() as T : empty();
  } catch {
    return empty();
  }
}

export async function writeJsonBlob(key: string, data: unknown): Promise<void> {
  await put(key, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
  });
}
