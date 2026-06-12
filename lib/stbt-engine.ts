import { calcATRSeries, type OHLCVRow } from './indicators';

export const STBT_WEIGHTS = {
  breakdownQuality:  20,
  candleCloseWeak:   10,
  volumeConfirm:     12,
  trendAlignment:    10,
  rsiMomentum:       15,
  relativeWeakness:  10,
  fnoConfirmation:   10,
  riskQuality:        8,
  liquidity:          5,
} as const; // sum = 100

export const STBT_THRESHOLDS = {
  breakdown20dLow:       1.000,
  breakdown60dLow:       1.000,
  nearBreakdown:         1.010,
  candleBottomQuartile:  0.25,
  candleBottomHalf:      0.50,
  lowerWickPenaltyRatio: 0.30,
  volRatioHigh:          2.5,
  volRatioMed:           2.0,
  volRatioLow:           1.5,
  volRatioWeak:          1.2,
  rsiSweetLow:           25,
  rsiSweetHigh:          37,
  rsiGoodHigh:           45,
  rsiNeutralHigh:        52,
  rw5dLow:              -3.0,
  rw5dMed:              -1.0,
  stopTightPct:          1.5,
  stopMedPct:            2.5,
  stopWidePct:           3.5,
  liquidityHigh:         100_000_000,
  liquidityMed:           50_000_000,
  liquidityLow:           25_000_000,
  minBarsRequired:       65,
};

