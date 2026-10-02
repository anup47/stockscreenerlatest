import { put, list } from '@vercel/blob';

export interface TargetOverride {
  company: string;
  baseTarget: number | null;
  bullTarget: number | null;
  researchCmp: number | null;
  stance: 'ACCUMULATE' | 'WATCH' | 'AVOID' | null;
  horizon: string | null;
  note: string | null;
  sourceFile: string;
  syncedAt: string;
}

export interface TargetsBlob {
  version: number;
  processedFiles: string[];
  lastSync: string;
  overrides: Record<string, TargetOverride>;
}

export const BLOB_KEY = 'research-targets-overrides.json';

export async function readTargetsBlob(): Promise<TargetsBlob> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return { version: 1, processedFiles: [], lastSync: '', overrides: {} };
    const res = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: 'no-store' });
    return await res.json() as TargetsBlob;
  } catch {
    return { version: 1, processedFiles: [], lastSync: '', overrides: {} };
  }
}

export async function writeTargetsBlob(data: TargetsBlob): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
  });
}
