import { unstable_cache } from 'next/cache';
import { readJsonBlob } from './blob-json';

// Written hourly by scripts/news-24h.mjs (local fetch + Qwen via Ollama).
export type NewsKind = 'Company' | 'Filing' | 'Deal' | 'Price' | 'Sector' | 'Macro';
export type Sentiment = 'Positive' | 'Negative' | 'Neutral';

export interface NewsItem {
  id: string;
  kind: NewsKind;
  time: string;          // ISO
  tickers: string[];     // stocks the item bears on; [] for market-wide macro
  label: string;         // Ticker column: symbol, sector name, or MACRO
  company: string;
  headline: string;
  source: string;
  link: string;
  summary: string;
  sentiment: Sentiment;
  impact: 1 | 2 | 3 | 4 | 5;
  pending: boolean;      // true = keyword-rule classification, Qwen hasn't reviewed it yet
  relevant: boolean;     // false = Qwen judged it a namesake/unrelated story; hidden in the tab
  detail?: string;
}

export interface NewsStock { symbol: string; company: string; sector: string }

export interface NewsFeed {
  generatedAt: string;
  windowHours: number;
  model: string;
  stocks: NewsStock[];
  items: NewsItem[];
  health: Record<string, string>;
}

export const readNewsFeed = unstable_cache(
  () => readJsonBlob<NewsFeed>('news-24h.json',
    () => ({ generatedAt: '', windowHours: 24, model: '', stocks: [], items: [], health: {} })),
  ['news-24h-feed'],
  { revalidate: 300 },
);
