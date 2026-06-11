import { calcATRSeries, type OHLCVRow } from './indicators';

export const STBT_WEIGHTS = {
  breakdownQuality:    20,
  candleCloseWeak:     10,
  volumeConfirm:       15,
  trendAlignment:      15,
  volatilityExpansion: 10,
  relativeWeakness:    10,
  fnoConfirmation:     10,
  riskQuality:          5,
  liquidity:            5,
} as const; // sum = 100

export const STBT_THRESHOLDS = {
  breakdown20dLow:         1.000,
  breakdown60dLow:         1.000,
  nearBreakdown:           1.010,
  candleBottomQuartile:    0.25,
  candleBottomHalf:        0.50,
  lowerWickPenaltyRatio:   0.30,
  volRatioHigh:            3.0,
  volRatioMed:             2.0,
  volRatioLow:             1.5,
  volRatioWeak:            1.2,
  atrExpansionHigh:        1.5,
  atrExpansionMed:         1.2,
  rwUnderperformHigh:     -3.0,
  rwUnderperformMed:      -1.0,
  stopMaxPct:              2.0,
  stopMedPct:              3.0,
  stopWidePct:             5.0,
  liquidityHigh:           100_000_000,
  liquidityMed:             50_000_000,
  liquidityLow:             25_000_000,
  minBarsRequired:         65,
};

