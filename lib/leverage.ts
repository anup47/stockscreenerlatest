// Weekly market leverage (MTF book + futures OI notional) vs market cap.
// History is built by scripts/leverage.mjs; analysis here is pure so the page can run it.

export interface LeverageWeek {
  week: string;                // that week's Friday (YYYY-MM-DD)
  mtfDate: string | null;      // last trading day with MTF data in the week
  mtf: number | null;          // ₹ crore, NSE + BSE funded book
  mtfNse: number | null;
  mtfBse: number | null;
  futDate: string | null;
  futStock: number | null;     // ₹ crore, Σ OI × settlement price
  futIndex: number | null;
  fut: number | null;
  futFinal: boolean;
  combined: number | null;
  mcap: number | null;         // ₹ crore, NSE total market cap
  mcapEstimated: boolean;
  levPct: number | null;       // combined as % of market cap
  nifty: number | null;
  nifty500: number | null;
}

export interface LeverageHistory {
  generatedAt: string;
  latestMarketCap: { date: string; crore: number } | null;
  weeks: LeverageWeek[];
  sources: Record<string, { name: string; url?: string; note: string }>;
}

export interface Change { wow: number | null; mom: number | null; yoy: number | null }

export interface Episode { week: string; levPct: number; fwd4: number | null; fwd13: number | null; fwd26: number | null }

export interface LeverageAnalysis {
  latest: LeverageWeek;
  change: { mtf: Change; fut: Change; combined: Change; levPctPts: Change };
  rank: { levPct: number; combined: number };        // percentile within the full history, 0–100
  extremes: { levHigh: LeverageWeek; levLow: LeverageWeek; combHigh: LeverageWeek; combLow: LeverageWeek };
  growth: { mtf13w: number | null; fut13w: number | null; mtf52w: number | null; fut52w: number | null; mtfShareNow: number; mtfShare1y: number | null };
  threshold: { pct: number; level: number; episodes: Episode[]; avgFwd: Record<'fwd4' | 'fwd13' | 'fwd26', number | null>; baseFwd: Record<'fwd4' | 'fwd13' | 'fwd26', number | null>; downShare13: number | null };
  correlation: { weekly: number | null; levelVsFwd13: number | null; weeks: number };
  years: number;
}

const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const pctChg = (a: number | null | undefined, b: number | null | undefined) => (a && b != null ? ((b - a) / a) * 100 : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function percentileRank(values: number[], x: number) {
  return values.length ? (values.filter(v => v <= x).length / values.length) * 100 : 0;
}

export function quantile(values: number[], q: number) {
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 10) return null;
  const mx = mean(xs.slice(0, n))!, my = mean(ys.slice(0, n))!;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100 : null;
}

export function analyseLeverage(h: LeverageHistory, thresholdPct = 80): LeverageAnalysis | null {
  const w = h.weeks.filter(x => x.combined != null && x.levPct != null);
  if (w.length < 8) return null;
  const n = w.length, latest = w[n - 1];
  const back = (k: number) => (n - 1 - k >= 0 ? w[n - 1 - k] : undefined);
  const change = (f: (x: LeverageWeek) => number | null, pts = false): Change => {
    const d = (k: number) => {
      const b = back(k);
      if (!b) return null;
      // Leverage % moves in hundredths of a point, so points keep two decimals.
      return pts ? Math.round((f(latest)! - f(b)!) * 100) / 100 : r1(pctChg(f(b), f(latest)));
    };
    return { wow: d(1), mom: d(4), yoy: d(52) };
  };

  const lev = w.map(x => x.levPct!), comb = w.map(x => x.combined!);
  const by = (f: (x: LeverageWeek) => number, max: boolean) => w.reduce((a, b) => ((max ? f(b) > f(a) : f(b) < f(a)) ? b : a));

  // Forward Nifty return from week i, k weeks ahead.
  const fwd = (i: number, k: number) => (i + k < n && w[i].nifty && w[i + k].nifty ? r1(pctChg(w[i].nifty, w[i + k].nifty)) : null);
  const level = Math.round(quantile(lev, thresholdPct / 100) * 100) / 100;
  const episodes: Episode[] = [];
  for (let i = 1; i < n; i++) {
    if (lev[i] >= level && lev[i - 1] < level && (!episodes.length || i - w.findIndex(x => x.week === episodes.at(-1)!.week) >= 8)) {
      episodes.push({ week: w[i].week, levPct: lev[i], fwd4: fwd(i, 4), fwd13: fwd(i, 13), fwd26: fwd(i, 26) });
    }
  }
  const avgOf = (rows: (number | null)[]) => r1(mean(rows.filter((x): x is number => x != null)));
  const baseRows = w.map((_, i) => i);
  const fwd13s = episodes.map(e => e.fwd13).filter((x): x is number => x != null);

  // Same-week co-movement, and whether a high leverage level preceded weaker 13-week returns.
  const wk: number[] = [], nf: number[] = [], lvl: number[] = [], f13: number[] = [];
  for (let i = 1; i < n; i++) {
    const a = pctChg(w[i - 1].combined, w[i].combined), b = pctChg(w[i - 1].nifty, w[i].nifty);
    if (a != null && b != null) { wk.push(a); nf.push(b); }
    const f = fwd(i, 13);
    if (f != null) { lvl.push(lev[i]); f13.push(f); }
  }

  const share = (x?: LeverageWeek) => (x?.mtf != null && x.combined ? (x.mtf / x.combined) * 100 : null);
  return {
    latest,
    change: { mtf: change(x => x.mtf), fut: change(x => x.fut), combined: change(x => x.combined), levPctPts: change(x => x.levPct, true) },
    rank: { levPct: Math.round(percentileRank(lev, latest.levPct!)), combined: Math.round(percentileRank(comb, latest.combined!)) },
    extremes: { levHigh: by(x => x.levPct!, true), levLow: by(x => x.levPct!, false), combHigh: by(x => x.combined!, true), combLow: by(x => x.combined!, false) },
    growth: {
      mtf13w: r1(pctChg(back(13)?.mtf, latest.mtf)), fut13w: r1(pctChg(back(13)?.fut, latest.fut)),
      mtf52w: r1(pctChg(back(52)?.mtf, latest.mtf)), fut52w: r1(pctChg(back(52)?.fut, latest.fut)),
      mtfShareNow: r1(share(latest))!, mtfShare1y: r1(share(back(52))),
    },
    threshold: {
      pct: thresholdPct, level, episodes,
      avgFwd: { fwd4: avgOf(episodes.map(e => e.fwd4)), fwd13: avgOf(episodes.map(e => e.fwd13)), fwd26: avgOf(episodes.map(e => e.fwd26)) },
      baseFwd: { fwd4: avgOf(baseRows.map(i => fwd(i, 4))), fwd13: avgOf(baseRows.map(i => fwd(i, 13))), fwd26: avgOf(baseRows.map(i => fwd(i, 26))) },
      downShare13: fwd13s.length ? Math.round((fwd13s.filter(x => x < 0).length / fwd13s.length) * 100) : null,
    },
    correlation: { weekly: pearson(wk, nf), levelVsFwd13: pearson(lvl, f13), weeks: wk.length },
    years: Math.round((Date.parse(latest.week) - Date.parse(w[0].week)) / (365.25 * 864e5) * 10) / 10,
  };
}
