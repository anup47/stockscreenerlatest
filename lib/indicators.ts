import type { Stock } from './universe';

export interface OHLCVRow {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume: number;
}

export interface StockResult {
  symbol: string;
  company: string;
  price: number;
  score: number;
  // Base signals (0–3 pts)
  bbWidthPct: number | null;
  atrPct: number | null;
  range5dPct: number | null;
  // Volume signals (0–3 pts)
  volRatio: number | null;
  upVolDominance: number | null;
  rsVsNifty: number | null;
  // Momentum signals (0–2 pts)
  rsi: number | null;
  adx: number | null;
  // Pattern bonuses (0–1 pt each)
  vcp: boolean;         // Volatility Contraction Pattern
  tightSqueeze: boolean;// BB width < 5% + price hugging middle band
  instSpike: boolean;   // Vol dry-up followed by absorption spike
  longBase: boolean;    // 6+ month flat base, breaking out on volume
  // Derived flags
  bbSqueeze: boolean;   // BB width < 8%
  volDryup: boolean;
  stage2: boolean;
  // Partial scores
  ptsBase: number;
  ptsVolume: number;
  ptsMomentum: number;
  ptsPatterns: number;
  setupNotes: string;
  // Active pattern names (for display)
  patterns: string[];
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sma(arr: number[], period: number): number {
  if (arr.length < period) return NaN;
  return avg(arr.slice(-period));
}

function stddev(arr: number[]): number {
  const mean = avg(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

// ── Indicator calculations ────────────────────────────────────────────────────

function calcBBWidth(closes: number[], period = 20, multiplier = 2): number {
  if (closes.length < period) return NaN;
  const slice = closes.slice(-period);
  const mean = avg(slice);
  const std = stddev(slice);
  return ((multiplier * 2 * std) / mean) * 100;
}

function calcATRSeries(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  const result: number[] = new Array(tr.length).fill(NaN);
  if (tr.length < period) return result;
  let atr = avg(tr.slice(0, period));
  result[period - 1] = atr;
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = atr;
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  const diffs = closes.slice(1).map((v, i) => v - closes[i]);
  const recent = diffs.slice(-period);
  const gains = recent.map(d => (d > 0 ? d : 0));
  const losses = recent.map(d => (d < 0 ? -d : 0));
  const avgGain = avg(gains);
  const avgLoss = avg(losses);
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period * 2 + 1) return NaN;
  const tr: number[] = [];
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    dmPlus.push(up > dn && up > 0 ? up : 0);
    dmMinus.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  let atr14 = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let diP14 = dmPlus.slice(0, period).reduce((a, b) => a + b, 0);
  let diM14 = dmMinus.slice(0, period).reduce((a, b) => a + b, 0);
  const dxArr: number[] = [];
  for (let i = period; i < tr.length; i++) {
    atr14 = atr14 - atr14 / period + tr[i];
    diP14 = diP14 - diP14 / period + dmPlus[i];
    diM14 = diM14 - diM14 / period + dmMinus[i];
    const diP = atr14 === 0 ? 0 : 100 * diP14 / atr14;
    const diM = atr14 === 0 ? 0 : 100 * diM14 / atr14;
    const sum = diP + diM;
    dxArr.push(sum === 0 ? 0 : 100 * Math.abs(diP - diM) / sum);
  }
  if (dxArr.length < period) return NaN;
  return avg(dxArr.slice(-period));
}

// ── Pattern 1: VCP — Volatility Contraction Pattern (Minervini) ──────────────
// Series of progressively tighter pullbacks with drying volume.
// Each trough higher than previous (higher lows), each range contracting ≥30%.

export function detectVCP(closes: number[], lookback = 40, order = 4): boolean {
  const data = closes.slice(-lookback);
  if (data.length < lookback) return false;
  const minimaIdx: number[] = [];
  for (let i = order; i < data.length - order; i++) {
    let isMin = true;
    for (let j = 1; j <= order; j++) {
      if (data[i] > data[i - j] || data[i] > data[i + j]) { isMin = false; break; }
    }
    if (isMin) minimaIdx.push(i);
  }
  if (minimaIdx.length < 3) return false;
  const last3 = minimaIdx.slice(-3);
  const troughs = last3.map(i => data[i]);
  if (!(troughs[1] > troughs[0] && troughs[2] > troughs[1])) return false;
  const ranges: number[] = [];
  for (let i = 0; i < last3.length - 1; i++) {
    const seg = data.slice(last3[i], last3[i + 1] + 1);
    ranges.push(Math.max(...seg) - Math.min(...seg));
  }
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i] > ranges[i - 1] * 0.70) return false;
  }
  return true;
}

// ── Pattern 2: Tight BB Squeeze ───────────────────────────────────────────────
// BB width < 5% of price (tighter than standard 8% threshold).
// Price hugging the middle band (within 1.5% of 20 SMA).
// The spring is fully compressed — the next candle outside the bands is the signal.

export function detectTightSqueeze(closes: number[]): boolean {
  const width = calcBBWidth(closes);
  if (isNaN(width) || width >= 5) return false;
  const mid = sma(closes, 20);
  const price = closes[closes.length - 1];
  const deviation = Math.abs(price - mid) / mid * 100;
  return deviation < 1.5;
}

