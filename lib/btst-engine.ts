import { calcATRSeries, type OHLCVRow } from './indicators';

export const BTST_WEIGHTS = {
  breakoutQuality:  20,
  candleCloseStr:   10,
  volumeConfirm:    12,
  trendAlignment:   10,
  rsiMomentum:      15,
  relativeStrength: 10,
  fnoConfirmation:  10,
  riskQuality:       8,
  liquidity:         5,
} as const; // sum = 100

export const BTST_THRESHOLDS = {
  breakout20dHigh:       1.000,
  breakout60dHigh:       1.000,
  nearBreakout:          0.990,
  candleTopQuartile:     0.75,
  candleTopHalf:         0.50,
  upperWickPenaltyRatio: 0.30,
  volRatioHigh:          2.5,
  volRatioMed:           2.0,
  volRatioLow:           1.5,
  volRatioWeak:          1.2,
  rsiSweetLow:           63,
  rsiSweetHigh:          75,
  rsiGoodHigh:           80,
  rsiNeutralLow:         48,
  rs5dHigh:              3.0,
  rs5dMed:               1.0,
  stopTightPct:          1.5,
  stopMedPct:            2.5,
  stopWidePct:           3.5,
  liquidityHigh:         100_000_000,
  liquidityMed:           50_000_000,
  liquidityLow:           25_000_000,
  minBarsRequired:       65,
};

export interface BtstResult {
  symbol:        string;
  company:       string;
  score:         number;
  conviction:    'Very High' | 'High' | 'Medium' | 'Low';
  close:         number;
  breakoutLevel: number;
  volumeRatio:   number;
  ema20:         number;
  ema50:         number;
  sma200:        number;
  atrPct:        number;
  changePct:     number;
  tradedValue:   number;
  entryZone:     string;
  stopLoss:      number;
  stopPct:       number;
  explanation:   string;
  rsi:           number;
  pts: {
    breakout:  number;
    candle:    number;
    volume:    number;
    trend:     number;
    rsi:       number;
    rs:        number;
    fno:       number;
    risk:      number;
    liquidity: number;
  };
  isFnO:    boolean;
  fnoSignal: string;
}

function calcEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = new Array(closes.length);
  ema[0] = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema[i] = closes[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calcSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const slice = closes.slice(closes.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Wilder's smoothed RSI
function calcRSIValue(closes: number[], period = 14): number {
  const n = closes.length;
  if (n < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) avgGain += ch; else avgLoss += -ch;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calcBtstScore(
  symbol: string,
  company: string,
  rows: OHLCVRow[],
  niftyChangePct: number,
  oiBuildupCategory?: 'lb' | 'sb' | 'sc' | 'lu',
  isFnO?: boolean,
): BtstResult | null {
  void niftyChangePct; // kept for API compatibility; RS now uses 5-day stock return
  if (rows.length < BTST_THRESHOLDS.minBarsRequired) return null;

  const highs   = rows.map(r => r.high);
  const lows    = rows.map(r => r.low);
  const closes  = rows.map(r => r.close);
  const volumes = rows.map(r => r.volume);

  const n      = rows.length;
  const today  = rows[n - 1];
  const close  = today.close;
  const high   = today.high;
  const low    = today.low;
  const open   = today.open;
  const volume = today.volume;

  const prevClose = closes[n - 2];
  const changePct = ((close - prevClose) / prevClose) * 100;

  // EMAs & SMA
  const ema20Series = calcEMA(closes, 20);
  const ema50Series = calcEMA(closes, 50);
  const ema20  = ema20Series[n - 1];
  const ema50  = ema50Series[n - 1];
  const sma200 = calcSMA(closes, 200);

  // Breakout levels — exclude today to avoid look-ahead
  const high20d = Math.max(...highs.slice(-21, -1));
  const high60d = Math.max(...highs.slice(-61, -1));

  // --- 1. Breakout quality (20 pts) ---
  let ptsBreakout: number;
  let breakoutLevel: number;
  if (close >= high60d) {
    ptsBreakout = 20; breakoutLevel = high60d;
  } else if (close >= high20d) {
    ptsBreakout = 15; breakoutLevel = high20d;
  } else if (close >= high20d * 0.99) {
    ptsBreakout = 8; breakoutLevel = high20d;
  } else {
    ptsBreakout = 0; breakoutLevel = high20d;
  }
  // Exhaustion penalty: stock ran hard intraday → likely reversal next day
  const intradayChange = open > 0 ? ((close - open) / open) * 100 : 0;
  if (intradayChange > 5.0) ptsBreakout = Math.max(0, ptsBreakout - 8);
  else if (intradayChange > 3.5) ptsBreakout = Math.max(0, ptsBreakout - 4);

  // --- 2. Candle quality (10 pts) — body ratio required, not just close position ---
  const dayRange = high - low;
  let ptsCandle = 0;
  if (dayRange > 0) {
    const closePos  = (close - low) / dayRange;
    const bodyRatio = open > 0 ? Math.abs(close - open) / dayRange : 0;
    if      (closePos >= 0.75 && bodyRatio >= 0.5) ptsCandle = 10;
    else if (closePos >= 0.75 && bodyRatio >= 0.3) ptsCandle = 8;
    else if (closePos >= 0.75)                     ptsCandle = 5; // doji near high
    else if (closePos >= 0.50 && bodyRatio >= 0.4) ptsCandle = 4;
    else if (closePos >= 0.50)                     ptsCandle = 2;
    const upperWick = high - close;
    if (upperWick / dayRange > 0.30) ptsCandle = Math.max(0, ptsCandle - 2);
  }

  // --- 3. Volume confirmation (12 pts) — recency check added ---
  const volSlice20   = volumes.slice(-21, -1);
  const avgVol20     = volSlice20.length > 0 ? volSlice20.reduce((a, b) => a + b, 0) / volSlice20.length : 1;
  const volumeRatio  = avgVol20 > 0 ? volume / avgVol20 : 0;
  const maxVol10d    = volumes.slice(-11, -1).reduce((m, v) => (v > m ? v : m), 0);
  const isHighestVol = maxVol10d > 0 && volume > maxVol10d;
  let ptsVolume: number;
  if      (volumeRatio >= 2.5 && isHighestVol) ptsVolume = 12;
  else if (volumeRatio >= 2.0)                 ptsVolume = 10;
  else if (volumeRatio >= 1.5 && isHighestVol) ptsVolume = 8;
  else if (volumeRatio >= 1.5)                 ptsVolume = 6;
  else if (volumeRatio >= 1.2)                 ptsVolume = 3;
  else                                          ptsVolume = 0;

  // --- 4. Trend alignment (10 pts) — EMA ordering, not just "price above each MA" ---
  let ptsTrend: number;
  if      (close > ema20 && ema20 > ema50 && ema50 > sma200) ptsTrend = 10;
  else if (close > ema20 && close > ema50)                    ptsTrend = 6;
  else if (close > ema20)                                     ptsTrend = 3;
  else                                                        ptsTrend = 0;

  // --- 5. RSI momentum (15 pts) — sweet spot 63–75; overbought >80 = 0 ---
  const rsiValue = calcRSIValue(closes);
  let ptsRSI: number;
  if      (rsiValue >= 63 && rsiValue <= 75)                          ptsRSI = 15;
  else if ((rsiValue >= 55 && rsiValue < 63) || (rsiValue > 75 && rsiValue <= 80)) ptsRSI = 10;
  else if (rsiValue >= 48 && rsiValue < 55)                           ptsRSI = 5;
  else                                                                 ptsRSI = 0;

  // --- 6. 5-day relative strength (10 pts) — multi-day trend, not single-day noise ---
  const stock5d = n >= 6 ? ((close - closes[n - 6]) / closes[n - 6]) * 100 : 0;
  let ptsRS: number;
  if      (stock5d >= 3.0) ptsRS = 10;
  else if (stock5d >= 1.0) ptsRS = 7;
  else if (stock5d >  0)   ptsRS = 4;
  else                     ptsRS = 0;

  // --- 7. F&O confirmation (10 pts) ---
  let ptsFno: number;
  if      (oiBuildupCategory === 'lb') ptsFno = 10;
  else if (oiBuildupCategory === 'sc') ptsFno = 5;
  else if (oiBuildupCategory === 'sb' || oiBuildupCategory === 'lu') ptsFno = 0;
  else ptsFno = 3; // neutral / no data (reduced from 5)

  // --- 8. Risk quality (8 pts) ---
  const stopLoss = Math.min(lows[n - 1], lows[n - 2], lows[n - 3]);
  const stopPct  = ((close - stopLoss) / close) * 100;
  let ptsRisk: number;
  if      (stopPct <= 1.5) ptsRisk = 8;
  else if (stopPct <= 2.5) ptsRisk = 5;
  else if (stopPct <= 3.5) ptsRisk = 2;
  else                     ptsRisk = 0;

  // --- 9. Liquidity (5 pts) ---
  const tradedValue = close * volume;
  let ptsLiquidity: number;
  if      (tradedValue >= 100_000_000) ptsLiquidity = 5;
  else if (tradedValue >=  50_000_000) ptsLiquidity = 3;
  else if (tradedValue >=  25_000_000) ptsLiquidity = 1;
  else                                  ptsLiquidity = 0;

  // --- Total score ---
  const score = ptsBreakout + ptsCandle + ptsVolume + ptsTrend +
    ptsRSI + ptsRS + ptsFno + ptsRisk + ptsLiquidity;

  // --- Conviction ---
  let conviction: BtstResult['conviction'];
  if      (score >= 80) conviction = 'Very High';
  else if (score >= 65) conviction = 'High';
  else if (score >= 50) conviction = 'Medium';
  else                  conviction = 'Low';

  // --- ATR % (display only) ---
  const atrSeries = calcATRSeries(highs, lows, closes, 14);
  const todayATR  = atrSeries[atrSeries.length - 1];
  const atrPct    = close > 0 ? (todayATR / close) * 100 : 0;

  // --- Entry zone ---
  const entryZone = `${(close * 0.998).toFixed(0)}–${(close * 1.005).toFixed(0)}`;

  // --- F&O signal label ---
  let fnoSignal: string;
  if      (oiBuildupCategory === 'lb') fnoSignal = 'Long Buildup';
  else if (oiBuildupCategory === 'sc') fnoSignal = 'Short Covering';
  else if (oiBuildupCategory === 'sb') fnoSignal = 'Short Buildup';
  else if (oiBuildupCategory === 'lu') fnoSignal = 'Long Unwinding';
  else                                  fnoSignal = 'None';

  // --- Explanation ---
  const breakoutDesc = close >= high60d
    ? `Closed above 60-day high of ${high60d.toFixed(1)}`
    : close >= high20d
    ? `Closed above 20-day high of ${high20d.toFixed(1)}`
    : `Within 1% of 20-day high of ${high20d.toFixed(1)}`;

  const parts: string[] = [`${breakoutDesc} on ${volumeRatio.toFixed(1)}x avg volume.`];
  if (ptsTrend === 10) parts.push('EMAs in full bull structure.');
  if (rsiValue >= 55 && rsiValue <= 80) parts.push(`RSI ${rsiValue.toFixed(0)} in momentum zone.`);
  else if (rsiValue > 80) parts.push(`RSI ${rsiValue.toFixed(0)} — overbought, caution.`);
  if (oiBuildupCategory === 'lb' || oiBuildupCategory === 'sc') parts.push(`F&O shows ${fnoSignal}.`);
  parts.push(`Stop at ${stopLoss.toFixed(1)} (${stopPct.toFixed(1)}% risk).`);
  const explanation = parts.join(' ');

  return {
    symbol, company, score, conviction,
    close, breakoutLevel, volumeRatio,
    ema20, ema50, sma200,
    atrPct, changePct, tradedValue,
    entryZone, stopLoss, stopPct, explanation,
    rsi: Math.round(rsiValue),
    pts: {
      breakout:  ptsBreakout,
      candle:    ptsCandle,
      volume:    ptsVolume,
      trend:     ptsTrend,
      rsi:       ptsRSI,
      rs:        ptsRS,
      fno:       ptsFno,
      risk:      ptsRisk,
      liquidity: ptsLiquidity,
    },
    isFnO:    isFnO ?? false,
    fnoSignal,
  };
}

export function buildBtstScan(
  stocks: Array<{ symbol: string; company: string; rows: OHLCVRow[] }>,
  niftyChangePct: number,
  oiBuildupMap: Map<string, 'lb' | 'sb' | 'sc' | 'lu'>,
  fnoSet: Set<string>,
): BtstResult[] {
  const results: BtstResult[] = [];
  for (const { symbol, company, rows } of stocks) {
    const oiCat  = oiBuildupMap.get(symbol);
    const isFnO  = fnoSet.has(symbol);
    const result = calcBtstScore(symbol, company, rows, niftyChangePct, oiCat, isFnO);
    if (result !== null && result.score >= 30) results.push(result);
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