export interface StbtResult {
  symbol:          string;
  company:         string;
  score:           number;
  conviction:      'Very High' | 'High' | 'Medium' | 'Low';
  close:           number;
  breakdownLevel:  number;
  volumeRatio:     number;
  ema20:           number;
  ema50:           number;
  sma200:          number;
  atrPct:          number;
  changePct:       number;
  tradedValue:     number;
  entryZone:       string;
  stopLoss:        number;
  stopPct:         number;
  explanation:     string;
  pts: {
    breakdown:  number;
    candle:     number;
    volume:     number;
    trend:      number;
    volatility: number;
    rw:         number;
    fno:        number;
    risk:       number;
    liquidity:  number;
  };
  isFnO:           boolean;
  fnoSignal:       string;
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

export function calcStbtScore(
  symbol: string,
  company: string,
  rows: OHLCVRow[],
  niftyChangePct: number,
  oiBuildupCategory?: 'lb' | 'sb' | 'sc' | 'lu',
  isFnO?: boolean,
): StbtResult | null {
  if (rows.length < STBT_THRESHOLDS.minBarsRequired) return null;

  const highs   = rows.map(r => r.high);
  const lows    = rows.map(r => r.low);
  const closes  = rows.map(r => r.close);
  const volumes = rows.map(r => r.volume);

  const n       = rows.length;
  const today   = rows[n - 1];
  const close   = today.close;
  const high    = today.high;
  const low     = today.low;
  const volume  = today.volume;

  // EMAs & SMA
  const ema20Series = calcEMA(closes, 20);
  const ema50Series = calcEMA(closes, 50);
  const ema20  = ema20Series[n - 1];
  const ema50  = ema50Series[n - 1];
  const sma200 = calcSMA(closes, 200);

  // Breakdown levels (prior days only)
  const low20d = Math.min(...lows.slice(-21, -1));
  const low60d = Math.min(...lows.slice(-61, -1));

  // --- Breakdown quality (20 pts) ---
  let ptsBreakdown: number;
  let breakdownLevel: number;
  if (close <= low60d) {
    ptsBreakdown = 20;
    breakdownLevel = low60d;
  } else if (close <= low20d) {
    ptsBreakdown = 15;
    breakdownLevel = low20d;
  } else if (close <= low20d * 1.01) {
    ptsBreakdown = 8;
    breakdownLevel = low20d;
  } else {
    ptsBreakdown = 0;
    breakdownLevel = low20d;
  }

  // --- Candle close weakness (10 pts) ---
  const dayRange = high - low;
  let ptsCandle = 3;
  if (dayRange > 0) {
    const closePos = (close - low) / dayRange;
    if (closePos <= 0.25) ptsCandle = 10;
    else if (closePos <= 0.50) ptsCandle = 6;
    else ptsCandle = 3;
    // Lower wick penalty: large lower wick = buyers absorbed selling = bad for STBT
    const lowerWick = close - low;
    if (lowerWick / dayRange > 0.30) {
      ptsCandle = Math.max(0, ptsCandle - 2);
    }
  }

  // --- Volume confirmation (15 pts) ---
  const volSlice = volumes.slice(-21, -1);
  const avgVol20 = volSlice.length > 0
    ? volSlice.reduce((a, b) => a + b, 0) / volSlice.length
    : 1;
  const volumeRatio = avgVol20 > 0 ? volume / avgVol20 : 0;
  let ptsVolume: number;
  if (volumeRatio >= 3.0) ptsVolume = 15;
  else if (volumeRatio >= 2.0) ptsVolume = 12;
  else if (volumeRatio >= 1.5) ptsVolume = 8;
  else if (volumeRatio >= 1.2) ptsVolume = 4;
  else ptsVolume = 0;

  // --- Trend alignment (15 pts) — bearish: below MAs is good ---
  let ptsTrend = 0;
  if (close < sma200) ptsTrend += 5;
  if (close < ema50)  ptsTrend += 5;
  if (close < ema20)  ptsTrend += 5;

  // --- Volatility expansion (10 pts) ---
  const atrSeries = calcATRSeries(highs, lows, closes, 14);
  const todayATR  = atrSeries[atrSeries.length - 1];
  const atrSlice  = atrSeries.slice(-21, -1);
  const avgATR14  = atrSlice.length > 0
    ? atrSlice.reduce((a, b) => a + b, 0) / atrSlice.length
    : todayATR;
  const expansion = avgATR14 > 0 ? todayATR / avgATR14 : 1;
  let ptsVolatility: number;
  if (expansion >= 1.5) ptsVolatility = 10;
  else if (expansion >= 1.2) ptsVolatility = 7;
  else ptsVolatility = 4;

  // --- Relative weakness (10 pts) ---
  const prevClose = closes[n - 2];
  const changePct = ((close - prevClose) / prevClose) * 100;
  const rs = changePct - niftyChangePct;
  let ptsRW: number;
  if (rs <= -3.0) ptsRW = 10;
  else if (rs <= -1.0) ptsRW = 7;
  else if (rs < 0) ptsRW = 4;
  else ptsRW = 0;

  // --- F&O confirmation (10 pts) — bearish signals rewarded ---
  let ptsFno: number;
  if (oiBuildupCategory === 'sb') ptsFno = 10;       // short buildup = most bearish
  else if (oiBuildupCategory === 'lu') ptsFno = 7;   // long unwinding = also bearish
  else if (oiBuildupCategory === 'lb' || oiBuildupCategory === 'sc') ptsFno = 0;
  else ptsFno = 5; // neutral / no F&O data

  // --- Risk quality (5 pts) — stop above recent highs ---
  const stopLoss = Math.max(highs[n - 1], highs[n - 2], highs[n - 3]);
  const stopPct  = ((stopLoss - close) / close) * 100;
  let ptsRisk: number;
  if (stopPct <= 2.0) ptsRisk = 5;
  else if (stopPct <= 3.0) ptsRisk = 3;
  else if (stopPct <= 5.0) ptsRisk = 1;
  else ptsRisk = 0;

  // --- Liquidity (5 pts) ---
  const tradedValue = close * volume;
  let ptsLiquidity: number;
  if (tradedValue >= 100_000_000) ptsLiquidity = 5;
  else if (tradedValue >= 50_000_000) ptsLiquidity = 3;
  else if (tradedValue >= 25_000_000) ptsLiquidity = 1;
  else ptsLiquidity = 0;

  // --- Total score ---
  const score = ptsBreakdown + ptsCandle + ptsVolume + ptsTrend +
    ptsVolatility + ptsRW + ptsFno + ptsRisk + ptsLiquidity;

  // --- Conviction ---
  let conviction: StbtResult['conviction'];
  if (score >= 80) conviction = 'Very High';
  else if (score >= 65) conviction = 'High';
  else if (score >= 50) conviction = 'Medium';
  else conviction = 'Low';

  // --- ATR % ---
  const atrPct = close > 0 ? (todayATR / close) * 100 : 0;

  // --- Entry zone (sell zone) ---
  const entryZone = `${(close * 0.998).toFixed(0)}–${(close * 1.002).toFixed(0)}`;

  // --- F&O signal label ---
  let fnoSignal: string;
  if (oiBuildupCategory === 'sb') fnoSignal = 'Short Buildup';
  else if (oiBuildupCategory === 'lu') fnoSignal = 'Long Unwinding';
  else if (oiBuildupCategory === 'lb') fnoSignal = 'Long Buildup';
  else if (oiBuildupCategory === 'sc') fnoSignal = 'Short Covering';
  else fnoSignal = 'None';

  // --- Explanation ---
  const breakdownDesc = close <= low60d
    ? `Closed below 60-day low of ${low60d.toFixed(1)}`
    : close <= low20d
    ? `Closed below 20-day low of ${low20d.toFixed(1)}`
    : `Within 1% of 20-day low of ${low20d.toFixed(1)}`;

  const parts: string[] = [
    `${breakdownDesc} on ${volumeRatio.toFixed(1)}x avg volume.`,
  ];
  if (ptsTrend === 15) parts.push('Below all key MAs.');
  if (oiBuildupCategory === 'sb' || oiBuildupCategory === 'lu') {
    parts.push(`F&O shows ${fnoSignal}.`);
  }
  parts.push(`Cover stop at ${stopLoss.toFixed(1)} (${stopPct.toFixed(1)}% risk).`);
  const explanation = parts.join(' ');

  return {
    symbol,
    company,
    score,
    conviction,
    close,
    breakdownLevel,
    volumeRatio,
    ema20,
    ema50,
    sma200,
    atrPct,
    changePct,
    tradedValue,
    entryZone,
    stopLoss,
    stopPct,
    explanation,
    pts: {
      breakdown:  ptsBreakdown,
      candle:     ptsCandle,
      volume:     ptsVolume,
      trend:      ptsTrend,
      volatility: ptsVolatility,
      rw:         ptsRW,
      fno:        ptsFno,
      risk:       ptsRisk,
      liquidity:  ptsLiquidity,
    },
    isFnO:     isFnO ?? false,
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
    if (result !== null && result.score >= 30) {
      results.push(result);
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
