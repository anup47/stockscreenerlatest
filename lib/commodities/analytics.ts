// Pure analytics for the Commodity Tracker: technical indicators (also used client-side),
// seasonality, news tagging, the 1–7 day signal and the 12-month scenario path.
import type { Bar, CommodityCode, CommodityNews, Cot, DailyRow, ForecastMonth, SeasonalMonth, Signal, SignalComponent } from './types';
import type { RawNews } from './sources';

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const r2 = (x: number) => Math.round(x * 100) / 100;
export const PRECIOUS = new Set<CommodityCode>(['GOLD', 'SILVER']);

// ── Technical indicators (arrays aligned to the input, null until enough data) ─

export function sma(v: number[], n: number): (number | null)[] {
  let sum = 0;
  return v.map((x, i) => { sum += x; if (i >= n) sum -= v[i - n]; return i + 1 >= n ? sum / n : null; });
}

export function ema(v: number[], n: number): (number | null)[] {
  const k = 2 / (n + 1); let prev: number | null = null;
  return v.map((x, i) => {
    if (i + 1 < n) return null;
    prev = prev == null ? mean(v.slice(0, n)) : x * k + prev * (1 - k);
    return prev;
  });
}

export function rsi(v: number[], n = 14): (number | null)[] {
  let gain = 0, loss = 0;
  return v.map((x, i) => {
    if (i === 0) return null;
    const ch = x - v[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= n) { gain += g / n; loss += l / n; return i === n ? (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)) : null; }
    gain = (gain * (n - 1) + g) / n; loss = (loss * (n - 1) + l) / n;  // Wilder smoothing
    return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  });
}

export function macd(v: number[], fast = 12, slow = 26, sig = 9) {
  const f = ema(v, fast), s = ema(v, slow);
  const line = v.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const start = line.findIndex(x => x != null);
  const sigLine = start < 0 ? line.map(() => null) : [...line.slice(0, start).map(() => null), ...ema(line.slice(start) as number[], sig)];
  return { line, signal: sigLine, hist: line.map((x, i) => (x != null && sigLine[i] != null ? x - sigLine[i]! : null)) };
}

export function bollinger(v: number[], n = 20, k = 2) {
  const mid = sma(v, n);
  const band = v.map((_, i) => {
    if (mid[i] == null) return null;
    const w = v.slice(i + 1 - n, i + 1), m = mid[i]!;
    return Math.sqrt(mean(w.map(x => (x - m) ** 2))) * k;
  });
  return { mid, upper: mid.map((m, i) => (m != null ? m + band[i]! : null)), lower: mid.map((m, i) => (m != null ? m - band[i]! : null)) };
}

// Classic pivots from the last complete calendar month (support/resistance for the coming month).
export function monthlyPivots(bars: Bar[]) {
  if (!bars.length) return null;
  const lastMonth = bars.at(-1)!.d.slice(0, 7);
  const prior = bars.filter(b => b.d.slice(0, 7) < lastMonth);
  const month = prior.at(-1)?.d.slice(0, 7);
  if (!month) return null;
  const m = prior.filter(b => b.d.startsWith(month));
  const H = Math.max(...m.map(b => b.h ?? b.c)), L = Math.min(...m.map(b => b.l ?? b.c)), C = m.at(-1)!.c, P = (H + L + C) / 3;
  return { basis: month, P, R1: 2 * P - L, S1: 2 * P - H, R2: P + (H - L), S2: P - (H - L) };
}

export function dailyVol(bars: Bar[], n = 60) {
  const c = bars.slice(-n - 1).map(b => b.c);
  const rets = c.slice(1).map((x, i) => Math.log(x / c[i]));
  const m = mean(rets);
  return Math.sqrt(mean(rets.map(r => (r - m) ** 2)));
}

// Average return of each calendar month over the last `years` complete years.
export function seasonality(bars: Bar[], years = 10): SeasonalMonth[] {
  const monthEnd = new Map<string, number>();
  for (const b of bars) monthEnd.set(b.d.slice(0, 7), b.c);
  const keys = [...monthEnd.keys()].sort();
  const lastYear = Number(bars.at(-1)!.d.slice(0, 4)) - 1, firstYear = lastYear - years + 1;
  const rets: Record<number, number[]> = {};
  for (let i = 1; i < keys.length; i++) {
    const [y, m] = keys[i].split('-').map(Number);
    if (y < firstYear || y > lastYear) continue;
    (rets[m] ??= []).push((monthEnd.get(keys[i])! / monthEnd.get(keys[i - 1])! - 1) * 100);
  }
  return Array.from({ length: 12 }, (_, i) => {
    const r = rets[i + 1] ?? [];
    return { month: i + 1, avgRet: r.length ? r2(mean(r)) : 0, upPct: r.length ? Math.round((r.filter(x => x > 0).length / r.length) * 100) : 0, years: r.length };
  });
}