// ── Pattern 3: Institutional Absorption Spike ─────────────────────────────────
// 4–8 weeks of silent accumulation (volume 40–60% below normal).
// Then one day with 4–10x the dry-up average on a SMALL price candle.
// Institutions absorbing supply without revealing themselves via price.

export function detectInstSpike(
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[],
): boolean {
  if (volumes.length < 65) return false;

  // Reference period: 60-day average volume
  const refAvg = avg(volumes.slice(-65, -5));

  // Dry-up window: last 20–40 trading days, excluding last 5
  const dryupVols = volumes.slice(-40, -5);
  const dryupAvg = avg(dryupVols);

  // Dry-up confirmed: the quiet period must be < 55% of reference volume
  if (dryupAvg > refAvg * 0.55) return false;

  // Look for the spike in the last 5 days
  const recentVols  = volumes.slice(-5);
  const recentHighs = highs.slice(-5);
  const recentLows  = lows.slice(-5);
  const recentClose = closes.slice(-5);

  for (let i = 0; i < recentVols.length; i++) {
    if (recentVols[i] >= dryupAvg * 4) {
      // Key check: big volume but small price move (institutions absorbing)
      const dayRange = (recentHighs[i] - recentLows[i]) / recentClose[i] * 100;
      if (dayRange < 4) return true;
    }
  }
  return false;
}

// ── Pattern 4: Long Base Breakout ─────────────────────────────────────────────
// Stock flat for 6+ months (126 trading days) in a tight range (< 30%).
// Now near the top of that range (within 5% of 6-month high).
// Breaking out on elevated volume (last 3 days > 1.3x 20-day avg).
// "The bigger the base, the bigger the case."

export function detectLongBase(
  closes: number[],
  highs: number[],
  volumes: number[],
): boolean {
  if (closes.length < 130) return false;

  const base = closes.slice(-126);
  const baseHigh = Math.max(...base);
  const baseLow  = Math.min(...base);
  const baseRange = (baseHigh - baseLow) / baseLow * 100;

  // Base must be tight (stock hasn't moved much in 6 months)
  if (baseRange > 30) return false;

  const currentPrice = closes[closes.length - 1];

  // Must be near the top of the base (approaching or breaking resistance)
  if (currentPrice < baseHigh * 0.95) return false;

  // Volume must be picking up (breakout confirmation)
  const vol20avg = avg(volumes.slice(-20));
  const vol3avg  = avg(volumes.slice(-3));
  if (vol3avg < vol20avg * 1.3) return false;

  return true;
}

// ── Stage 2 filter ────────────────────────────────────────────────────────────

function passesStage2(closes: number[]): boolean {
  if (closes.length < 200) return false;
  const price  = closes[closes.length - 1];
  const s50    = sma(closes, 50);
  const s150   = sma(closes, 150);
  const s200   = sma(closes, 200);
  const high52 = Math.max(...closes.slice(-252));
  return (
    price > s50 &&
    s50 > s150 &&
    s150 > s200 &&
    price >= high52 * 0.65
  );
}

// ── Setup notes builder ───────────────────────────────────────────────────────

function buildSetupNotes(r: Omit<StockResult, 'setupNotes' | 'patterns'>): { notes: string; patterns: string[] } {
  const parts: string[] = [];
  const patterns: string[] = [];

  if (r.bbSqueeze)                                              { parts.push('BB Squeeze (<8%)'); }
  if (r.tightSqueeze)                                           { parts.push('Tight Squeeze (<5%)'); patterns.push('Tight BB Squeeze'); }
  if (r.volDryup)                                               { parts.push('Vol Dry-up'); }
  if (r.instSpike)                                              { parts.push('Institutional Absorption Spike'); patterns.push('Institutional Spike'); }
  if (r.rsVsNifty != null && r.rsVsNifty > 0)                  parts.push(`RS +${r.rsVsNifty.toFixed(1)}% vs Nifty`);
  if (r.rsi != null && r.rsi >= 50 && r.rsi <= 68)             parts.push(`RSI ${r.rsi.toFixed(0)}`);
  if (r.adx != null && r.adx < 22)                             parts.push(`ADX ${r.adx.toFixed(0)} (coiling)`);
  if (r.vcp)                                                    { parts.push('VCP'); patterns.push('VCP'); }
  if (r.longBase)                                               { parts.push('Long Base Breakout'); patterns.push('Long Base Breakout'); }

  // Assign top-level pattern name for the "Coiled Spring" setup
  if (patterns.length === 0 && (r.bbSqueeze || r.volDryup) && r.score >= 4) {
    patterns.push('Coiled Spring');
  }

  return { notes: parts.join(' | ') || 'Stage 2 structure', patterns };
}

// ── Main screener function ────────────────────────────────────────────────────

