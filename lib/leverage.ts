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

// Share of values strictly below x: "higher than N% of weeks" (a week can't exceed itself).
export function percentileRank(values: number[], x: number) {
  return values.length ? (values.filter(v => v < x).length / values.length) * 100 : 0;
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

// ── Table/chart helpers (all operate on complete weeks, oldest first) ─────────

export const completeWeeks = (h: LeverageHistory) => h.weeks.filter(x => x.combined != null && x.levPct != null);

const fwdNifty = (w: LeverageWeek[], i: number, k: number) =>
  i + k < w.length && w[i].nifty && w[i + k].nifty ? r1(pctChg(w[i].nifty, w[i + k].nifty)) : null;

export interface YearRow {
  year: number; weeks: number; avgLev: number; maxLev: number; minLev: number;
  mtfEnd: number; futEnd: number; combEnd: number; mtfGrowth: number | null; futGrowth: number | null; niftyRet: number | null;
}

// Calendar-year summary; growth and Nifty return run from the prior year's last week.
export function yearlySummary(h: LeverageHistory): YearRow[] {
  const w = completeWeeks(h);
  const years = [...new Set(w.map(x => Number(x.week.slice(0, 4))))];
  return years.map(year => {
    const rows = w.filter(x => Number(x.week.slice(0, 4)) === year);
    const prev = w.filter(x => Number(x.week.slice(0, 4)) === year - 1).at(-1);
    const last = rows.at(-1)!, lev = rows.map(x => x.levPct!);
    return {
      year, weeks: rows.length,
      avgLev: Math.round((lev.reduce((s, x) => s + x, 0) / lev.length) * 100) / 100,
      maxLev: Math.max(...lev), minLev: Math.min(...lev),
      mtfEnd: last.mtf!, futEnd: last.fut!, combEnd: last.combined!,
      mtfGrowth: r1(pctChg(prev?.mtf, last.mtf)), futGrowth: r1(pctChg(prev?.fut, last.fut)), niftyRet: r1(pctChg(prev?.nifty, last.nifty)),
    };
  });
}

export interface RegimeRow { label: string; from: number; to: number; weeks: number; fwd4: number | null; fwd13: number | null; fwd26: number | null; down13: number | null }

// Weeks bucketed by leverage % (quintiles of the period) with the Nifty's forward returns.
export function regimeTable(h: LeverageHistory, buckets = 5): RegimeRow[] {
  const w = completeWeeks(h), lev = w.map(x => x.levPct!);
  const edges = Array.from({ length: buckets + 1 }, (_, i) => quantile(lev, i / buckets));
  const names = ['Lowest', 'Low', 'Middle', 'High', 'Highest'];
  return Array.from({ length: buckets }, (_, b) => {
    const idx = w.map((_, i) => i).filter(i => lev[i] >= edges[b] && (b === buckets - 1 ? lev[i] <= edges[b + 1] : lev[i] < edges[b + 1]));
    const avg = (k: number) => r1(mean(idx.map(i => fwdNifty(w, i, k)).filter((x): x is number => x != null)));
    const f13 = idx.map(i => fwdNifty(w, i, 13)).filter((x): x is number => x != null);
    return {
      label: buckets === 5 ? names[b] : `Q${b + 1}`, from: Math.round(edges[b] * 100) / 100, to: Math.round(edges[b + 1] * 100) / 100,
      weeks: idx.length, fwd4: avg(4), fwd13: avg(13), fwd26: avg(26),
      down13: f13.length ? Math.round((f13.filter(x => x < 0).length / f13.length) * 100) : null,
    };
  });
}

export interface MoveRow { week: string; chgPct: number; chgCr: number; niftyWk: number | null; niftyNext4: number | null; levPct: number }

// Largest week-on-week falls in combined leverage (deleveraging episodes).
export function biggestUnwinds(h: LeverageHistory, n = 10): MoveRow[] {
  const w = completeWeeks(h);
  const rows: MoveRow[] = [];
  for (let i = 1; i < w.length; i++) {
    rows.push({
      week: w[i].week, chgPct: r1(pctChg(w[i - 1].combined, w[i].combined))!, chgCr: w[i].combined! - w[i - 1].combined!,
      niftyWk: r1(pctChg(w[i - 1].nifty, w[i].nifty)), niftyNext4: fwdNifty(w, i, 4), levPct: w[i].levPct!,
    });
  }
  return rows.sort((a, b) => a.chgPct - b.chgPct).slice(0, n);
}

// Rolling correlation between weekly % changes in combined leverage and the Nifty 50.
export function rollingCorrelation(h: LeverageHistory, window = 26): { week: string; corr: number | null }[] {
  const w = completeWeeks(h);
  const lev: number[] = [], nif: number[] = [], weeks: string[] = [];
  for (let i = 1; i < w.length; i++) {
    lev.push(pctChg(w[i - 1].combined, w[i].combined) ?? 0);
    nif.push(pctChg(w[i - 1].nifty, w[i].nifty) ?? 0);
    weeks.push(w[i].week);
  }
  return weeks.map((week, i) => ({ week, corr: i + 1 >= window ? pearson(lev.slice(i + 1 - window, i + 1), nif.slice(i + 1 - window, i + 1)) : null }))
    .filter(r => r.corr != null);
}

// Leverage level against the Nifty's next-13-week return, for a scatter plot.
export function levVsForward(h: LeverageHistory, k = 13): { week: string; levPct: number; fwd: number }[] {
  const w = completeWeeks(h);
  return w.map((x, i) => ({ week: x.week, levPct: x.levPct!, fwd: fwdNifty(w, i, k) }))
    .filter((r): r is { week: string; levPct: number; fwd: number } => r.fwd != null);
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
