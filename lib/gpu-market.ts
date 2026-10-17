// Cloud GPU rental market, condensed from GetDeploying's weekly price dataset (CC BY 4.0).
// Pure functions only, so the same logic can be checked outside Next.js.

export interface GpuPriceRow {
  gpu_slug: string;
  date: string;
  billing_type: string;
  reservation_months: number | null;
  median_price: number | null;
  provider_median_price: number | null;
  provider_count: number;
}

export interface GpuModelStat {
  slug: string;
  name: string;
  price: number;              // on-demand $/GPU-hr, median across providers
  providers: number;
  chg4w: number | null;       // % change
  chg13w: number | null;
  chg52w: number | null;
  spotPct: number | null;     // spot price as % of on-demand
  reserve12mDiscount: number | null; // % below on-demand for a 12-month commitment
  spark: number[];            // weekly on-demand prices, oldest first
}

export type GpuVerdict = 'shortage' | 'balanced' | 'oversupply';

export interface GpuMarket {
  asOf: string;
  index: {
    chg1w: number | null; chg4w: number | null; chg13w: number | null; chg52w: number | null;
    models: number;           // models in the latest weekly comparison
    line: { date: string; value: number }[]; // chained index, 100 = start of window
  };
  verdict: GpuVerdict;
  verdictNote: string;
  spotPct: number | null;     // median across flagship models
  models: GpuModelStat[];
  source: { name: string; url: string; license: string };
  fetchedAt: string;
}

export const GPU_DATASET_URL = 'https://getdeploying.com/dataset/gpu-prices/weekly.json';
const FLAGSHIPS = ['nvidia-b200', 'nvidia-h200', 'nvidia-h100', 'amd-mi300x', 'nvidia-a100', 'nvidia-l40s', 'nvidia-rtx-4090'];
const MIN_PROVIDERS = 4;   // same floor GetDeploying uses for its published trends
const LINE_WEEKS = 26;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (from: number, to: number) => ((to - from) / from) * 100;

export function gpuName(slug: string): string {
  const [vendor, ...rest] = slug.split('-');
  return `${vendor === 'amd' ? 'AMD' : vendor[0].toUpperCase() + vendor.slice(1)} ${rest.join(' ').toUpperCase()}`;
}

type Point = { price: number; providers: number };