// ── News tagging (high-impact keywords only) ─────────────────────────────────

const KEYWORDS: Record<'precious' | 'base', { bull: string[]; bear: string[]; impact: string[] }> = {
  precious: {
    bull: ['rate cut', 'dovish', 'weaker dollar', 'dollar falls', 'dollar slips', 'safe haven', 'safe-haven', 'war', 'conflict', 'geopolitical', 'central bank buying', 'central banks buy', 'etf inflow', 'inflows', 'record high', 'rally', 'surges', 'jumps'],
    bear: ['rate hike', 'hawkish', 'stronger dollar', 'dollar rises', 'dollar gains', 'yields rise', 'outflow', 'profit-taking', 'sell-off', 'selloff', 'slumps', 'falls', 'tumbles', 'ceasefire', 'crash', 'plunge', 'slide', 'drops', 'one-year low', 'bear'],
    impact: ['fed', 'fomc', 'powell', 'rate', 'dollar', 'war', 'central bank', 'etf', 'inflation', 'cpi', 'payrolls', 'treasury', 'pboc', 'rbi'],
  },
  base: {
    bull: ['stimulus', 'smelter cut', 'output cut', 'production cut', 'curtail', 'power shortage', 'power cuts', 'inventory drop', 'inventories fall', 'stocks fall', 'drawdown', 'supply disruption', 'outage', 'deficit', 'import surge', 'imports rise', 'tight'],
    bear: ['property slump', 'property crisis', 'weak demand', 'demand concerns', 'inventory rise', 'inventories rise', 'stocks rise', 'surplus', 'tariff', 'restart', 'exports rise', 'slowdown', 'glut'],
    impact: ['china', 'stimulus', 'smelter', 'power', 'property', 'inventory', 'stocks', 'import', 'export', 'lme', 'shfe', 'tariff', 'pboc', 'pmi', 'concentrate', 'treatment charges', 'output', 'alumina'],
  },
};
// Inventory headlines read inversely to price: falling stocks are bullish, rising stocks bearish.
const INV_DOWN = /\b(inventor(?:y|ies)|stocks?|stockpiles?)\b[^.]{0,30}\b(fall|falls|fell|drop|drops|decline|declines|slip|slips|drawdown|lowest)\b/;
const INV_UP = /\b(inventor(?:y|ies)|stocks?|stockpiles?)\b[^.]{0,30}\b(rise|rises|rose|climb|climbs|build|builds|jump|jumps|highest|surge|surges)\b/;
const MOVE_UP = /\b(rise|rises|rose|gain|gains|jump|jumps|surge|surges|rally|rallies|climb|climbs|rebound|rebounds|record high)\b/;
const MOVE_DOWN = /\b(fall|falls|fell|drop|drops|slip|slips|decline|declines|slide|slides|eases|plunge|plunges|crash|tumble|tumbles)\b/;
const TRUSTED = /reuters|bloomberg|kitco|mining\.com|financial times|wsj|cnbc|smm|metal\.com|fastmarkets|argus|economic times|moneycontrol|business standard/i;