export function screenStock(
  stock: Stock,
  rows: OHLCVRow[],
  niftyReturn63d: number,
): StockResult | null {
  if (rows.length < 200) return null;

  const closes  = rows.map(r => r.adjClose ?? r.close);
  const highs   = rows.map(r => r.high);
  const lows    = rows.map(r => r.low);
  const volumes = rows.map(r => r.volume);

  if (!passesStage2(closes)) return null;

  let ptsBase = 0;
  let ptsVolume = 0;
  let ptsMomentum = 0;
  let ptsPatterns = 0;

  // ── Base signals (0–3 pts) ────────────────────────────────────────────
  const bbWidthPct = calcBBWidth(closes);
  const bbSqueeze  = !isNaN(bbWidthPct) && bbWidthPct < 8;
  if (bbSqueeze) ptsBase++;

  const atrSeries = calcATRSeries(highs, lows, closes);
  const validATR  = atrSeries.filter(v => !isNaN(v));
  const atrPct    = validATR.length > 0
    ? (validATR[validATR.length - 1] / closes[closes.length - 1]) * 100
    : null;
  const p25ATRraw = validATR.length > 63
    ? [...validATR.slice(-63)].sort((a, b) => a - b)[Math.floor(63 * 0.25)]
    : null;
  const currentATRraw = validATR.length > 0 ? validATR[validATR.length - 1] : null;
  if (currentATRraw != null && p25ATRraw != null && currentATRraw <= p25ATRraw) ptsBase++;

  const lastHighs  = highs.slice(-5);
  const lastLows   = lows.slice(-5);
  const range5dPct = lastHighs.length >= 5
    ? (Math.max(...lastHighs) - Math.min(...lastLows)) / Math.min(...lastLows) * 100
    : null;
  if (range5dPct != null && range5dPct < 6) ptsBase++;

  // ── Volume signals (0–3 pts) ──────────────────────────────────────────
  const vol10    = avg(volumes.slice(-10));
  const vol50    = avg(volumes.slice(-50));
  const volRatio = vol50 > 0 ? vol10 / vol50 : null;
  const volDryup = volRatio != null && volRatio < 0.60;
  if (volDryup) ptsVolume++;

  const last20closes  = closes.slice(-21);
  const last20volumes = volumes.slice(-20);
  let upVol = 0, downVol = 0;
  for (let i = 1; i < last20closes.length; i++) {
    if (last20closes[i] > last20closes[i - 1]) upVol += last20volumes[i - 1];
    else downVol += last20volumes[i - 1];
  }
  const upVolDominance = (upVol + downVol) > 0 ? upVol / (upVol + downVol) : null;
  if (upVolDominance != null && upVol > downVol) ptsVolume++;

  let rsVsNifty: number | null = null;
  if (closes.length >= 64) {
    const stockReturn = (closes[closes.length - 1] / closes[closes.length - 64] - 1) * 100;
    rsVsNifty = parseFloat((stockReturn - niftyReturn63d).toFixed(2));
    if (rsVsNifty > 0) ptsVolume++;
  }

  // ── Momentum signals (0–2 pts) ────────────────────────────────────────
  const rsi   = calcRSI(closes);
  const rsiOk = !isNaN(rsi) && rsi >= 50 && rsi <= 68;
  if (rsiOk) ptsMomentum++;

  const adx   = calcADX(highs, lows, closes);
  const adxOk = !isNaN(adx) && adx < 22;
  if (adxOk) ptsMomentum++;

  // ── Pattern bonuses (0–1 pt each, max 4 pts) ──────────────────────────
  const vcp          = detectVCP(closes);
  const tightSqueeze = detectTightSqueeze(closes);
  const instSpike    = detectInstSpike(closes, highs, lows, volumes);
  const longBase     = detectLongBase(closes, highs, volumes);

  if (vcp)          ptsPatterns++;
  if (tightSqueeze) ptsPatterns++;
  if (instSpike)    ptsPatterns++;
  if (longBase)     ptsPatterns++;

  const score = ptsBase + ptsVolume + ptsMomentum + ptsPatterns;

  const partial = {
    symbol:         stock.nse_symbol,
    company:        stock.company,
    price:          closes[closes.length - 1],
    score,
    bbWidthPct:     !isNaN(bbWidthPct) ? parseFloat(bbWidthPct.toFixed(2)) : null,
    atrPct:         atrPct != null ? parseFloat(atrPct.toFixed(2)) : null,
    range5dPct:     range5dPct != null ? parseFloat(range5dPct.toFixed(2)) : null,
    volRatio:       volRatio != null ? parseFloat(volRatio.toFixed(2)) : null,
    upVolDominance: upVolDominance != null ? parseFloat(upVolDominance.toFixed(2)) : null,
    rsVsNifty,
    rsi:            !isNaN(rsi) ? parseFloat(rsi.toFixed(1)) : null,
    adx:            !isNaN(adx) ? parseFloat(adx.toFixed(1)) : null,
    vcp,
    tightSqueeze,
    instSpike,
    longBase,
    bbSqueeze,
    volDryup,
    stage2:         true,
    ptsBase,
    ptsVolume,
    ptsMomentum,
    ptsPatterns,
  };

  const { notes, patterns } = buildSetupNotes(partial);

  return { ...partial, setupNotes: notes, patterns };
}
