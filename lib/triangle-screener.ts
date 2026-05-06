import type { Stock } from './universe';
import type { OHLCVRow } from './indicators';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface TriangleDebug {
  resistanceLevel: number;
  resistanceTouches: number;
  touchPrices: number[];
  risingLowsCount: number;
  swingLowPrices: number[];
  compressionRatio: number;
  rsiValue: number;
  rsiStatus: 'Bullish' | 'Neutral' | 'Overbought' | 'Bearish';
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdHistPrev: number;
  macdStatus: 'Bullish' | 'Neutral' | 'Bearish';
  obvSlope: number;
  obvStatus: 'Rising' | 'Flat' | 'Falling';
  breakoutDistPct: number;
  isAboveResistance: boolean;
  scoreBreakdown: {
    resistanceTouches: number;
    risingLows: number;
    confirmations: number;
    proximity: number;
  };
}

export interface TriangleResult {
  symbol: string;
  company: string;
  timeframe: 'Daily' | 'Weekly';
  price: number;
  resistance: number;
  breakoutDistPct: number;
  isAboveResistance: boolean;
  patternScore: number;
  confirmationScore: number;
  confirmationsHit: number;
  proximityScore: number;
  totalScore: number;
  rsiValue: number;
  rsiStatus: string;
  macdStatus: string;
  obvStatus: string;
  signalLabel: string;
  debug: TriangleDebug;
}

// ── Weekly aggregation ────────────────────────────────────────────────────────