export function tagNews(code: CommodityCode, items: RawNews[], top = 5): CommodityNews[] {
  const kw = KEYWORDS[PRECIOUS.has(code) ? 'precious' : 'base'];
  const seen = new Set<string>();
  return items.map(n => {
    const t = n.title.toLowerCase();
    const bull = kw.bull.filter(k => t.includes(k)), bear = kw.bear.filter(k => t.includes(k)), imp = kw.impact.filter(k => new RegExp(`\\b${k}\\b`).test(t));
    const impact = Math.min(5, imp.length + bull.length + bear.length + (TRUSTED.test(n.source) ? 1 : 0));
    let b = bull.length, s = bear.length;
    if (INV_DOWN.test(t)) b += 2; else if (INV_UP.test(t)) s += 2;
    else if (b === s) { if (MOVE_UP.test(t)) b++; else if (MOVE_DOWN.test(t)) s++; }   // plain price-move headlines
    const sentiment: CommodityNews['sentiment'] = b > s ? 'Bullish' : s > b ? 'Bearish' : 'Neutral';
    return { ...n, sentiment, impact, keywords: [...new Set([...imp, ...bull, ...bear])] };
  })
    .filter(n => n.impact >= 2)                     // high-impact only
    .filter(n => { const k = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.impact - a.impact || b.time.localeCompare(a.time))
    .slice(0, top);
}

// ── 1–7 day signal ───────────────────────────────────────────────────────────

export interface SignalInputs {
  code: CommodityCode; bars: Bar[]; history: DailyRow[]; cot: Cot | null;
  dxyChange1d: number | null; realYieldChange5d: number | null;
}

export function computeSignal(x: SignalInputs): Signal {
  const comps: SignalComponent[] = [];
  const add = (name: string, points: number, detail: string, available = true) => comps.push({ name, points: available ? points : 0, detail, available });
  const precious = PRECIOUS.has(x.code);
  const closes = x.bars.map(b => b.c), price = closes.at(-1)!;

  // Exchange inventory: three consecutive daily falls (or rises) in LME warehouse stock.
  if (!precious) {
    const s = x.history.map(h => h.lmeStock).filter((v): v is number => v != null).slice(-4);
    const falling = s.length === 4 && s.every((v, i) => i === 0 || v < s[i - 1]);
    const rising = s.length === 4 && s.every((v, i) => i === 0 || v > s[i - 1]);
    add('LME inventory, 3 days', falling ? 2 : rising ? -2 : 0, falling ? 'Falling 3 days in a row' : rising ? 'Rising 3 days in a row' : 'No 3-day run', s.length === 4);
    add('SHFE inventory', 0, 'No free automated source', false);
  } else {
    const t = x.history.map(h => h.etfTonnes).filter((v): v is number => v != null).slice(-2);
    const ch = t.length === 2 ? t[1] - t[0] : null;
    add('ETF holdings', ch == null ? 0 : ch > 0 ? 2 : ch < 0 ? -2 : 0, ch == null ? 'Needs two daily readings' : `${ch > 0 ? '+' : ''}${r2(ch)} t vs previous day`, ch != null);
    add('SGE premium', 0, 'No free automated source', false);
  }

  add('Dollar index (DXY)', x.dxyChange1d == null ? 0 : x.dxyChange1d < 0 ? 2 : x.dxyChange1d > 0 ? -2 : 0,
    x.dxyChange1d == null ? 'n/a' : `${x.dxyChange1d > 0 ? '+' : ''}${r2(x.dxyChange1d)}% yesterday`, x.dxyChange1d != null);

  if (precious) {
    const p = x.cot?.netPctile3y;
    add('COT speculators', p == null ? 0 : p >= 90 ? -3 : p <= 10 ? 3 : 0,
      p == null ? 'n/a' : `Managed-money net long at the ${p}th percentile of 3 years${p >= 90 ? ' — crowded' : p <= 10 ? ' — washed out' : ''}`, p != null);
    add('Real yield, 5 days', x.realYieldChange5d == null ? 0 : x.realYieldChange5d < -0.05 ? 1 : x.realYieldChange5d > 0.05 ? -1 : 0,
      x.realYieldChange5d == null ? 'n/a' : `${x.realYieldChange5d > 0 ? '+' : ''}${r2(x.realYieldChange5d)} pp`, x.realYieldChange5d != null);
  } else {
    const sp = x.history.at(-1)?.cash3mPct;
    add('LME cash–3M spread', sp == null ? 0 : sp > 0 ? 1 : sp < -1 ? -1 : 0,
      sp == null ? 'n/a' : sp > 0 ? `Backwardation ${r2(sp)}% (tight nearby supply)` : `Contango ${r2(sp)}%`, sp != null);
  }

  const s50 = sma(closes, 50).at(-1), s200 = sma(closes, 200).at(-1);
  const trend = s50 != null && s200 != null ? (price > s50 && price > s200 ? 1 : price < s50 && price < s200 ? -1 : 0) : 0;
  add('Trend (50/200 DMA)', trend, s50 == null || s200 == null ? 'n/a' : trend > 0 ? 'Above both' : trend < 0 ? 'Below both' : 'Mixed', s50 != null && s200 != null);

  const score = Math.max(-10, Math.min(10, comps.reduce((s, c) => s + c.points, 0)));
  const avail = comps.filter(c => c.available);
  const gross = avail.reduce((s, c) => s + Math.abs(c.points), 0);
  const agreement = gross ? Math.abs(score) / gross : 0;
  // Confidence needs agreement, data coverage and enough evidence: two inputs agreeing isn't 80%.
  const coverage = (avail.length / comps.length) * Math.min(1, gross / 6);
  const sd = dailyVol(x.bars) * Math.sqrt(7);
  const centre = price * (1 + (score / 10) * sd * 0.5);
  return {
    score,
    label: score >= 3 ? 'BUY' : score <= -3 ? 'SELL' : 'HOLD',
    confidence: Math.round(40 + 50 * agreement * coverage),
    range7d: { low: r2(centre * (1 - sd)), high: r2(centre * (1 + sd)) },
    components: comps,
  };
}

// ── 12-month scenario path ───────────────────────────────────────────────────

export interface ForecastInputs {
  code: CommodityCode; bars: Bar[]; seasonal: SeasonalMonth[]; history: DailyRow[]; cot: Cot | null;
  dxyChange3m: number | null; realYieldChange3m: number | null;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function forecast12m(x: ForecastInputs): { months: ForecastMonth[]; drivers: string[] } {
  const precious = PRECIOUS.has(x.code);
  const price = x.bars.at(-1)!.c;
  const tilts: { label: string; pct: number; risk: string }[] = [];

  if (!precious) {
    const st = x.history.map(h => h.lmeStock).filter((v): v is number => v != null);
    const inv3m = st.length > 63 ? (st.at(-1)! / st.at(-64)! - 1) * 100 : null;
    if (inv3m != null && Math.abs(inv3m) > 10)
      tilts.push(inv3m < 0
        ? { label: `LME stocks down ${Math.abs(Math.round(inv3m))}% in 3 months`, pct: 0.5, risk: 'Smelter restarts or Chinese exports refill LME stocks' }
        : { label: `LME stocks up ${Math.round(inv3m)}% in 3 months`, pct: -0.5, risk: 'Supply disruption or China stimulus drains stocks' });
    const sp = x.history.at(-1)?.cash3mPct;
    if (sp != null && sp > 0) tilts.push({ label: `Backwardation ${r2(sp)}% signals tight nearby supply`, pct: 0.3, risk: 'Backwardation eases as metal is delivered' });
    if (sp != null && sp < -1) tilts.push({ label: `Contango ${r2(sp)}% signals ample supply`, pct: -0.3, risk: 'Spread flips if stocks are drawn down' });
  } else {
    if (x.realYieldChange3m != null && Math.abs(x.realYieldChange3m) > 0.2)
      tilts.push(x.realYieldChange3m < 0
        ? { label: `Real yields down ${Math.abs(r2(x.realYieldChange3m))} pp in 3 months`, pct: 0.4, risk: 'Fed turns hawkish and real yields rebound' }
        : { label: `Real yields up ${r2(x.realYieldChange3m)} pp in 3 months`, pct: -0.4, risk: 'Growth scare pulls real yields lower' });
    const p = x.cot?.netPctile3y;
    if (p != null && p >= 90) tilts.push({ label: `Speculative positioning crowded (${p}th pct)`, pct: -0.3, risk: 'Positioning stays stretched in a momentum market' });
    if (p != null && p <= 10) tilts.push({ label: `Speculative positioning washed out (${p}th pct)`, pct: 0.3, risk: 'Funds keep selling into weakness' });
  }
  if (x.dxyChange3m != null && Math.abs(x.dxyChange3m) > 2)
    tilts.push(x.dxyChange3m < 0
      ? { label: `Dollar down ${Math.abs(r2(x.dxyChange3m))}% in 3 months`, pct: 0.3, risk: 'Dollar rebound' }
      : { label: `Dollar up ${r2(x.dxyChange3m)}% in 3 months`, pct: -0.3, risk: 'Dollar reverses lower' });

  const sigmaA = dailyVol(x.bars, 252) * Math.sqrt(252);
  const start = new Date(`${x.bars.at(-1)!.d}T00:00:00Z`);
  let base = price;
  const months: ForecastMonth[] = [];
  for (let k = 1; k <= 12; k++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1));
    const m = d.getUTCMonth() + 1, seas = x.seasonal[m - 1];
    // Seasonal average is shrunk by half (noisy); fundamental/macro tilts fade after a quarter.
    const fade = k <= 3 ? 1 : 0.5;
    const tiltPct = tilts.reduce((s, t) => s + t.pct, 0) * fade;
    const drift = seas.avgRet * 0.5 + tiltPct;
    base *= 1 + drift / 100;
    const band = Math.exp(sigmaA * Math.sqrt(k / 12));
    const top = [...tilts].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
    const seasonalLeads = !top || Math.abs(seas.avgRet * 0.5) > Math.abs(top.pct * fade);
    months.push({
      month: `${MON[m - 1]} ${String(d.getUTCFullYear()).slice(2)}`,
      base: r2(base), low: r2(base / band), high: r2(base * band), changePct: r2((base / price - 1) * 100),
      driver: seasonalLeads
        ? `Seasonal: ${MON[m - 1]} averaged ${seas.avgRet > 0 ? '+' : ''}${seas.avgRet}% (up ${seas.upPct}% of ${seas.years} yrs)`
        : top.label,
      risk: seasonalLeads ? `Seasonal pattern fails (down in ${100 - seas.upPct}% of years)` : top.risk,
    });
  }
  return { months, drivers: tilts.map(t => t.label) };
}