export function summarizeGpuMarket(rows: GpuPriceRow[], fetchedAt = new Date().toISOString()): GpuMarket {
  const series = (billing: (r: GpuPriceRow) => boolean) => {
    const bySlug = new Map<string, Map<string, Point>>();
    for (const r of rows) {
      const price = r.provider_median_price ?? r.median_price;
      if (!billing(r) || price == null || price <= 0) continue;
      if (!bySlug.has(r.gpu_slug)) bySlug.set(r.gpu_slug, new Map());
      bySlug.get(r.gpu_slug)!.set(r.date, { price, providers: r.provider_count });
    }
    return bySlug;
  };
  const onDemand = series(r => r.billing_type === 'ON_DEMAND');
  const spot     = series(r => r.billing_type === 'SPOT');
  const reserve  = series(r => r.billing_type === 'RESERVATION_12_MONTH' || (r.billing_type === 'RESERVATION' && r.reservation_months === 12));

  const dates = [...new Set([...onDemand.values()].flatMap(m => [...m.keys()]))].sort();
  const covered = (d: string) => [...onDemand.values()].filter(m => (m.get(d)?.providers ?? 0) >= MIN_PROVIDERS).length;
  // The newest week can be partial; use it only once its coverage is near the prior week's.
  let last = dates.length - 1;
  if (last > 0 && covered(dates[last]) < 0.8 * covered(dates[last - 1])) last--;
  const asOf = dates[last];

  const indexChange = (from: string, to: string) => {
    const changes: number[] = [];
    for (const m of onDemand.values()) {
      const a = m.get(from), b = m.get(to);
      if (a && b && a.providers >= MIN_PROVIDERS && b.providers >= MIN_PROVIDERS) changes.push(pct(a.price, b.price));
    }
    return { change: median(changes), models: changes.length };
  };
  const back = (weeks: number) => (last - weeks >= 0 ? indexChange(dates[last - weeks], asOf).change : null);

  // Chain weekly median moves so models entering or leaving the market don't jump the line.
  const start = Math.max(1, last - LINE_WEEKS + 1);
  const line = [{ date: dates[start - 1], value: 100 }];
  for (let i = start; i <= last; i++) {
    const wk = indexChange(dates[i - 1], dates[i]).change ?? 0;
    line.push({ date: dates[i], value: Math.round(line.at(-1)!.value * (1 + wk / 100) * 10) / 10 });
  }

  const modelChange = (m: Map<string, Point>, weeks: number) => {
    const a = last - weeks >= 0 ? m.get(dates[last - weeks]) : undefined, b = m.get(asOf);
    return a && b ? round1(pct(a.price, b.price)) : null;
  };
  const models: GpuModelStat[] = FLAGSHIPS.flatMap(slug => {
    const m = onDemand.get(slug), now = m?.get(asOf);
    if (!m || !now) return [];
    // Thin spot/reservation listings can price above on-demand; ignore those as noise.
    const spRaw = spot.get(slug)?.get(asOf), rsRaw = reserve.get(slug)?.get(asOf);
    const sp = spRaw && spRaw.providers >= 2 && spRaw.price < now.price ? spRaw : undefined;
    const rs = rsRaw && rsRaw.price < now.price ? rsRaw : undefined;
    return [{
      slug, name: gpuName(slug), price: Math.round(now.price * 100) / 100, providers: now.providers,
      chg4w: modelChange(m, 4), chg13w: modelChange(m, 13), chg52w: modelChange(m, 52),
      spotPct: sp ? Math.round((sp.price / now.price) * 100) : null,
      reserve12mDiscount: rs ? Math.round((1 - rs.price / now.price) * 100) : null,
      spark: dates.slice(Math.max(0, last - LINE_WEEKS + 1), last + 1).map(d => m.get(d)?.price).filter((p): p is number => p != null),
    }];
  });

  const chg4w = round1(back(4)), chg13w = round1(back(13)), chg52w = round1(back(52));
  const trend = chg52w ?? chg13w ?? 0;
  const verdict: GpuVerdict = trend >= 10 && (chg4w ?? 0) >= 0 ? 'shortage'
    : trend <= -10 && (chg4w ?? 0) <= 0 ? 'oversupply' : 'balanced';
  const verdictNote = {
    shortage:   'Rental prices are rising across most GPU models: demand for AI compute is outrunning new supply.',
    oversupply: 'Rental prices are falling across most GPU models: compute capacity is outrunning demand, an early over-build signal.',
    balanced:   'Rental prices are broadly steady: new GPU supply is roughly matching demand.',
  }[verdict];

  return {
    asOf,
    index: { chg1w: round1(back(1)), chg4w, chg13w, chg52w, models: indexChange(dates[last - 1] ?? asOf, asOf).models, line },
    verdict, verdictNote,
    spotPct: median(models.map(m => m.spotPct).filter((x): x is number => x != null)),
    models,
    source: { name: 'GetDeploying', url: 'https://getdeploying.com/gpu-price-trends', license: 'CC BY 4.0' },
    fetchedAt,
  };
}

export type GpuRiskSignal = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

// AI-unwind lens: falling rents mean idle capacity (over-build); rising rents mean real demand.
export function gpuRiskSignal(m: GpuMarket): { signal: GpuRiskSignal; direction: 'improving' | 'neutral' | 'deteriorating' } {
  const y = m.index.chg52w ?? m.index.chg13w ?? 0, q = m.index.chg13w ?? 0, w4 = m.index.chg4w ?? 0;
  const signal: GpuRiskSignal = y <= -30 || q <= -20 ? 'RED'
    : y <= -15 || q <= -10 ? 'ORANGE'
    : y < 0 || w4 <= -5 ? 'YELLOW' : 'GREEN';
  return { signal, direction: w4 > 1 ? 'improving' : w4 < -1 ? 'deteriorating' : 'neutral' };
}
