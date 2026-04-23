export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1min' | '2min' | '5min' | '10min' | '30min' | '1hour' | '1day' | '1week' | '1month';
export type Duration = 'intraday' | 'btst' | '1week' | '1month' | '3months' | '6months' | '1year';

// ── Math helpers ─────────────────────────────────────────────────────────────

function avg(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function sma(arr: number[], n: number) {
  if (arr.length < n) return NaN;
  return avg(arr.slice(-n));
}

function ema(arr: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = arr[0];
  for (let i = 0; i < arr.length; i++) {
    prev = i === 0 ? arr[0] : arr[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function stddev(arr: number[]) {
  const m = avg(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return NaN;
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  let ag = avg(gains.slice(0, period));
  let al = avg(losses.slice(0, period));
  for (let i = period; i < gains.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period;
    al = (al * (period - 1) + losses[i]) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function macd(closes: number[]): { macdLine: number; signal: number; histogram: number } {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signalArr = ema(macdLine.slice(-9), 9);
  const s = signalArr[signalArr.length - 1];
  const m = macdLine[macdLine.length - 1];
  return { macdLine: m, signal: s, histogram: m - s };
}

function atr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < period + 1) return NaN;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    ));
  }
  return avg(trs.slice(-period));
}

function obv(bars: OHLCVBar[]): number[] {
  const out = [0];
  for (let i = 1; i < bars.length; i++) {
    const prev = out[i - 1];
    if (bars[i].close > bars[i - 1].close) out.push(prev + bars[i].volume);
    else if (bars[i].close < bars[i - 1].close) out.push(prev - bars[i].volume);
    else out.push(prev);
  }
  return out;
}

function adLine(bars: OHLCVBar[]): number[] {
  const out: number[] = [];
  let cum = 0;
  for (const b of bars) {
    const rng = b.high - b.low;
    const mfm = rng === 0 ? 0 : ((b.close - b.low) - (b.high - b.close)) / rng;
    cum += mfm * b.volume;
    out.push(cum);
  }
  return out;
}

// ── Fibonacci retracement ──────────────────────────────────────────────────────

export interface FibLevel {
  label: string;
  price: number;
  pctFromCurrent: number;
}

function fibRetracement(swing_low: number, swing_high: number, current: number): FibLevel[] {
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const range = swing_high - swing_low;
  return ratios.map(r => {
    const price = +(swing_high - r * range).toFixed(2);
    return {
      label: `${(r * 100).toFixed(1)}%`,
      price,
      pctFromCurrent: +((price / current - 1) * 100).toFixed(2),
    };
  });
}

function fibExtension(swing_low: number, swing_high: number, retracement: number, current: number): FibLevel[] {
  const range = swing_high - swing_low;
  return [1.272, 1.414, 1.618, 2.0, 2.618].map(r => {
    const price = +(retracement + r * range).toFixed(2);
    return {
      label: `Ext ${r}`,
      price,
      pctFromCurrent: +((price / current - 1) * 100).toFixed(2),
    };
  });
}

// ── Gann levels ───────────────────────────────────────────────────────────────

export interface GannLevel {
  label: string;
  price: number;
  pctFromCurrent: number;
}

function gannLevels(price: number): GannLevel[] {
  const sq = Math.sqrt(price);
  const levels = [-2, -1, 0, 1, 2, 3].map(n => {
    const p = +((sq + n) ** 2).toFixed(2);
    const pct = +((p / price - 1) * 100).toFixed(2);
    return { label: n === 0 ? 'Current Sq' : `Sq${n > 0 ? '+' + n : n}`, price: p, pctFromCurrent: pct };
  });
  return levels;
}

// ── Candlestick pattern detection ─────────────────────────────────────────────

export interface CandlePattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  description: string;
}

function detectCandlePatterns(bars: OHLCVBar[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (bars.length < 3) return patterns;
  const [b2, b1, b0] = bars.slice(-3);

  const bodySize = (b: OHLCVBar) => Math.abs(b.close - b.open);
  const candleRange = (b: OHLCVBar) => b.high - b.low;
  const isBull = (b: OHLCVBar) => b.close > b.open;
  const isBear = (b: OHLCVBar) => b.close < b.open;

  // Doji
  if (bodySize(b0) / (candleRange(b0) || 1) < 0.1) {
    patterns.push({ name: 'Doji', type: 'neutral', description: 'Indecision — watch for next candle direction.' });
  }

  // Hammer / Hanging Man
  const lowerWick0 = Math.min(b0.open, b0.close) - b0.low;
  const upperWick0 = b0.high - Math.max(b0.open, b0.close);
  if (lowerWick0 > 2 * bodySize(b0) && upperWick0 < bodySize(b0) * 0.5 && candleRange(b0) > 0) {
    patterns.push(isBull(b0)
      ? { name: 'Hammer', type: 'bullish', description: 'Bullish reversal at support; long lower wick shows buyers stepped in.' }
      : { name: 'Hanging Man', type: 'bearish', description: 'Potential bearish reversal after uptrend.' });
  }

  // Engulfing
  if (isBull(b0) && isBear(b1) && b0.open < b1.close && b0.close > b1.open) {
    patterns.push({ name: 'Bullish Engulfing', type: 'bullish', description: 'Strong bullish reversal — buyers overwhelmed sellers.' });
  }
  if (isBear(b0) && isBull(b1) && b0.open > b1.close && b0.close < b1.open) {
    patterns.push({ name: 'Bearish Engulfing', type: 'bearish', description: 'Strong bearish reversal — sellers overwhelmed buyers.' });
  }

  // Morning Star
  if (isBear(b2) && bodySize(b1) < bodySize(b2) * 0.3 && isBull(b0) && b0.close > (b2.open + b2.close) / 2) {
    patterns.push({ name: 'Morning Star', type: 'bullish', description: '3-candle bullish reversal pattern at bottom.' });
  }

  // Evening Star
  if (isBull(b2) && bodySize(b1) < bodySize(b2) * 0.3 && isBear(b0) && b0.close < (b2.open + b2.close) / 2) {
    patterns.push({ name: 'Evening Star', type: 'bearish', description: '3-candle bearish reversal pattern at top.' });
  }

  // Shooting Star
  if (upperWick0 > 2 * bodySize(b0) && lowerWick0 < bodySize(b0) * 0.5) {
    patterns.push({ name: 'Shooting Star', type: 'bearish', description: 'Bearish rejection at resistance; long upper wick.' });
  }

  // Marubozu
  if (bodySize(b0) / (candleRange(b0) || 1) > 0.9) {
    patterns.push(isBull(b0)
      ? { name: 'Bullish Marubozu', type: 'bullish', description: 'Strong buying throughout the session — no wicks.' }
      : { name: 'Bearish Marubozu', type: 'bearish', description: 'Strong selling throughout the session — no wicks.' });
  }

  return patterns;
}

// ── Heikin Ashi ───────────────────────────────────────────────────────────────

export interface HABar { open: number; high: number; low: number; close: number; date: string; }

function heikinAshi(bars: OHLCVBar[]): HABar[] {
  const out: HABar[] = [];
  let prevO = (bars[0].open + bars[0].close) / 2;
  let prevC = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;
  for (const b of bars) {
    const hClose = (b.open + b.high + b.low + b.close) / 4;
    const hOpen = (prevO + prevC) / 2;
    out.push({ open: +hOpen.toFixed(2), high: Math.max(b.high, hOpen, hClose), low: Math.min(b.low, hOpen, hClose), close: +hClose.toFixed(2), date: b.date });
    prevO = hOpen;
    prevC = hClose;
  }
  return out;
}

// ── Elliott Wave (simplified impulse detection) ───────────────────────────────

export interface ElliottWaveInfo {
  currentWave: string;
  description: string;
  bias: 'bullish' | 'bearish' | 'neutral';
}

function detectElliottWave(bars: OHLCVBar[]): ElliottWaveInfo {
  if (bars.length < 30) return { currentWave: 'N/A', description: 'Insufficient data', bias: 'neutral' };
  const closes = bars.map(b => b.close);
  const n = closes.length;
  const recent20High = Math.max(...bars.slice(-20).map(b => b.high));
  const recent20Low = Math.min(...bars.slice(-20).map(b => b.low));
  const overallHigh = Math.max(...bars.map(b => b.high));
  const overallLow = Math.min(...bars.map(b => b.low));
  const current = closes[n - 1];
  const posInRange = (current - overallLow) / (overallHigh - overallLow + 0.0001);
  const recentTrend = (closes[n - 1] - closes[n - 10]) / closes[n - 10];
  const volatilityNow = (recent20High - recent20Low) / recent20Low;
  const trend50 = (current - sma(closes, 50)) / sma(closes, 50);

  if (posInRange > 0.8 && recentTrend > 0.05) {
    return { currentWave: 'Wave 3 or 5', description: 'Price in upper range, strong uptrend. Could be Wave 3 (strongest impulse) or Wave 5 (final push). Watch for momentum divergence.', bias: 'bullish' };
  } else if (posInRange > 0.5 && recentTrend < -0.02 && volatilityNow > 0.05) {
    return { currentWave: 'Wave 4 (Corrective)', description: 'Pullback after impulse. Wave 4 corrections are typically sideways/choppy. Expect support above Wave 1 high.', bias: 'neutral' };
  } else if (posInRange < 0.3 && trend50 < -0.05) {
    return { currentWave: 'Wave A or C (Bear)', description: 'Price in lower range near lows. Could be corrective Wave A/C or early Wave 1 base forming.', bias: 'bearish' };
  } else if (posInRange < 0.4 && recentTrend > 0.02) {
    return { currentWave: 'Wave 1 or 2 Base', description: 'Early recovery from lows. If volume is expanding, likely Wave 1. If pulling back on low volume, possibly Wave 2 — good entry zone.', bias: 'bullish' };
  } else {
    return { currentWave: 'Wave 2 or 4 (Consolidation)', description: 'Mid-range price action, indeterminate wave. Monitor for breakout direction.', bias: 'neutral' };
  }
}

// ── Trend analysis ────────────────────────────────────────────────────────────

export interface TrendInfo {
  stage: string;
  ma20: number;
  ma50: number;
  ma150: number;
  ma200: number;
  aboveMa20: boolean;
  aboveMa50: boolean;
  aboveMa150: boolean;
  aboveMa200: boolean;
  ma50AboveMa150: boolean;
  ma150AboveMa200: boolean;
  stage2: boolean;
  note: string;
}

function analyzeTrend(bars: OHLCVBar[]): TrendInfo {
  const closes = bars.map(b => b.close);
  const price = closes[closes.length - 1];
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma150 = sma(closes, 150);
  const ma200 = sma(closes, 200);

  const aboveMa20 = price > ma20;
  const aboveMa50 = price > ma50;
  const aboveMa150 = price > ma150;
  const aboveMa200 = price > ma200;
  const ma50AboveMa150 = ma50 > ma150;
  const ma150AboveMa200 = ma150 > ma200;
  const stage2 = aboveMa50 && aboveMa150 && aboveMa200 && ma50AboveMa150 && ma150AboveMa200;

  let stage = 'Stage 1 (Accumulation)';
  if (stage2) stage = 'Stage 2 (Uptrend)';
  else if (!aboveMa200 && !aboveMa150) stage = 'Stage 4 (Downtrend)';
  else if (aboveMa200 && !aboveMa50) stage = 'Stage 3 (Distribution)';

  const note = stage2
    ? 'Classic Weinstein Stage 2 — ideal for swing buys.'
    : `Price alignment: ${[aboveMa20 && '>MA20', aboveMa50 && '>MA50', aboveMa150 && '>MA150', aboveMa200 && '>MA200'].filter(Boolean).join(', ') || 'all MAs above price'}`;

  return { stage, ma20: +ma20.toFixed(2), ma50: +ma50.toFixed(2), ma150: +ma150.toFixed(2), ma200: +ma200.toFixed(2), aboveMa20, aboveMa50, aboveMa150, aboveMa200, ma50AboveMa150, ma150AboveMa200, stage2, note };
}

// ── Support / Resistance ──────────────────────────────────────────────────────

export interface SRLevel { price: number; type: 'support' | 'resistance'; strength: number; }

function findSRLevels(bars: OHLCVBar[]): SRLevel[] {
  const levels: SRLevel[] = [];
  const current = bars[bars.length - 1].close;
  const lookback = Math.min(bars.length, 60);
  const sub = bars.slice(-lookback);
  for (let i = 2; i < sub.length - 2; i++) {
    const isLocalHigh = sub[i].high >= sub[i-1].high && sub[i].high >= sub[i-2].high && sub[i].high >= sub[i+1].high && sub[i].high >= sub[i+2].high;
    const isLocalLow = sub[i].low <= sub[i-1].low && sub[i].low <= sub[i-2].low && sub[i].low <= sub[i+1].low && sub[i].low <= sub[i+2].low;
    if (isLocalHigh) levels.push({ price: +sub[i].high.toFixed(2), type: sub[i].high > current ? 'resistance' : 'support', strength: 1 });
    if (isLocalLow) levels.push({ price: +sub[i].low.toFixed(2), type: sub[i].low < current ? 'support' : 'resistance', strength: 1 });
  }
  // Cluster nearby levels
  const clustered: SRLevel[] = [];
  const used = new Set<number>();
  for (let i = 0; i < levels.length; i++) {
    if (used.has(i)) continue;
    let cluster = [levels[i]];
    for (let j = i + 1; j < levels.length; j++) {
      if (Math.abs(levels[j].price - levels[i].price) / levels[i].price < 0.012) {
        cluster.push(levels[j]);
        used.add(j);
      }
    }
    used.add(i);
    const p = avg(cluster.map(c => c.price));
    clustered.push({ price: +p.toFixed(2), type: cluster[0].type, strength: cluster.length });
  }
  return clustered.sort((a, b) => b.strength - a.strength).slice(0, 8);
}

// ── Volume profile ─────────────────────────────────────────────────────────────

export interface VolumeAnalysis {
  avgVol20: number;
  avgVol5: number;
  volRatio: number;
  trend: string;
  obvTrend: string;
  adTrend: string;
  note: string;
}

function analyzeVolume(bars: OHLCVBar[]): VolumeAnalysis {
  const vols = bars.map(b => b.volume);
  const avgVol20 = +avg(vols.slice(-20)).toFixed(0);
  const avgVol5 = +avg(vols.slice(-5)).toFixed(0);
  const volRatio = +(avgVol5 / avgVol20).toFixed(2);

  const obvArr = obv(bars);
  const obvNow = obvArr[obvArr.length - 1];
  const obvPrev = obvArr[Math.max(0, obvArr.length - 10)];
  const obvTrend = obvNow > obvPrev ? 'Rising (accumulation)' : 'Falling (distribution)';

  const adArr = adLine(bars);
  const adNow = adArr[adArr.length - 1];
  const adPrev = adArr[Math.max(0, adArr.length - 10)];
  const adTrend = adNow > adPrev ? 'Rising (net buying)' : 'Falling (net selling)';

  const trend = volRatio > 1.5 ? 'Spike (3x+ expansion)' : volRatio > 1.1 ? 'Above average' : volRatio < 0.6 ? 'Dry-up (low vol squeeze)' : 'Normal';

  let note = '';
  if (volRatio > 1.5 && bars[bars.length - 1].close > bars[bars.length - 1].open) note = 'High volume bullish candle — institutional buying signal.';
  else if (volRatio < 0.6) note = 'Volume dry-up — market indecision or coiling spring forming.';
  else if (obvTrend.includes('Rising') && adTrend.includes('Rising')) note = 'OBV and A/D both rising — strong smart money accumulation.';
  else note = 'Monitor volume for breakout confirmation.';

  return { avgVol20, avgVol5, volRatio, trend, obvTrend, adTrend, note };
}

// ── Key indicators ────────────────────────────────────────────────────────────

export interface KeyIndicators {
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdCrossover: string;
  bb: { upper: number; middle: number; lower: number; widthPct: number; position: string };
  atr14: number;
  atrPct: number;
  stoch: { k: number; d: number; signal: string };
}

function calcKeyIndicators(bars: OHLCVBar[]): KeyIndicators {
  const closes = bars.map(b => b.close);
  const rsi14 = +rsi(closes, 14).toFixed(2);
  const { macdLine, signal: macdSignal, histogram: macdHistogram } = macd(closes);
  const macdCrossover = macdHistogram > 0 && macdHistogram > (closes.length > 2 ? macdLine - macdSignal : 0)
    ? 'Bullish (MACD above signal)' : 'Bearish (MACD below signal)';

  const last20 = closes.slice(-20);
  const bbMiddle = avg(last20);
  const bbStd = stddev(last20);
  const bbUpper = +(bbMiddle + 2 * bbStd).toFixed(2);
  const bbLower = +(bbMiddle - 2 * bbStd).toFixed(2);
  const bbWidthPct = +((bbUpper - bbLower) / bbMiddle * 100).toFixed(2);
  const latestClose = closes[closes.length - 1];
  const bbPosition = latestClose > bbUpper ? 'Above upper band (overbought zone)'
    : latestClose < bbLower ? 'Below lower band (oversold zone)'
    : latestClose > bbMiddle ? 'Upper half (bullish bias)'
    : 'Lower half (bearish bias)';

  const atr14 = +atr(bars, 14).toFixed(2);
  const atrPct = +(atr14 / latestClose * 100).toFixed(2);

  // Stochastic %K
  const lookback = Math.min(14, bars.length);
  const recentBars = bars.slice(-lookback);
  const low14 = Math.min(...recentBars.map(b => b.low));
  const high14 = Math.max(...recentBars.map(b => b.high));
  const stochK = +((latestClose - low14) / (high14 - low14 + 0.001) * 100).toFixed(2);
  const stochPrev = bars.length > lookback + 2 ? bars.slice(-(lookback + 2), -2) : recentBars;
  const low14p = Math.min(...stochPrev.map(b => b.low));
  const high14p = Math.max(...stochPrev.map(b => b.high));
  const stochKPrev = (bars[bars.length - 2].close - low14p) / (high14p - low14p + 0.001) * 100;
  const stochD = +((stochK + stochKPrev) / 2).toFixed(2);
  const stochSignal = stochK > 80 ? 'Overbought' : stochK < 20 ? 'Oversold' : stochK > stochD ? 'Bullish cross' : 'Bearish bias';

  return {
    rsi14, macdLine: +macdLine.toFixed(2), macdSignal: +macdSignal.toFixed(2), macdHistogram: +macdHistogram.toFixed(2),
    macdCrossover,
    bb: { upper: bbUpper, middle: +bbMiddle.toFixed(2), lower: bbLower, widthPct: bbWidthPct, position: bbPosition },
    atr14, atrPct,
    stoch: { k: stochK, d: stochD, signal: stochSignal },
  };
}

// ── Duration-aware trade plan ──────────────────────────────────────────────────

export interface TradePlan {
  action: string;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskPct: number;
  t1Pct: number;
  t2Pct: number;
  t3Pct: number;
  rrRatio: string;
  holdingPeriod: string;
  rationale: string;
}

function calcTradePlan(bars: OHLCVBar[], duration: Duration, indicators: KeyIndicators, trend: TrendInfo): TradePlan {
  const price = bars[bars.length - 1].close;
  const atrVal = indicators.atr14;

  const slMultiplier: Record<Duration, number> = {
    intraday: 1.0, btst: 1.5, '1week': 2.0, '1month': 2.5, '3months': 3.0, '6months': 3.5, '1year': 4.0,
  };
  const holdMap: Record<Duration, string> = {
    intraday: 'Same day exit', btst: 'Buy Today Sell Tomorrow', '1week': '3-7 trading days', '1month': '15-30 days', '3months': '45-90 days', '6months': '90-130 days', '1year': '6-12 months',
  };

  const slAtr = slMultiplier[duration] * atrVal;
  const entry = +(price * 1.002).toFixed(2);
  const stopLoss = +(entry - slAtr).toFixed(2);
  const riskPerUnit = entry - stopLoss;
  const target1 = +(entry + 1.5 * riskPerUnit).toFixed(2);
  const target2 = +(entry + 3.0 * riskPerUnit).toFixed(2);
  const target3 = +(entry + 5.0 * riskPerUnit).toFixed(2);

  const riskPct = +((riskPerUnit / entry) * 100).toFixed(2);
  const t1Pct = +((target1 / entry - 1) * 100).toFixed(2);
  const t2Pct = +((target2 / entry - 1) * 100).toFixed(2);
  const t3Pct = +((target3 / entry - 1) * 100).toFixed(2);
  const rrRatio = `1 : ${(t2Pct / riskPct).toFixed(1)}`;

  const isBullish = trend.stage2 && indicators.rsi14 > 50 && indicators.macdHistogram > 0;
  const action = isBullish ? 'BUY' : indicators.rsi14 < 45 ? 'AVOID' : 'WATCH';

  const rationale = [
    trend.stage2 ? 'Stage 2 uptrend confirmed.' : 'Not in Stage 2 — elevated risk.',
    `RSI ${indicators.rsi14} — ${indicators.rsi14 > 60 ? 'momentum strong' : indicators.rsi14 < 40 ? 'momentum weak' : 'neutral zone'}.`,
    `MACD ${indicators.macdCrossover}.`,
    `BB ${indicators.bb.position}.`,
  ].join(' ');

  return { action, entry, stopLoss, target1, target2, target3, riskPct, t1Pct, t2Pct, t3Pct, rrRatio, holdingPeriod: holdMap[duration], rationale };
}

// ── Main analysis function ────────────────────────────────────────────────────

export interface FullAnalysis {
  symbol: string;
  timeframe: Timeframe;
  duration: Duration;
  price: number;
  // Section 1
  elliott: ElliottWaveInfo;
  fibRetracements: FibLevel[];
  fibExtensions: FibLevel[];
  // Section 2
  gann: GannLevel[];
  // Section 3
  candlePatterns: CandlePattern[];
  heikinAshi: HABar[];
  // Section 4
  volume: VolumeAnalysis;
  // Section 5
  trend: TrendInfo;
  indicators: KeyIndicators;
  srLevels: SRLevel[];
  // Section 6 (F&O)
  fno: FnOData | null;
  // Section 7
  tradePlan: TradePlan;
  // Section 8 — Fibonacci time zones (bar indices)
  fibTimeZones: number[];
  analysedAt: string;
}

export interface FnOData {
  lotSize: number;
  openInterest: number;
  oiChangePct: number;
  pcr: number;
  maxPainStrike: number;
  ivCurrent: number;
  topCEStrike: { strike: number; oi: number };
  topPEStrike: { strike: number; oi: number };
  note: string;
}

export function buildAnalysis(
  symbol: string,
  bars: OHLCVBar[],
  timeframe: Timeframe,
  duration: Duration,
  fno: FnOData | null,
): FullAnalysis {
  const price = bars[bars.length - 1].close;

  // Swing high / low for Fibonacci (use last 60 bars or full set)
  const swingWindow = bars.slice(-Math.min(bars.length, 60));
  const swingHigh = Math.max(...swingWindow.map(b => b.high));
  const swingLow = Math.min(...swingWindow.map(b => b.low));

  const trend = analyzeTrend(bars);
  const indicators = calcKeyIndicators(bars);

  // Fibonacci time zones — mark bars at fib numbers from last swing low
  const fibNums = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  const swingLowIdx = swingWindow.reduce((idx, b, i) => b.low === swingLow ? i : idx, 0);
  const fibTimeZones = fibNums.map(f => swingLowIdx + f).filter(i => i < bars.length);

  return {
    symbol,
    timeframe,
    duration,
    price,
    elliott: detectElliottWave(bars),
    fibRetracements: fibRetracement(swingLow, swingHigh, price),
    fibExtensions: fibExtension(swingLow, swingHigh, swingLow, price),
    gann: gannLevels(price),
    candlePatterns: detectCandlePatterns(bars),
    heikinAshi: heikinAshi(bars.slice(-10)),
    volume: analyzeVolume(bars),
    trend,
    indicators,
    srLevels: findSRLevels(bars),
    fno,
    tradePlan: calcTradePlan(bars, duration, indicators, trend),
    fibTimeZones,
    analysedAt: new Date().toISOString(),
  };
}
