// Big Player Tracker: did large (institutional) or small (retail) orders drive each session?
// Trade counts, delivery and VWAP come from NSE's full bhavcopy, published to Blob by the office PC
// (NSE blocks cloud IPs). Dhan minute candles, when available, add an intraday buy/sell volume split.
// Self-contained (no '@/' imports) so scripts/bhav-delivery.mjs can import it under plain Node.

export const BHAV_SHARDS = 12;
export const BHAV_DAYS = 85;            // 60-day view + 20-day trailing baseline + spare
export const INDEX_KEY = 'big-player/index.json';
export const shardKey = (i: number) => `big-player/bhav-${i}.json`;
export function shardOf(sym: string): number {
  let h = 5381;
  for (const ch of sym) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h % BHAV_SHARDS;
}

// stocks: every symbol in the shards → [Dhan NSE security ID (0 if unknown), company name, Dhan instrument
// type: 'ES' ordinary shares, 'ETF', 'REIT', … ('' if unknown)].
export interface BhavIndex { updatedAt: string; dates: string[]; stocks: Record<string, [number, string, string?]> }
// One row per symbol: ';'-joined days aligned to `dates`, each "o,h,l,c,vwap,vol,trades,delivQty,series" or '' (no trade).
export interface BhavShard { dates: string[]; rows: Record<string, string> }

// NSE bulk and block deals, collected daily by the PC (NSE only publishes the latest day's file).
export const DEALS_KEY = 'big-player/deals.json';
export interface Deal { d: string; kind: 'block' | 'bulk'; client: string; side: 'BUY' | 'SELL'; qty: number; price: number }
export interface DealsFile { from: string; to: string; deals: Record<string, Deal[]> }

export interface Session { d: string; o: number; h: number; l: number; c: number; vwap: number; vol: number; trades: number; delivQty: number | null; series: string }

export const encodeSession = (s: Omit<Session, 'd'>) =>
  [s.o, s.h, s.l, s.c, s.vwap, s.vol, s.trades, s.delivQty ?? '', s.series].join(',');

export function decodeRow(dates: string[], row: string): Session[] {
  const out: Session[] = [];
  row.split(';').forEach((cell, i) => {
    if (!cell) return;
    const [o, h, l, c, vwap, vol, trades, dq, series] = cell.split(',');
    out.push({ d: dates[i], o: +o, h: +h, l: +l, c: +c, vwap: +vwap, vol: +vol, trades: +trades, delivQty: dq === '' ? null : +dq, series });
  });
  return out;
}

// ── Intraday flow from 1-minute candles ──────────────────────────────────────

export interface IntradayDay { buyVol: number; sellVol: number; lastHourPct: number }

const istDate = (epochSec: number) => new Date((epochSec + 19800) * 1000).toISOString().slice(0, 10);
const istMinute = (epochSec: number) => { const t = new Date((epochSec + 19800) * 1000); return t.getUTCHours() * 60 + t.getUTCMinutes(); };

// Tick rule per minute: volume counts as buying when the minute closed above the previous minute's close,
// selling when below; unchanged minutes keep the previous direction.
export function intradayFlow(ts: number[], open: number[], close: number[], volume: number[]): Map<string, IntradayDay> {
  const days = new Map<string, IntradayDay & { total: number; late: number }>();
  let prevDay = '', prevClose = 0, dir = 0;
  for (let i = 0; i < ts.length; i++) {
    const sec = ts[i] > 1e12 ? Math.floor(ts[i] / 1000) : ts[i];
    const d = istDate(sec), v = volume[i] ?? 0, c = close[i];
    if (c == null || !v) continue;
    if (d !== prevDay) { prevDay = d; prevClose = open[i] ?? c; dir = 0; }
    if (c > prevClose) dir = 1; else if (c < prevClose) dir = -1;
    prevClose = c;
    const day = days.get(d) ?? { buyVol: 0, sellVol: 0, lastHourPct: 0, total: 0, late: 0 };
    if (dir > 0) day.buyVol += v; else if (dir < 0) day.sellVol += v; else { day.buyVol += v / 2; day.sellVol += v / 2; }
    day.total += v;
    if (istMinute(sec) >= 14 * 60 + 30) day.late += v;
    days.set(d, day);
  }
  return new Map([...days].map(([d, x]) => [d, { buyVol: x.buyVol, sellVol: x.sellVol, lastHourPct: x.total ? (x.late / x.total) * 100 : 0 }]));
}

// ── Daily verdicts ───────────────────────────────────────────────────────────

export const VERDICTS = ['BIG PLAYER BOUGHT', 'BIG PLAYER SOLD', 'RETAIL BUYING / FOMO', 'RETAIL CHURN', 'MIXED / NO CLEAR PLAYER'] as const;
export type Verdict = typeof VERDICTS[number];

