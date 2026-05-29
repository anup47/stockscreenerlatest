import { calcATRSeries, type OHLCVRow } from './indicators';

export const BTST_WEIGHTS = {
  breakoutQuality:    20,
  candleCloseStr:     10,
  volumeConfirm:      15,
  trendAlignment:     15,
  volatilityExpansion:10,
  relativeStrength:   10,
  fnoConfirmation:    10,
  riskQuality:         5,
  liquidity:           5,
} as const; // sum = 100

export const BTST_THRESHOLDS = {
  breakout20dHigh:         1.000,
  breakout60dHigh:         1.000,
  nearBreakout:            0.990,
  candleTopQuartile:       0.75,
  candleTopHalf:           0.50,
  upperWickPenaltyRatio:   0.30,
  volRatioHigh:            3.0,
  volRatioMed:             2.0,
  volRatioLow:             1.5,
  volRatioWeak:            1.2,
  atrExpansionHigh:        1.5,
  atrExpansionMed:         1.2,
  rsOutperformHigh:        3.0,
  rsOutperformMed:         1.0,
  stopMaxPct:              2.0,
  stopMedPct:              3.0,
  stopWidePct:             5.0,
  liquidityHigh:           100_000_000,
  liquidityMed:             50_000_000,
  liquidityLow:             25_000_000,
  minBarsRequired:         65,
};

export interface BtstResult {
  symbol:          string;
  company:         string;
  score:           number;
  conviction:      'Very High' | 'High' | 'Medium' | 'Low';
  close:           number;
  breakoutLevel:   number;
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
    breakout:    number;
    candle:      number;
    volume:      number;
    trend:       number;
    volatility:  number;
    rs:          number;
    fno:         number;
    risk:        number;
    liquidity:   number;
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

export function calcBtstScore(
  symbol: string,
  company: string,
  rows: OHLCVRow[],
  niftyChangePct: number,
  oiBuildupCategory?: 'lb' | 'sb' | 'sc' | 'lu',
  isFnO?: boolean,
): BtstResult | null {
  if (rows.length < BTST_THRESHOLDS.minBarsRequired) return null;

  const highs   = rows.map(r => r.high);
  const lows    = rows.map(r => r.low);
  const closes  = rows.map(r => r.close);
  const volumes = rows.map(r => r.volume);

  const n        = rows.length;
  const today    = rows[n - 1];
  const close    = today.close;
  const high     = today.high;
  const low      = today.low;
  const volume   = today.volume;

  // EMAs & SMA
  const ema20Series = calcEMA(closes, 20);
  const ema50Series = calcEMA(closes, 50);
  const ema20 = ema20Series[n - 1];
  const ema50 = ema50Series[n - 1];
  const sma200 = calcSMA(closes, 200);

  // Breakout levels
  const high20d = Math.max(...highs.slice(-21, -1));
  const high60d = Math.max(...highs.slice(-61, -1));

  // --- Breakout quality (20 pts) ---
  let ptsBreakout: number;
  let breakoutLevel: number;
  if (close >= high60d) {
    ptsBreakout = 20;
    breakoutLevel = high60d;
  } else if (close >= high20d) {
    ptsBreakout = 15;
    breakoutLevel = high20d;
  } else if (close >= high20d * 0.99) {
    ptsBreakout = 8;
    breakoutLevel = high20d;
  } else {
    ptsBreakout = 0;
    breakoutLevel = high20d;
  }

  // --- Candle close strength (10 pts) ---
  const dayRange = high - low;
  let ptsCandle = 3;
  if (dayRange > 0) {
    const closePos = (close - low) / dayRange;
    if (closePos >= 0.75) ptsCandle = 10;
    else if (closePos >= 0.50) ptsCandle = 6;
    else ptsCandle = 3;
    const upperWick = high - close;
    if (upperWick / dayRange > 0.30) {
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

  // --- Trend alignment (15 pts) ---
  let ptsTrend = 0;
  if (close > sma200) ptsTrend += 5;
  if (close > ema50)  ptsTrend += 5;
  if (close > ema20)  ptsTrend += 5;

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

  // --- Relative strength (10 pts) ---
  const prevClose = closes[n - 2];
  const changePct = ((close - prevClose) / prevClose) * 100;
  const rs = changePct - niftyChangePct;
  let ptsRS: number;
  if (rs >= 3.0) ptsRS = 10;
  else if (rs >= 1.0) ptsRS = 7;
  else if (rs > 0) ptsRS = 4;
  else ptsRS = 0;

  // --- F&O confirmation (10 pts) ---
  let ptsFno: number;
  if (oiBuildupCategory === 'lb') ptsFno = 10;
  else if (oiBuildupCategory === 'sc') ptsFno = 5;
  else if (oiBuildupCategory === 'sb' || oiBuildupCategory === 'lu') ptsFno = 0;
  else ptsFno = 5; // neutral

  // --- Risk quality (5 pts) ---
  const stopLoss = Math.min(lows[n - 1], lows[n - 2], lows[n - 3]);
  const stopPct  = ((close - stopLoss) / close) * 100;
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
  const score = ptsBreakout + ptsCandle + ptsVolume + ptsTrend +
    ptsVolatility + ptsRS + ptsFno + ptsRisk + ptsLiquidity;

  // --- Conviction ---
  let conviction: BtstResult['conviction'];
  if (score >= 80) conviction = 'Very High';
  else if (score >= 65) conviction = 'High';
  else if (score >= 50) conviction = 'Medium';
  else conviction = 'Low';

  // --- ATR % ---
  const atrPct = close > 0 ? (todayATR / close) * 100 : 0;

  // --- Entry zone ---
  const entryZone = `${(close * 0.998).toFixed(0)}–${(close * 1.005).toFixed(0)}`;

  // --- F&O signal ---
  let fnoSignal: string;
  if (oiBuildupCategory === 'lb') fnoSignal = 'Long Buildup';
  else if (oiBuildupCategory === 'sc') fnoSignal = 'Short Covering';
  else if (oiBuildupCategory === 'sb') fnoSignal = 'Short Buildup';
  else if (oiBuildupCategory === 'lu') fnoSignal = 'Long Unwinding';
  else fnoSignal = 'None';

  // --- Explanation ---
  const breakoutDesc = close >= high60d
    ? `Closed above 60-day high of ${high60d.toFixed(1)}`
    : close >= high20d
    ? `Closed above 20-day high of ${high20d.toFixed(1)}`
    : `Within 1% of 20-day high of ${high20d.toFixed(1)}`;

  const parts: string[] = [
    `${breakoutDesc} on ${volumeRatio.toFixed(1)}x avg volume.`,
  ];
  if (ptsTrend === 15) parts.push('Above all key MAs.');
  if (oiBuildupCategory === 'lb' || oiBuildupCategory === 'sc') {
    parts.push(`F&O shows ${fnoSignal}.`);
  }
  parts.push(`Stop at ${stopLoss.toFixed(1)} (${stopPct.toFixed(1)}% risk).`);
  const explanation = parts.join(' ');

  return {
    symbol,
    company,
    score,
    conviction,
    close,
    breakoutLevel,
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
      breakout:   ptsBreakout,
      candle:     ptsCandle,
      volume:     ptsVolume,
      trend:      ptsTrend,
      volatility: ptsVolatility,
      rs:         ptsRS,
      fno:        ptsFno,
      risk:       ptsRisk,
      liquidity:  ptsLiquidity,
    },
    isFnO:     isFnO ?? false,
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
    if (result !== null && result.score >= 30) {
      results.push(result);
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
