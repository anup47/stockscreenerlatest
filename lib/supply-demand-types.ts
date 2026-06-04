// lib/supply-demand-types.ts

export type Category = 'shortage' | 'oversupply' | 'emerging' | 'balanced';

export type PricingPower = 'rising' | 'collapsing' | 'stable';

export type TimeHorizon = 'near-term' | 'medium-term' | 'long-term';

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface StockImpact {
  symbol: string;
  company: string;
  rationale: string;
  impact: ImpactLevel;
}

export interface SupplyDemandTheme {
  id: string;
  commodity: string;
  category: Category;
  pricingPower: PricingPower;
  description: string;
  confidence: number;
  timeHorizon: TimeHorizon;
  beneficiaries: StockImpact[];
  adverselyAffected: StockImpact[];
  historicalAnalog: string;
  sources: string[];
}

export interface SupplyDemandSnapshot {
  themes: SupplyDemandTheme[];
  generatedAt: string;
  elapsedMs: number;
}

// localStorage shape
// key:   sd-snapshot-{YYYY-MM-DD}   (IST date of generation)
// value: JSON.stringify(SupplyDemandSnapshot)