export function aggregateWeekly(rows: OHLCVRow[]): OHLCVRow[] {
  const weekMap = new Map<string, OHLCVRow[]>();

  for (const row of rows) {
    const d = new Date(row.date);
    const dow = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const key = monday.toISOString().slice(0, 10);
    if (!weekMap.has(key)) weekMap.set(key, []);
    weekMap.get(key)!.push(row);
  }

  const result: OHLCVRow[] = [];
  for (const dayRows of weekMap.values()) {
    dayRows.sort((a, b) => a.date.getTime() - b.date.getTime());
    result.push({
      date:   dayRows[0].date,
      open:   dayRows[0].open,
      high:   Math.max(...dayRows.map(r => r.high)),
      low:    Math.min(...dayRows.map(r => r.low)),
      close:  dayRows[dayRows.length - 1].close,
      volume: dayRows.reduce((s, r) => s + r.volume, 0),
    });
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function emaArr(arr: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    out.push(arr[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  let ag = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let al = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < gains.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period;
    al = (al * (period - 1) + losses[i]) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

// Adaptive MACD: periods differ by timeframe; "adaptive" = histogram direction tracked
function calcAdaptiveMacd(
  closes: number[],
  fast: number,
  slow: number,
  sig: number,
): { line: number; signal: number; histogram: number; histPrev: number } {
  if (closes.length < slow + sig + 2) {
    return { line: 0, signal: 0, histogram: 0, histPrev: 0 };
  }
  const e12 = emaArr(closes, fast);
  const e26 = emaArr(closes, slow);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const sigArr = emaArr(macdLine.slice(-(sig * 3)), sig);
  const n = sigArr.length;
  const histogram  = macdLine[macdLine.length - 1] - sigArr[n - 1];
  const histPrev   = macdLine[macdLine.length - 2] - sigArr[n - 2];
  return {
    line:      +macdLine[macdLine.length - 1].toFixed(4),
    signal:    +sigArr[n - 1].toFixed(4),
    histogram: +histogram.toFixed(4),
    histPrev:  +histPrev.toFixed(4),
  };
}

function computeOBV(rows: OHLCVRow[]): number[] {
  const out = [0];
  for (let i = 1; i < rows.length; i++) {
    const prev = out[i - 1];
    if (rows[i].close > rows[i - 1].close)      out.push(prev + rows[i].volume);
    else if (rows[i].close < rows[i - 1].close) out.push(prev - rows[i].volume);
    else                                          out.push(prev);
  }
  return out;
}

// Linear regression slope (least-squares) over array
function linSlope(arr: number[]): number {
  const n = arr.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += arr[i]; sxy += i * arr[i]; sx2 += i * i;
  }
  const denom = n * sx2 - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

// ── Pivot detection ───────────────────────────────────────────────────────────

function findPivotHighs(
  highs: number[],
  order: number,
): { idx: number; price: number }[] {
  const pivots: { idx: number; price: number }[] = [];
  for (let i = order; i < highs.length - order; i++) {
    let ok = true;
    for (let j = 1; j <= order; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) { ok = false; break; }
    }
    if (ok) pivots.push({ idx: i, price: highs[i] });
  }
  return pivots;
}

function findPivotLows(
  lows: number[],
  order: number,
): { idx: number; price: number }[] {
  const pivots: { idx: number; price: number }[] = [];
  for (let i = order; i < lows.length - order; i++) {
    let ok = true;
    for (let j = 1; j <= order; j++) {
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) { ok = false; break; }
    }
    if (ok) pivots.push({ idx: i, price: lows[i] });
  }
  return pivots;
}

// Cluster pivot highs to find the strongest horizontal resistance zone
function findResistanceZone(
  pivotHighs: { idx: number; price: number }[],
): { level: number; touches: number; firstTouchIdx: number; touchPrices: number[] } | null {
  if (pivotHighs.length < 2) return null;

  let best: { level: number; touches: number; firstTouchIdx: number; touchPrices: number[] } | null = null;

  for (const pivot of pivotHighs) {
    const cluster = pivotHighs.filter(p => Math.abs(p.price / pivot.price - 1) < 0.015);
    if (cluster.length < 2) continue;

    // Prefer clusters with more touches; break ties by recency of last touch
    const lastIdx = cluster[cluster.length - 1].idx;
    if (
      best === null ||
      cluster.length > best.touches ||
      (cluster.length === best.touches && lastIdx > best.firstTouchIdx)
    ) {
      const level = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      best = {
        level: +level.toFixed(2),
        touches: cluster.length,
        firstTouchIdx: cluster[0].idx,
        touchPrices: cluster.map(p => +p.price.toFixed(2)),
      };
    }
  }

  return best;
}

// Rising swing lows below resistance, after the first resistance touch
function findRisingLows(
  pivotLows: { idx: number; price: number }[],
  resistance: number,
  afterIdx: number,
): { count: number; prices: number[]; isRising: boolean } {
  const relevant = pivotLows
    .filter(p => p.idx >= afterIdx && p.price < resistance * 0.985)
    .slice(-6); // most recent 6 qualifying lows

  if (relevant.length < 2) {
    return { count: relevant.length, prices: relevant.map(p => +p.price.toFixed(2)), isRising: false };
  }

  let risingPairs = 0;
  for (let i = 1; i < relevant.length; i++) {
    if (relevant[i].price > relevant[i - 1].price) risingPairs++;
  }

  // "Rising" requires all consecutive pairs to be higher lows
  const isRising = risingPairs === relevant.length - 1;
  return {
    count: relevant.length,
    prices: relevant.map(p => +p.price.toFixed(2)),
    isRising,
  };
}

// ── Signal label ──────────────────────────────────────────────────────────────

function signalLabel(score: number, isAbove: boolean, distPct: number): string {
  if (isAbove && distPct >= -5) return 'Recent Breakout';
  if (score >= 10) return 'Strong — Near Breakout';
  if (score >= 8)  return 'High Quality Pattern';
  if (score >= 6)  return 'Developing Pattern';
  return 'Monitor — Early Stage';
}

// ── Main screener function ────────────────────────────────────────────────────

const MIN_SCORE = 5;

export function screenTriangleStock(
  stock: Stock,
  rows: OHLCVRow[],
  timeframe: 'Daily' | 'Weekly',
): TriangleResult | null {
  const minRows = timeframe === 'Daily' ? 60 : 30;
  if (rows.length < minRows) return null;

  const lookback  = timeframe === 'Daily' ? 90 : 40;
  const pivotOrder = timeframe === 'Daily' ? 3 : 2;

  // Use the most recent `lookback` bars for pattern detection
  const window = rows.slice(-lookback);
  const highs  = window.map(r => r.high);
  const lows   = window.map(r => r.low);

  const pivotHighs = findPivotHighs(highs, pivotOrder);
  const pivotLows  = findPivotLows(lows, pivotOrder);

  const resistance = findResistanceZone(pivotHighs);
  if (!resistance || resistance.touches < 2) return null;

  const { level: resLevel, touches, firstTouchIdx, touchPrices } = resistance;

  const risingLows = findRisingLows(pivotLows, resLevel, firstTouchIdx);
  if (risingLows.count < 2 || !risingLows.isRising) return null;

  const price = rows[rows.length - 1].close;

  // Compression: earliest range vs current range in the pattern window
  const patternStart = firstTouchIdx;
  const lowestAtStart = Math.min(...lows.slice(patternStart, patternStart + pivotOrder + 2));
  const initialRange  = resLevel - lowestAtStart;
  const currentRange  = resLevel - risingLows.prices[risingLows.prices.length - 1];
  const compressionRatio = initialRange > 0 ? +( currentRange / initialRange).toFixed(2) : 1;

  // ── Indicators ──────────────────────────────────────────────────────────────

  const closes = rows.map(r => r.close);

  const rsiVal = +calcRsi(closes).toFixed(1);
  const rsiStatus: TriangleDebug['rsiStatus'] =
    rsiVal >= 72    ? 'Overbought' :
    rsiVal >= 45    ? 'Bullish'    :
    rsiVal >= 35    ? 'Neutral'    : 'Bearish';

  const macdPeriods = timeframe === 'Daily'
    ? { fast: 12, slow: 26, sig: 9 }
    : { fast: 8,  slow: 17, sig: 5 };
  const macdData = calcAdaptiveMacd(closes, macdPeriods.fast, macdPeriods.slow, macdPeriods.sig);
  const macdStatus: TriangleDebug['macdStatus'] =
    macdData.line > macdData.signal && macdData.histogram > macdData.histPrev ? 'Bullish'  :
    macdData.line > macdData.signal                                             ? 'Neutral'  : 'Bearish';

  const obvArr  = computeOBV(rows);
  const obv10   = obvArr.slice(-10);
  const slope   = +linSlope(obv10).toFixed(0);
  const obvStd  = obv10.reduce((s, v) => s + Math.abs(v - obv10[Math.floor(obv10.length / 2)]), 0) / obv10.length;
  const obvStatus: TriangleDebug['obvStatus'] =
    slope > obvStd * 0.1  ? 'Rising'  :
    slope < -obvStd * 0.1 ? 'Falling' : 'Flat';

  // ── Confirmations ───────────────────────────────────────────────────────────

  const rsiBull  = rsiStatus === 'Bullish';
  const macdBull = macdStatus === 'Bullish';
  const obvBull  = obvStatus  === 'Rising';
  const confirmationsHit = (rsiBull ? 1 : 0) + (macdBull ? 1 : 0) + (obvBull ? 1 : 0);

  if (confirmationsHit < 2) return null;

  // ── Scoring ─────────────────────────────────────────────────────────────────

  // Pattern Quality (0–5)
  const ptsTouches   = touches >= 3 ? 3 : 2;
  const ptsRisingLow = risingLows.count >= 3 ? 2 : 1;
  const patternScore = ptsTouches + ptsRisingLow;

  // Confirmations (0–3)
  const confirmationScore = confirmationsHit;

  // Proximity bonus (0–4)
  const isAbove = price > resLevel;
  const distPct = isAbove
    ? -+((price / resLevel - 1) * 100).toFixed(1)   // negative = above
    : +((resLevel / price - 1) * 100).toFixed(1);   // positive = below

  let proximityScore = 0;
  if (!isAbove) {
    if (distPct <= 10) proximityScore++;
    if (distPct <= 5)  proximityScore++;
    if (distPct <= 2)  proximityScore++;
  } else {
    // Above resistance — recent breakout bonus if within 5% above
    if (-distPct <= 5) proximityScore++;
    proximityScore++; // being above at all gets +1 baseline proximity
  }

  const totalScore = Math.min(12, patternScore + confirmationScore + proximityScore);

  if (totalScore < MIN_SCORE) return null;

  const breakoutDistPct = isAbove
    ? -+((price / resLevel - 1) * 100).toFixed(2)
    : +((resLevel / price - 1) * 100).toFixed(2);

  const debug: TriangleDebug = {
    resistanceLevel: resLevel,
    resistanceTouches: touches,
    touchPrices,
    risingLowsCount: risingLows.count,
    swingLowPrices: risingLows.prices,
    compressionRatio,
    rsiValue: rsiVal,
    rsiStatus,
    macdLine: macdData.line,
    macdSignal: macdData.signal,
    macdHistogram: macdData.histogram,
    macdHistPrev: macdData.histPrev,
    macdStatus,
    obvSlope: slope,
    obvStatus,
    breakoutDistPct,
    isAboveResistance: isAbove,
    scoreBreakdown: {
      resistanceTouches: ptsTouches,
      risingLows: ptsRisingLow,
      confirmations: confirmationScore,
      proximity: proximityScore,
    },
  };

  return {
    symbol: stock.nse_symbol,
    company: stock.company,
    timeframe,
    price: +price.toFixed(2),
    resistance: resLevel,
    breakoutDistPct,
    isAboveResistance: isAbove,
    patternScore,
    confirmationScore,
    confirmationsHit,
    proximityScore,
    totalScore,
    rsiValue: rsiVal,
    rsiStatus,
    macdStatus,
    obvStatus,
    signalLabel: signalLabel(totalScore, isAbove, breakoutDistPct),
    debug,
  };
}
