import { unstable_cache } from 'next/cache';
import { readJsonBlob } from './blob-json';
import type { LeverageHistory } from './leverage';

// Published by scripts/leverage.mjs on the office PC (NSE archives block Vercel's IPs).
// The series moves at most daily, so an hour of caching costs nothing in freshness.
export const getLeverageHistory = unstable_cache(
  async (): Promise<LeverageHistory> => {
    const h = await readJsonBlob<LeverageHistory | null>('leverage-history.json', () => null);
    if (!h) throw new Error('Leverage history not published yet');
    return h;
  },
  ['leverage-history'],
  { revalidate: 3600 },
);
