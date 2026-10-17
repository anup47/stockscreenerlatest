import { unstable_cache } from 'next/cache';
import { readJsonBlob } from './blob-json';
import type { GpuMarket } from './gpu-market';

// Published by scripts/gpu-market.mjs on the office PC: GetDeploying blocks Vercel's IPs,
// so the dataset can't be fetched from here. Throws (uncached) until the first publish.
export const getGpuMarket = unstable_cache(
  async (): Promise<GpuMarket> => {
    const market = await readJsonBlob<GpuMarket | null>('gpu-market.json', () => null);
    if (!market) throw new Error('GPU market summary not published yet');
    return market;
  },
  ['gpu-market'],
  { revalidate: 3600 },
);