export interface DayResult {
  d: string; o: number; h: number; l: number; c: number; chgPct: number | null;
  vol: number; volRatio: number; trades: number; tradesRatio: number;
  avgTradeSize: number; avgTradeValue: number; atsRatio: number;
  delivPct: number | null; delivAvg: number | null;
  vwap: number; closeVsVwap: number; clv: number;
  buyVol: number; sellVol: number; flowSource: 'intraday' | 'candle'; lastHourPct: number | null;
  verdict: Verdict; score: number; confidence: number; baselineDays: number;
}

export interface Summary {
  days: number; counts: Record<Verdict, number>; netScore: number;
  last3Score: number; last3Trend: string; headline: string;
  delivRecent: number | null; delivBase: number | null; cumFlowPct: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

// Thresholds from the tab's rule set.
export const RULES = { bigSize: 1.8, bigDeliv: 60, bigVol: 1.5, nearHigh: 0.7, nearLow: 0.3, smallSize: 0.7, fomoTrades: 1.5, flatPct: 0.5 };

function classify(x: { atsRatio: number; delivPct: number | null; volRatio: number; clv: number; tradesRatio: number; chgPct: number | null }): Verdict {
  const big = x.atsRatio > RULES.bigSize && (x.delivPct ?? 0) > RULES.bigDeliv && x.volRatio > RULES.bigVol;
  if (big && x.clv >= RULES.nearHigh) return 'BIG PLAYER BOUGHT';
  if (big && x.clv <= RULES.nearLow) return 'BIG PLAYER SOLD';
  if (x.atsRatio < RULES.smallSize && x.tradesRatio > RULES.fomoTrades) return 'RETAIL BUYING / FOMO';
  if (x.atsRatio < RULES.smallSize && Math.abs(x.chgPct ?? 0) < RULES.flatPct) return 'RETAIL CHURN';
  return 'MIXED / NO CLEAR PLAYER';
}

// `sessions` is oldest-first and must include up to 20 sessions before the window as the trailing baseline.
export function analyse(sessions: Session[], windowDays: number, intraday?: Map<string, IntradayDay>): { rows: DayResult[]; summary: Summary } {
  const start = Math.max(0, sessions.length - windowDays);
  const rows: DayResult[] = [];
  for (let i = start; i < sessions.length; i++) {
    const s = sessions[i], prev = sessions[i - 1];
    const base = sessions.slice(Math.max(0, i - 20), i).filter(b => b.trades > 0 && b.vol > 0);
    const ats = s.trades > 0 ? s.vol / s.trades : 0;
    const atsAvg = mean(base.map(b => b.vol / b.trades)), volAvg = mean(base.map(b => b.vol)), trAvg = mean(base.map(b => b.trades));
    const delivPct = s.delivQty != null && s.vol > 0 ? (s.delivQty / s.vol) * 100 : null;
    const delivBase = base.filter(b => b.delivQty != null).map(b => (b.delivQty! / b.vol) * 100);
    const delivAvg = delivBase.length ? mean(delivBase) : null;
    const atsRatio = base.length && atsAvg > 0 ? ats / atsAvg : 1;
    const volRatio = base.length && volAvg > 0 ? s.vol / volAvg : 1;
    const tradesRatio = base.length && trAvg > 0 ? s.trades / trAvg : 1;
    const chgPct = prev ? ((s.c - prev.c) / prev.c) * 100 : null;
    const clv = s.h > s.l ? (s.c - s.l) / (s.h - s.l) : 0.5;
    const closeVsVwap = s.vwap > 0 ? ((s.c - s.vwap) / s.vwap) * 100 : 0;

    // Flow: Dhan minute tick-rule split when available, else the candle proxy (up candle = all buying).
    const id = intraday?.get(s.d);
    const buyVol = id ? id.buyVol : s.c > s.o ? s.vol : s.c < s.o ? 0 : s.vol / 2;
    const sellVol = id ? id.sellVol : s.vol - buyVol;
    const flow = s.vol > 0 ? (buyVol - sellVol) / s.vol : 0;

    // Direction in [-1, 1]: where it closed in the range, vs VWAP, and the buy/sell split.
    const signals = [2 * clv - 1, clamp(closeVsVwap / 1), id ? clamp(flow / 0.2) : flow];
    const dir = mean(signals);
    // Institutional footprint in [0, 5]: bigger trades, more delivery, more volume.
    const sizePts = atsRatio > RULES.bigSize ? 2 : atsRatio > 1.3 ? 1 : atsRatio >= RULES.smallSize ? 0.5 : 0;
    const delivPts = delivPct == null ? 0.5 : delivPct > RULES.bigDeliv ? 1.5 : delivAvg != null && delivPct > delivAvg + 10 ? 1 : delivAvg != null && delivPct >= delivAvg ? 0.5 : 0;
    const volPts = volRatio > RULES.bigVol ? 1.5 : volRatio > 1.1 ? 0.75 : 0;
    const strength = sizePts + delivPts + volPts;
    const score = Math.round(clamp(dir * strength, -5, 5)) || 0;

    const verdict = classify({ atsRatio, delivPct, volRatio, clv, tradesRatio, chgPct });
    const agreement = Math.abs(mean(signals.map(Math.sign)));
    let confidence: number;
    if (verdict === 'BIG PLAYER BOUGHT' || verdict === 'BIG PLAYER SOLD') confidence = 45 + 30 * agreement + 25 * mean([atsRatio / RULES.bigSize - 1, ((delivPct ?? RULES.bigDeliv) - RULES.bigDeliv) / 30, volRatio / RULES.bigVol - 1].map(m => Math.min(1, m)));
    else if (verdict === 'RETAIL BUYING / FOMO') confidence = 40 + 30 * Math.min(1, (RULES.smallSize - atsRatio) / 0.3) + 30 * Math.min(1, (tradesRatio - RULES.fomoTrades) / 1.5);
    else if (verdict === 'RETAIL CHURN') confidence = 40 + 30 * Math.min(1, (RULES.smallSize - atsRatio) / 0.3) + 30 * Math.min(1, (RULES.flatPct - Math.abs(chgPct ?? 0)) / RULES.flatPct);
    else confidence = 70 - 40 * Math.min(1, (Math.abs(dir) * strength) / 3);
    if (base.length < 10) confidence *= 0.7;

    rows.push({
      d: s.d, o: s.o, h: s.h, l: s.l, c: s.c, chgPct: chgPct == null ? null : r2(chgPct),
      vol: s.vol, volRatio: r2(volRatio), trades: s.trades, tradesRatio: r2(tradesRatio),
      avgTradeSize: Math.round(ats), avgTradeValue: Math.round(ats * s.vwap), atsRatio: r2(atsRatio),
      delivPct: delivPct == null ? null : r2(delivPct), delivAvg: delivAvg == null ? null : r2(delivAvg),
      vwap: s.vwap, closeVsVwap: r2(closeVsVwap), clv: r2(clv),
      buyVol: Math.round(buyVol), sellVol: Math.round(sellVol), flowSource: id ? 'intraday' : 'candle', lastHourPct: id ? r2(id.lastHourPct) : null,
      verdict, score, confidence: Math.round(clamp(confidence, 5, 99)), baselineDays: base.length,
    });
  }
  return { rows, summary: summarise(rows) };
}

function summarise(rows: DayResult[]): Summary {
  const counts = Object.fromEntries(VERDICTS.map(v => [v, 0])) as Record<Verdict, number>;
  rows.forEach(r => counts[r.verdict]++);
  const last3Score = rows.slice(-3).reduce((a, r) => a + r.score, 0);
  const last3Trend = last3Score >= 6 ? 'Big Accumulation' : last3Score >= 2 ? 'Mild Accumulation' : last3Score <= -6 ? 'Big Distribution' : last3Score <= -2 ? 'Mild Distribution' : 'No clear trend';
  const n = (k: Verdict, label: string) => `${counts[k]} day${counts[k] === 1 ? '' : 's'} ${label}`;
  const parts = [n('BIG PLAYER BOUGHT', 'Big Buying'), n('RETAIL BUYING / FOMO', 'Retail Buying'), n('BIG PLAYER SOLD', 'Big Selling'), n('RETAIL CHURN', 'Retail Churn')];
  const deliv = rows.map(r => r.delivPct).filter((x): x is number => x != null);
  const totVol = rows.reduce((a, r) => a + r.vol, 0);
  return {
    days: rows.length, counts, netScore: rows.reduce((a, r) => a + r.score, 0), last3Score, last3Trend,
    headline: `Last ${rows.length} days: ${parts.join(', ')}. Last 3 days trend: ${last3Trend}`,
    delivRecent: deliv.length >= 5 ? r2(mean(deliv.slice(-5))) : null,
    delivBase: deliv.length > 5 ? r2(mean(deliv.slice(0, -5))) : null,
    cumFlowPct: totVol ? r2((rows.reduce((a, r) => a + r.buyVol - r.sellVol, 0) / totVol) * 100) : 0,
  };
}

// ── Market-wide screener ─────────────────────────────────────────────────────
// One row per stock, precomputed by the PC after each NSE update (NSE data only: the buy/sell split
// uses the candle proxy, since minute candles for every stock would exhaust Dhan's limits).

export const SCREENER_KEY = 'big-player/screener.json';
export const STRONG = 2;                 // a day scoring ≥ +2 (or ≤ −2) counts as an accumulation (distribution) day
export const MIN_TURNOVER_CR = 1;        // stocks trading under ₹1 Cr a day are left out as too noisy

export interface ScreenRow {
  s: string; n: string; sme: boolean;     // symbol, company name, SME board
  c: number; ch1: number | null; ch5: number | null; ch20: number | null;
  sc: number[];                           // last 20 daily scores, oldest first
  v: Verdict;                             // latest day's verdict
  avg3: number; avg5: number; avg10: number;
  streak: number;                         // consecutive latest days ≥ +2 (positive) or ≤ −2 (negative)
  acc10: number; dist10: number;          // accumulation / distribution days in the last 10
  bigBuy: number; bigSell: number;        // rule-based big-player days in the last 20
  dl5: number | null; dl20: number | null; // average delivery %, last 5 vs the 20 before them
  to: number;                             // average daily turnover, ₹ Cr, last 20
  deal5: number;                          // net named bulk/block buying, ₹ Cr, last 5 sessions
}
export interface ScreenerFile { updatedAt: string; asOf: string; minTurnoverCr: number; rows: ScreenRow[] }

// A block trade large enough to be a bulk deal appears in both NSE files; keep the block entry.
export function dedupeDeals<T extends Deal>(deals: T[]): T[] {
  const sig = (x: Deal) => `${x.d}|${x.client}|${x.side}|${x.qty}|${x.price}`;
  const blocks = new Set(deals.filter(x => x.kind === 'block').map(sig));
  return deals.filter(x => x.kind === 'block' || !blocks.has(sig(x)));
}

export function screenStock(symbol: string, name: string, sessions: Session[], deals: Deal[], asOf: string): ScreenRow | null {
  if (sessions.length < 30 || sessions.at(-1)!.d !== asOf) return null;   // needs a baseline and a trade on the latest day
  const last20 = sessions.slice(-20);
  const to = mean(last20.map(s => s.vol * s.vwap)) / 1e7;
  if (to < MIN_TURNOVER_CR) return null;
  const rows = analyse(sessions, 20).rows, sc = rows.map(r => r.score);
  const avg = (n: number) => r2(mean(sc.slice(-n)));
  let streak = 0;
  const sign = sc.at(-1)! >= STRONG ? 1 : sc.at(-1)! <= -STRONG ? -1 : 0;
  if (sign) for (let i = sc.length - 1; i >= 0 && sign * sc[i] >= STRONG; i--) streak += sign;
  const chg = (n: number) => (sessions.length > n ? r2((sessions.at(-1)!.c / sessions.at(-1 - n)!.c - 1) * 100) : null);
  const deliv = (xs: Session[]) => { const v = xs.filter(s => s.delivQty != null).map(s => (s.delivQty! / s.vol) * 100); return v.length ? r2(mean(v)) : null; };
  const recent = new Set(sessions.slice(-5).map(s => s.d));
  const deal5 = dedupeDeals(deals).filter(x => recent.has(x.d)).reduce((a, x) => a + (x.side === 'BUY' ? 1 : -1) * x.qty * x.price, 0) / 1e7;
  return {
    s: symbol, n: name, sme: ['SM', 'ST'].includes(sessions.at(-1)!.series),
    c: sessions.at(-1)!.c, ch1: chg(1), ch5: chg(5), ch20: chg(20),
    sc, v: rows.at(-1)!.verdict, avg3: avg(3), avg5: avg(5), avg10: avg(10), streak,
    acc10: sc.slice(-10).filter(x => x >= STRONG).length, dist10: sc.slice(-10).filter(x => x <= -STRONG).length,
    bigBuy: rows.filter(r => r.verdict === 'BIG PLAYER BOUGHT').length, bigSell: rows.filter(r => r.verdict === 'BIG PLAYER SOLD').length,
    dl5: deliv(sessions.slice(-5)), dl20: deliv(sessions.slice(-25, -5)), to: r2(to), deal5: r2(deal5),
  };
}

// Conviction (buy side; negate the row's sign for sell side): recent strength, persistence over 10 days,
// rule-based big-player days, and named bulk/block deals (±1 at ₹10 Cr net or more).
export const conviction = (r: ScreenRow) =>
  r2(r.avg5 + 0.5 * (r.acc10 - r.dist10) + (r.bigBuy - r.bigSell) + clamp(r.deal5 / 10));
