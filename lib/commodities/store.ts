import { unstable_cache } from 'next/cache';
import { readJsonBlob, writeJsonBlob } from '../blob-json';
import type { CommoditiesFeed } from './types';

export const COMMODITIES_KEY = 'commodities.json';

export const readCommoditiesUncached = () => readJsonBlob<CommoditiesFeed | null>(COMMODITIES_KEY, () => null);
export const writeCommodities = (feed: CommoditiesFeed) => writeJsonBlob(COMMODITIES_KEY, feed);

// The feed changes once a day; tagged so the update route can refresh it immediately.
export const readCommodities = unstable_cache(readCommoditiesUncached, ['commodities-feed'], { revalidate: 1800, tags: ['commodities'] });