export interface StbtResult {
  symbol:         string;
  company:        string;
  score:          number;
  conviction:     'Very High' | 'High' | 'Medium' | 'Low';
  close:          number;
  breakdownLevel: number;
  volumeRatio:    number;
  ema20:          number;
  ema50:          number;
  sma200:         number;
  atrPct:         number;
  changePct:      number;
  tradedValue:    number;
  entryZone:      string;
  stopLoss:       number;
  stopPct:        number;
  explanation:    string;
  rsi:            number;
  pts: {
    breakdown: number;
    candle:    number;
    volume:    number;
    trend:     number;
    rsi:       number;
    rw:        number;
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

export function calcStbtScore(
  symbol: string,
  company: string,
  rows: OHLCVRow[],
  niftyChangePct: number,
  oiBuildupCategory?: 'lb' | 'sb' | 'sc' | 'lu',
  isFnO?: boolean,
): StbtResult | null {
  void niftyChangePct; // kept for API compatibility; RW now uses 5-day stock return
  if (rows.length < STBT_THRESHOLDS.minBarsRequired) return null;

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

  // Breakdown levels — exclude today to avoid look-ahead
  const low20d = Math.min(...lows.slice(-21, -1));
  const low60d = Math.min(...lows.slice(-61, -1));

  // --- 1. Breakdown quality (20 pts) ---
  let ptsBreakdown: number;
  let breakdownLevel: number;
  if (close <= low60d) {
    ptsBreakdown = 20; breakdownLevel = low60d;
  } else if (close <= low20d) {
    ptsBreakdown = 15; breakdownLevel = low20d;
  } else if (close <= low20d * 1.01) {
    ptsBreakdown = 8; breakdownLevel = low20d;
  } else {
    ptsBreakdown = 0; breakdownLevel = low20d;
  }
  // Exhaustion penalty: stock already crashed hard intraday → bounce risk
  const intradayChange = open > 0 ? ((close - open) / open) * 100 : 0;
  if (intradayChange < -5.0) ptsBreakdown = Math.max(0, ptsBreakdown - 8);
  else if (intradayChange < -3.5) ptsBreakdown = Math.max(0, ptsBreakdown - 4);

  // --- 2. Candle weakness (10 pts) — body ratio required ---
  const dayRange = high - low;
  let ptsCandle = 0;
  if (dayRange > 0) {
    const closePos  = (close - low) / dayRange;
    const bodyRatio = open > 0 ? Math.abs(close - open) / dayRange : 0;
    if      (closePos <= 0.25 && bodyRatio >= 0.5) ptsCandle = 10;
    else if (closePos <= 0.25 && bodyRatio >= 0.3) ptsCandle = 8;
    else if (closePos <= 0.25)                     ptsCandle = 5; // doji near low
    else if (closePos <= 0.50 && bodyRatio >= 0.4) ptsCandle = 4;
    else if (closePos <= 0.50)                     ptsCandle = 2;
    // Lower wick penalty: buyers absorbed selling pressure = bad for STBT
    const lowerWick = close - low;
    if (lowerWick / dayRange > 0.30) ptsCandle = Math.max(0, ptsCandle - 2);
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

  // --- 4. Trend alignment (10 pts) — EMA ordering for downtrend ---
  let ptsTrend: number;
  if      (close < ema20 && ema20 < ema50 && ema50 < sma200) ptsTrend = 10;
  else if (close < ema20 && close < ema50)                    ptsTrend = 6;
  else if (close < ema20)                                     ptsTrend = 3;
  else                                                        ptsTrend = 0;

  // --- 5. RSI momentum (15 pts) — bearish sweet spot 25–37; oversold <20 = bounce risk ---
  const rsiValue = calcRSIValue(closes);
  let ptsRSI: number;
  if      (rsiValue >= 25 && rsiValue <= 37)                            ptsRSI = 15;
  else if ((rsiValue >= 38 && rsiValue <= 45) || (rsiValue >= 20 && rsiValue < 25)) ptsRSI = 10;
  else if (rsiValue > 45 && rsiValue <= 52)                             ptsRSI = 5;
  else                                                                   ptsRSI = 0;

  // --- 6. 5-day relative weakness (10 pts) — multi-day decline, not single-day noise ---
  const stock5d = n >= 6 ? ((close - closes[n - 6]) / closes[n - 6]) * 100 : 0;
  let ptsRW: number;
  if      (stock5d <= -3.0) ptsRW = 10;
  else if (stock5d <= -1.0) ptsRW = 7;
  else if (stock5d <   0)   ptsRW = 4;
  else                      ptsRW = 0;

  // --- 7. F&O confirmation (10 pts) — bearish signals rewarded ---
  let ptsFno: number;
  if      (oiBuildupCategory === 'sb') ptsFno = 10; // short buildup = most bearish
  else if (oiBuildupCategory === 'lu') ptsFno = 7;  // long unwinding = also bearish
  else if (oiBuildupCategory === 'lb' || oiBuildupCategory === 'sc') ptsFno = 0;
  else ptsFno = 3; // neutral / no data (reduced from 5)

  // --- 8. Risk quality (8 pts) — stop above recent highs ---
  const stopLoss = Math.max(highs[n - 1], highs[n - 2], highs[n - 3]);
  const stopPct  = ((stopLoss - close) / close) * 100;
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
  const score = ptsBreakdown + ptsCandle + ptsVolume + ptsTrend +
    ptsRSI + ptsRW + ptsFno + ptsRisk + ptsLiquidity;

  // --- Conviction ---
  let conviction: StbtResult['conviction'];
  if      (score >= 80) conviction = 'Very High';
  else if (score >= 65) conviction = 'High';
  else if (score >= 50) conviction = 'Medium';
  else                  conviction = 'Low';

  // --- ATR % (display only) ---
  const atrSeries = calcATRSeries(highs, lows, closes, 14);
  const todayATR  = atrSeries[atrSeries.length - 1];
  const atrPct    = close > 0 ? (todayATR / close) * 100 : 0;

  // --- Entry zone (sell zone) ---
  const entryZone = `${(close * 0.998).toFixed(0)}–${(close * 1.002).toFixed(0)}`;

  // --- F&O signal label ---
  let fnoSignal: string;
  if      (oiBuildupCategory === 'sb') fnoSignal = 'Short Buildup';
  else if (oiBuildupCategory === 'lu') fnoSignal = 'Long Unwinding';
  else if (oiBuildupCategory === 'lb') fnoSignal = 'Long Buildup';
  else if (oiBuildupCategory === 'sc') fnoSignal = 'Short Covering';
  else                                  fnoSignal = 'None';

  // --- Explanation ---
  const breakdownDesc = close <= low60d
    ? `Closed below 60-day low of ${low60d.toFixed(1)}`
    : close <= low20d
    ? `Closed below 20-day low of ${low20d.toFixed(1)}`
    : `Within 1% of 20-day low of ${low20d.toFixed(1)}`;

  const parts: string[] = [`${breakdownDesc} on ${volumeRatio.toFixed(1)}x avg volume.`];
  if (ptsTrend === 10) parts.push('EMAs in full bear structure.');
  if (rsiValue >= 20 && rsiValue <= 52) parts.push(`RSI ${rsiValue.toFixed(0)} in bearish zone.`);
  else if (rsiValue < 20) parts.push(`RSI ${rsiValue.toFixed(0)} — oversold, bounce risk.`);
  if (oiBuildupCategory === 'sb' || oiBuildupCategory === 'lu') parts.push(`F&O shows ${fnoSignal}.`);
  parts.push(`Cover stop at ${stopLoss.toFixed(1)} (${stopPct.toFixed(1)}% risk).`);
  const explanation = parts.join(' ');

  return {
    symbol, company, score, conviction,
    close, breakdownLevel, volumeRatio,
    ema20, ema50, sma200,
    atrPct, changePct, tradedValue,
    entryZone, stopLoss, stopPct, explanation,
    rsi: Math.round(rsiValue),
    pts: {
      breakdown: ptsBreakdown,
      candle:    ptsCandle,
      volume:    ptsVolume,
      trend:     ptsTrend,
      rsi:       ptsRSI,
      rw:        ptsRW,
      fno:       ptsFno,
      risk:      ptsRisk,
      liquidity: ptsLiquidity,
    },
    isFnO:    isFnO ?? false,
    fnoSignal,
  };
}

export function buildStbtScan(
  stocks: Array<{ symbol: string; company: string; rows: OHLCVRow[] }>,
  niftyChangePct: number,
  oiBuildupMap: Map<string, 'lb' | 'sb' | 'sc' | 'lu'>,
  fnoSet: Set<string>,
): StbtResult[] {
  const results: StbtResult[] = [];
  for (const { symbol, company, rows } of stocks) {
    const oiCat  = oiBuildupMap.get(symbol);
    const isFnO  = fnoSet.has(symbol);
    const result = calcStbtScore(symbol, company, rows, niftyChangePct, oiCat, isFnO);
    if (result !== null && result.score >= 30) results.push(result);
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
