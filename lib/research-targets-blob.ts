import { unstable_cache } from 'next/cache';
import { readJsonBlob } from './blob-json';

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

// The blob changes about once a day; caching keeps page refreshes from spending a Blob list() op each.
export const readTargetsBlob = unstable_cache(
  () => readJsonBlob<TargetsBlob>('research-targets-overrides.json',
    () => ({ version: 1, processedFiles: [], lastSync: '', overrides: {} })),
  ['research-targets-blob'],
  { revalidate: 600 },
);
