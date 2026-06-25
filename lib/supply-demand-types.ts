// lib/supply-demand-types.ts

export type SupplyStatus = 'shortage' | 'balanced' | 'oversupply';

// short-term  = weeks to 3 months
// medium-term = 3 to 12 months
// long-term   = 1 year+
export type TimeHorizon = 'short-term' | 'medium-term' | 'long-term';

export type PricingPowerTrend = 'rising' | 'falling' | 'stable';

export type Category =
  | 'shortage'
  | 'oversupply'
  | 'emerging'
  | 'balanced'
  | 'rising-pricing'
  | 'falling-pricing';

/** Pricing power as used by the new supply-demand themes model output */
export type PricingPower = 'rising' | 'collapsing' | 'stable';

export interface StockImpact {
  symbol: string;
  company: string;
  reason: string;
}

/** A single stock entry within a SupplyDemandTheme */
export interface ThemeStock {
  symbol: string;
  company: string;
  rationale: string;
  impact: 'high' | 'medium' | 'low';
  marginSensitivity?: string;     // e.g. "+$1/barrel GRM = ~Rs 1,400 Cr PAT uplift"
  stockChange30d?:    number | null; // % change in last 30 trading days (NSE .NS price)
}

/** One supply-demand theme as returned by the AI model */
export interface SupplyDemandTheme {
  id: string;
  commodity: string;
  category: Category;
  pricingPower: PricingPower;
  description: string;
  confidence: number;
  timeHorizon: 'near-term' | 'medium-term' | 'long-term';
  beneficiaries: ThemeStock[];
  adverselyAffected: ThemeStock[];
  historicalAnalog: string;
  sources: string[];
  // Enrichment fields (computed from Yahoo Finance price data)
  sparkline?:       number[];     // last 30 closes, normalized 0-100
  chg1d?:           number;       // % change vs previous close
  chg1m?:           number;       // % change vs 1 month ago
  chg3m?:           number;       // % change vs 3 months ago
  chg6m?:           number;       // % change vs 6 months ago
  pct52?:           number;       // position in 52-week range (0-100)
  currentPrice?:    number;       // absolute current price
  tradeDependency?: string;       // India's import/export dependency summary
  cascadeEffects?:  string[];     // second-order effect chain
}

export interface SupplyDemandStory {
  id: string;
  commodity: string;
  sector: string;
  supplyStatus: SupplyStatus;
  confidence: number;
  timeHorizon: TimeHorizon;
  summary: string;
  explanation: string;
  historicalAnalog?: string;
  beneficiaries: StockImpact[];
  adverselyAffected: StockImpact[];
  pricingPowerTrend: PricingPowerTrend;
  dataPoints: string[];
  lastUpdated: string;
}

export interface LivePrice {
  price: number;
  change1d: number; // % change vs previous close
  unit: string;     // "$/tonne", "$/barrel", etc.
}

export interface SupplyDemandSnapshot {
  themes: SupplyDemandTheme[];
  generatedAt: string;
  elapsedMs: number;
  error?: string;
  priceData?: Record<string, LivePrice>; // live prices used to ground the analysis
  pricesAsOf?: string;                   // ISO timestamp of price fetch
  // Legacy fields kept for backwards compatibility
  stories?: SupplyDemandStory[];
  modelUsed?: string;
  totalShortages?: number;
  totalOversupply?: number;
  totalEmerging?: number;
}

// localStorage shape:
// key 'sd-snapshot' -> JSON.stringify(SupplyDemandSnapshot)
// key 'sd-date'     -> YYYY-MM-DD string in IST (e.g. "2026-06-04")
