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

// stocks: every symbol in the shards → [Dhan NSE security ID (0 if unknown), company name].
export interface BhavIndex { updatedAt: string; dates: string[]; stocks: Record<string, [number, string]> }
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
