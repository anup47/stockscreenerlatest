// Commodity Tracker data model. Built daily by lib/commodities/build.ts, stored as one Blob JSON.

export type CommodityCode = 'GOLD' | 'SILVER' | 'ALUMINIUM' | 'ZINC';
export const CODES: CommodityCode[] = ['GOLD', 'SILVER', 'ALUMINIUM', 'ZINC'];

export interface Bar { d: string; o?: number; h?: number; l?: number; c: number }

// One cell of the fundamental sheet. `available: false` means no free automated source exists;
// the UI shows the source name instead of a number rather than inventing one.
export interface Metric {
  key: string;
  label: string;
  value: number | null;
  prev: number | null;        // previous reading, for the daily-change arrow
  unit: string;
  source: string;
  sourceUrl?: string;
  asOf?: string;
  note?: string;
  available: boolean;
  higherIsBullish?: boolean;  // colours the arrow by price impact, not just direction
  frequency?: 'daily' | 'weekly' | 'monthly';
}

// Daily snapshot row for the Excel-like sheet (latest values on each date).
export interface DailyRow {
  date: string;
  price: number | null;
  inrParity: number | null;   // international price in ₹ (before Indian duty/GST), not the MCX quote
  lmeCash: number | null;
  lme3m: number | null;
  cash3mPct: number | null;   // (cash − 3M) / 3M: + backwardation, − contango
  lmeStock: number | null;
  etfTonnes: number | null;
  usdInr: number | null;
  dxy: number | null;
  us10y: number | null;
  realYield: number | null;
}

export interface CotPoint { date: string; mmLong: number; mmShort: number; mmNet: number; prodNet: number; swapNet: number; oi: number }
export interface Cot { latest: CotPoint; netPctile3y: number; history: CotPoint[]; source: string }

export interface Curve { front: { symbol: string; price: number }; next: { symbol: string; price: number }; months: number; annualisedPct: number; structure: 'contango' | 'backwardation' | 'flat'; source: string }

export interface SeasonalMonth { month: number; avgRet: number; upPct: number; years: number }

export interface CommodityNews { title: string; source: string; link: string; time: string; sentiment: 'Bullish' | 'Bearish' | 'Neutral'; impact: number; keywords: string[] }

export interface SignalComponent { name: string; points: number; detail: string; available: boolean }
export interface Signal {
  score: number;              // −10 … +10
  label: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;         // %
  range7d: { low: number; high: number };
  components: SignalComponent[];
}

export interface ForecastMonth { month: string; base: number; low: number; high: number; changePct: number; driver: string; risk: string }

export interface CommodityState {
  code: CommodityCode;
  name: string;
  unit: string;               // price unit, e.g. USD/oz
  inrUnit: string;            // e.g. ₹/10g
  priceSource: string;
  latest: { date: string; price: number; changePct: number | null };
  bars: Bar[];                // ~10 years daily (OHLC where the source has it)
  metrics: Metric[];
  history: DailyRow[];        // newest last, ~1 year
  cot: Cot | null;
  curve: Curve | null;
  seasonal: SeasonalMonth[];
  news: CommodityNews[];
  signal: Signal;
  forecast: ForecastMonth[];
}

export interface CommoditiesFeed {
  updatedAt: string;
  macro: { usdInr: number | null; dxy: number | null; us10y: number | null; realYield: number | null; cpiYoy: number | null };
  commodities: Record<CommodityCode, CommodityState>;
  health: Record<string, string>;
}
