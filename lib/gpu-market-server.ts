import { unstable_cache } from 'next/cache';
import { GPU_DATASET_URL, summarizeGpuMarket, type GpuMarket, type GpuPriceRow } from './gpu-market';

// The dataset (~4 MB) updates daily; only the ~4 KB summary is cached.
// A failed fetch throws and is not cached, so the next request retries.
export const getGpuMarket = unstable_cache(
  async (): Promise<GpuMarket> => {
    const res = await fetch(GPU_DATASET_URL, {
      cache: 'no-store',
      headers: { 'User-Agent': 'StockScreener research dashboard' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`GetDeploying dataset HTTP ${res.status}`);
    const { data } = await res.json() as { data: GpuPriceRow[] };
    return summarizeGpuMarket(data);
  },
  ['gpu-market'],
  { revalidate: 6 * 3600 },
);
