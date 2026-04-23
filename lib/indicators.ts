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
  // Bonus
  vcp: boolean;
  // Derived flags
  bbSqueeze: boolean;
  volDryup: boolean;
  stage2: boolean;
  // Partial scores
  ptsBase: number;
  ptsVolume: number;
  ptsMomentum: number;
  ptsVcp: number;
  setupNotes: string;
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function sma(arr: number[], period: number): number {
  if (arr.length < period) return NaN;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function stddev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

// ── Indicator calculations ────────────────────────────────────────────────────

function calcBBWidth(closes: number[], period = 20, multiplier = 2): number {
  if (closes.length < period) return NaN;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
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
  // First ATR = simple average
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = atr;
  // Wilder smoothing
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = atr;
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  const diffs = closes.slice(1).map((v, i) => v - closes[i]);
  const recent = diffs.slice(-(period));
  const gains = recent.map(d => d > 0 ? d : 0);
  const losses = recent.map(d => d < 0 ? -d : 0);
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
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

  // Wilder smoothing
  let atr14   = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let diP14   = dmPlus.slice(0, period).reduce((a, b) => a + b, 0);
  let diM14   = dmMinus.slice(0, period).reduce((a, b) => a + b, 0);
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
  return dxArr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function detectVCP(closes: number[], lookback = 40, order = 4): boolean {
  const data = closes.slice(-lookback);
  if (data.length < lookback) return false;

  // Find local minima
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

  // Higher lows
  if (!(troughs[1] > troughs[0] && troughs[2] > troughs[1])) return false;

  // Contracting ranges between swing lows
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
    price >= high52 * 0.65    // within 35% of 52W high
  );
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function buildSetupNotes(r: StockResult): string {
  const notes: string[] = [];
  if (r.bbSqueeze)                                              notes.push('BB Squeeze');
  if (r.volDryup)                                               notes.push('Vol Dry-up');
  if (r.atrPct != null && r.range5dPct != null && r.atrPct < 2)notes.push('ATR Contracting');
  if (r.range5dPct != null && r.range5dPct < 6)                notes.push('Tight Range');
  if (r.upVolDominance != null && r.upVolDominance > 0.5)      notes.push(`Up-vol ${(r.upVolDominance * 100).toFixed(0)}%`);
  if (r.rsVsNifty != null && r.rsVsNifty > 0)                 notes.push(`RS +${r.rsVsNifty.toFixed(1)}%`);
  if (r.rsi != null && r.rsi >= 50 && r.rsi <= 68)            notes.push(`RSI ${r.rsi.toFixed(0)}`);
  if (r.adx != null && r.adx < 22)                             notes.push(`ADX ${r.adx.toFixed(0)} (coiling)`);
  if (r.vcp)                                                    notes.push('VCP');
  return notes.join(' | ') || 'Stage 2 only';
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

  // ── Base signals ──────────────────────────────────────────────────────
  const bbWidthPct = calcBBWidth(closes);
  const bbSqueeze  = !isNaN(bbWidthPct) && bbWidthPct < 8;
  if (bbSqueeze) ptsBase++;

  const atrSeries = calcATRSeries(highs, lows, closes);
  const validATR  = atrSeries.filter(v => !isNaN(v));
  const atrPct    = validATR.length > 0
    ? (validATR[validATR.length - 1] / closes[closes.length - 1]) * 100
    : null;
  const p25ATR    = validATR.length > 63
    ? [...validATR.slice(-63)].sort((a, b) => a - b)[Math.floor(63 * 0.25)]
    : null;
  const currentATRraw = validATR.length > 0 ? validATR[validATR.length - 1] : null;
  const p25ATRraw = validATR.length > 63
    ? [...validATR.slice(-63)].sort((a, b) => a - b)[Math.floor(63 * 0.25)]
    : null;
  if (currentATRraw != null && p25ATRraw != null && currentATRraw <= p25ATRraw) ptsBase++;

  const lastHighs = highs.slice(-5);
  const lastLows  = lows.slice(-5);
  const range5dPct = lastHighs.length >= 5
    ? (Math.max(...lastHighs) - Math.min(...lastLows)) / Math.min(...lastLows) * 100
    : null;
  if (range5dPct != null && range5dPct < 6) ptsBase++;

  // ── Volume signals ────────────────────────────────────────────────────
  const vol10  = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const vol50  = volumes.slice(-50).reduce((a, b) => a + b, 0) / 50;
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

  // ── Momentum signals ──────────────────────────────────────────────────
  const rsi = calcRSI(closes);
  const rsiOk = !isNaN(rsi) && rsi >= 50 && rsi <= 68;
  if (rsiOk) ptsMomentum++;

  const adx = calcADX(highs, lows, closes);
  const adxOk = !isNaN(adx) && adx < 22;
  if (adxOk) ptsMomentum++;

  // ── VCP ───────────────────────────────────────────────────────────────
  const vcp    = detectVCP(closes);
  const ptsVcp = vcp ? 1 : 0;

  const score = ptsBase + ptsVolume + ptsMomentum + ptsVcp;

  const result: StockResult = {
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
    bbSqueeze,
    volDryup,
    stage2:         true,
    ptsBase,
    ptsVolume,
    ptsMomentum,
    ptsVcp,
    setupNotes:     '',
  };
  result.setupNotes = buildSetupNotes(result);
  return result;
}
