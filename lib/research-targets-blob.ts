import { list } from '@vercel/blob';

// Written by scripts/sync-research-targets.mjs (local Ollama extraction).
export interface TargetOverride {
  company: string;
  sector?: string | null;
  baseTarget: number | null;
  bullTarget: number | null;
  researchCmp: number | null;
  stance: 'ACCUMULATE' | 'WATCH' | 'AVOID' | null;
  horizon: string | null;
  note: string | null;
  sourceFile: string;
  sourceModified?: string;
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
