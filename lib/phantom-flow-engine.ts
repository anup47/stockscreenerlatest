// Phantom Flow — Smart Money Concepts (SMC) analysis engine
// Implements market structure, liquidity, order blocks, trend/momentum, and trade setup
// using original logic inspired by SMC methodology.

export interface OHLCVRow {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Swing {
  idx:   number;
  price: number;
  date:  Date;
  type:  'high' | 'low';
}

export interface StructureEvent {
  type:      'BOS' | 'CHoCH';
  direction: 'Bullish' | 'Bearish';
  price:     number;
  date:      string;
  idx:       number;
}

export interface FVG {
  type:       'Bullish' | 'Bearish';
  top:        number;
  bottom:     number;
  date:       string;
  mitigated:  boolean;
  sizePct:    number;
}

export interface OrderBlock {
  type:       'Bullish' | 'Bearish';
  high:       number;
  low:        number;
  date:       string;
  mitigated:  boolean;
  strength:   'Strong' | 'Moderate';
}

export interface EqualLevel {
  price:  number;
  count:  number;
  status: 'Untouched' | 'Swept';
  type:   'High' | 'Low';
}

export interface SetupSide {
  valid:       boolean;
  conditions:  { label: string; met: boolean }[];
  entry:       number | null;
  stopLoss:    number | null;
  target1:     number | null;
  target2:     number | null;
  rr1:         number | null;
  rr2:         number | null;
  invalidation: string;
}

export interface PhantomFlowResult {
  symbol:       string;
  currentPrice: number;
  barsAnalyzed: number;
  analyzedAt:   string;

  marketStructure: {
    trend:             'Bullish' | 'Bearish' | 'Consolidating';
    recentEvent:       StructureEvent | null;
    swingHigh:         { price: number; date: string } | null;
    swingLow:          { price: number; date: string } | null;
    rangeHigh:         number;
    rangeLow:          number;
    equilibrium:       number;
    pctInRange:        number;
    zone:              'Premium' | 'Equilibrium' | 'Discount';
  };

  liquidity: {
    equalHighs:     EqualLevel[];
    equalLows:      EqualLevel[];
    fvgs:           FVG[];
    stopHuntZones:  { direction: 'Upside' | 'Downside'; price: number; desc: string }[];
  };

  orderBlocks: {
    bullish: OrderBlock[];
    bearish: OrderBlock[];
  };

  momentum: {
    trendStrength:       number;
    trendLabel:          'Very Strong' | 'Strong' | 'Moderate' | 'Weak' | 'Choppy';
    rsi:                 number;
    ema20:               number;
    ema50:               number;
    ema200:              number;
    emaAlignment:        'Bullish' | 'Bearish' | 'Mixed';
    momentumShift:       'Bullish' | 'Bearish' | 'None';
    reversalProbability: number;
  };

  tradeSetup: {
    bias:            'Long' | 'Short' | 'Neutral';
    longSetup:       SetupSide;
    shortSetup:      SetupSide;
    confluenceScore: number;
    confluenceFactors: { label: string; weight: number; contributing: boolean }[];
  };

  summary: {
    bias:       'Bullish' | 'Bearish' | 'Neutral';
    keyZones:   string[];
    tradeIdea:  string | null;
    warnings:   string[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function calcEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcATR(bars: OHLCVRow[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close),
    ));
  }
  const slice = trs.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

// ── Swing Detection ───────────────────────────────────────────────────────────

function detectSwings(bars: OHLCVRow[], lookback = 5): Swing[] {
  const swings: Swing[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const b = bars[i];
    let isHigh = true, isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j].high >= b.high) isHigh = false;
      if (bars[j].low  <= b.low)  isLow  = false;
    }
    if (isHigh) swings.push({ idx: i, price: b.high, date: b.date, type: 'high' });
    if (isLow)  swings.push({ idx: i, price: b.low,  date: b.date, type: 'low'  });
  }
  // Sort by index, keep last 30
  return swings.sort((a, b) => a.idx - b.idx).slice(-30);
}

// ── Market Structure ──────────────────────────────────────────────────────────

function analyzeMarketStructure(
  bars:   OHLCVRow[],
  swings: Swing[],
): PhantomFlowResult['marketStructure'] & { bosEvents: StructureEvent[] } {
  const last    = bars[bars.length - 1];
  const close   = last.close;
  const highs   = swings.filter(s => s.type === 'high').slice(-6);
  const lows    = swings.filter(s => s.type === 'low').slice(-6);

  // Trend via recent swing sequence
  let trend: 'Bullish' | 'Bearish' | 'Consolidating' = 'Consolidating';
  if (highs.length >= 2 && lows.length >= 2) {
    const hhOk = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const hlOk = lows[lows.length   - 1].price > lows[lows.length   - 2].price;
    const llOk = lows[lows.length   - 1].price < lows[lows.length   - 2].price;
    const lhOk = highs[highs.length - 1].price < highs[highs.length - 2].price;
    if (hhOk && hlOk) trend = 'Bullish';
    else if (llOk && lhOk) trend = 'Bearish';
  }

  // Last swing high/low for reference
  const lastSwingHigh = highs[highs.length - 1] ?? null;
  const lastSwingLow  = lows[lows.length   - 1] ?? null;

  // BOS / CHoCH detection — walk bars, find breaks of swing levels
  const bosEvents: StructureEvent[] = [];
  const usedHighIdx = new Set<number>();
  const usedLowIdx  = new Set<number>();

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    // Check against all prior swings
    for (const sh of highs) {
      if (sh.idx >= i) continue;
      if (usedHighIdx.has(sh.idx)) continue;
      if (bar.close > sh.price) {
        const evType = trend === 'Bearish' ? 'CHoCH' : 'BOS';
        bosEvents.push({ type: evType, direction: 'Bullish', price: sh.price, date: isoDate(bar.date), idx: i });
        usedHighIdx.add(sh.idx);
        if (evType === 'CHoCH') trend = 'Bullish';
      }
    }
    for (const sl of lows) {
      if (sl.idx >= i) continue;
      if (usedLowIdx.has(sl.idx)) continue;
      if (bar.close < sl.price) {
        const evType = trend === 'Bullish' ? 'CHoCH' : 'BOS';
        bosEvents.push({ type: evType, direction: 'Bearish', price: sl.price, date: isoDate(bar.date), idx: i });
        usedLowIdx.add(sl.idx);
        if (evType === 'CHoCH') trend = 'Bearish';
      }
    }
  }

  const recentEvent = bosEvents.length > 0 ? bosEvents[bosEvents.length - 1] : null;

  // Premium / Discount range
  const rangeHigh = lastSwingHigh?.price ?? Math.max(...bars.slice(-60).map(b => b.high));
  const rangeLow  = lastSwingLow?.price  ?? Math.min(...bars.slice(-60).map(b => b.low));
  const rangeSize = rangeHigh - rangeLow;
  const pctInRange = rangeSize > 0 ? clamp(((close - rangeLow) / rangeSize) * 100, 0, 100) : 50;
  const zone: 'Premium' | 'Equilibrium' | 'Discount' =
    pctInRange > 60 ? 'Premium' : pctInRange < 40 ? 'Discount' : 'Equilibrium';

  return {
    trend,
    recentEvent,
    swingHigh: lastSwingHigh ? { price: lastSwingHigh.price, date: isoDate(lastSwingHigh.date) } : null,
    swingLow:  lastSwingLow  ? { price: lastSwingLow.price,  date: isoDate(lastSwingLow.date)  } : null,
    rangeHigh,
    rangeLow,
    equilibrium: (rangeHigh + rangeLow) / 2,
    pctInRange,
    zone,
    bosEvents,
  };
}

// ── Fair Value Gaps ───────────────────────────────────────────────────────────

function findFVGs(bars: OHLCVRow[]): FVG[] {
  const fvgs: FVG[] = [];
  const slice = bars.slice(-60);
  const current = bars[bars.length - 1];

  for (let i = 2; i < slice.length; i++) {
    const a = slice[i - 2], c = slice[i];
    // Bullish FVG: gap up — candle[i-2].high < candle[i].low
    if (a.high < c.low) {
      const top    = c.low;
      const bottom = a.high;
      const mitigated = slice.slice(i + 1).some(b => b.low <= top) || current.close <= top;
      fvgs.push({
        type: 'Bullish', top, bottom,
        date: isoDate(c.date),
        mitigated,
        sizePct: ((top - bottom) / bottom) * 100,
      });
    }
    // Bearish FVG: gap down — candle[i-2].low > candle[i].high
    if (a.low > c.high) {
      const top    = a.low;
      const bottom = c.high;
      const mitigated = slice.slice(i + 1).some(b => b.high >= bottom) || current.close >= bottom;
      fvgs.push({
        type: 'Bearish', top, bottom,
        date: isoDate(c.date),
        mitigated,
        sizePct: ((top - bottom) / bottom) * 100,
      });
    }
  }

  // Most recent 8, sorted newest first
  return fvgs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}

// ── Order Blocks ──────────────────────────────────────────────────────────────

function findOrderBlocks(bars: OHLCVRow[], bosEvents: StructureEvent[]): { bullish: OrderBlock[]; bearish: OrderBlock[] } {
  const bullish: OrderBlock[] = [];
  const bearish: OrderBlock[] = [];
  const atr = calcATR(bars);
  const current = bars[bars.length - 1];

  for (const ev of bosEvents) {
    if (ev.direction === 'Bullish') {
      // Find the last bearish candle BEFORE this BOS
      for (let i = ev.idx - 1; i >= Math.max(0, ev.idx - 15); i--) {
        if (bars[i].close < bars[i].open) {
          const ob: OrderBlock = {
            type: 'Bullish',
            high: bars[i].high,
            low:  bars[i].low,
            date: isoDate(bars[i].date),
            mitigated: current.close < bars[i].low,
            strength: (bars[i].high - bars[i].low) > atr ? 'Strong' : 'Moderate',
          };
          if (!bullish.some(x => Math.abs(x.high - ob.high) < atr * 0.5)) bullish.push(ob);
          break;
        }
      }
    } else {
      // Find the last bullish candle BEFORE this BOS
      for (let i = ev.idx - 1; i >= Math.max(0, ev.idx - 15); i--) {
        if (bars[i].close > bars[i].open) {
          const ob: OrderBlock = {
            type: 'Bearish',
            high: bars[i].high,
            low:  bars[i].low,
            date: isoDate(bars[i].date),
            mitigated: current.close > bars[i].high,
            strength: (bars[i].high - bars[i].low) > atr ? 'Strong' : 'Moderate',
          };
          if (!bearish.some(x => Math.abs(x.high - ob.high) < atr * 0.5)) bearish.push(ob);
          break;
        }
      }
    }
  }

  return {
    bullish: bullish.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4),
    bearish: bearish.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4),
  };
}

// ── Equal Highs / Lows ────────────────────────────────────────────────────────

function findEqualLevels(swings: Swing[], currentClose: number): EqualLevel[] {
  const tolerance = 0.003; // 0.3%
  const highs = swings.filter(s => s.type === 'high').map(s => s.price);
  const lows  = swings.filter(s => s.type === 'low').map(s => s.price);
  const result: EqualLevel[] = [];

  const cluster = (prices: number[], type: 'High' | 'Low') => {
    const used = new Set<number>();
    for (let i = 0; i < prices.length; i++) {
      if (used.has(i)) continue;
      const group = [prices[i]];
      for (let j = i + 1; j < prices.length; j++) {
        if (!used.has(j) && Math.abs(prices[j] - prices[i]) / prices[i] <= tolerance) {
          group.push(prices[j]);
          used.add(j);
        }
      }
      if (group.length >= 2) {
        const avg   = group.reduce((s, v) => s + v, 0) / group.length;
        const swept = type === 'High' ? currentClose > avg : currentClose < avg;
        result.push({ price: avg, count: group.length, status: swept ? 'Swept' : 'Untouched', type });
        used.add(i);
      }
    }
  };

  cluster(highs, 'High');
  cluster(lows,  'Low');
  return result;
}

// ── Indicators ────────────────────────────────────────────────────────────────

function calcMomentumShift(closes: number[], ema20arr: number[]): 'Bullish' | 'Bearish' | 'None' {
  if (closes.length < 5 || ema20arr.length < 5) return 'None';
  const n = closes.length - 1;
  // Price crossed EMA20 recently (within last 5 bars)
  for (let i = n - 4; i <= n; i++) {
    if (i < 1) continue;
    const prevAbove = closes[i - 1] > ema20arr[i - 1];
    const nowAbove  = closes[i]     > ema20arr[i];
    if (!prevAbove && nowAbove)  return 'Bullish';
    if (prevAbove  && !nowAbove) return 'Bearish';
  }
  return 'None';
}

// ── Trade Setup ───────────────────────────────────────────────────────────────

function buildTradeSetup(
  mkt:    PhantomFlowResult['marketStructure'],
  liq:    PhantomFlowResult['liquidity'],
  obs:    { bullish: OrderBlock[]; bearish: OrderBlock[] },
  mom:    Omit<PhantomFlowResult['momentum'], 'reversalProbability'>,
  close:  number,
): PhantomFlowResult['tradeSetup'] {
  const trendBull = mkt.trend === 'Bullish';
  const trendBear = mkt.trend === 'Bearish';
  const discount  = mkt.zone === 'Discount';
  const premium   = mkt.zone === 'Premium';
  const rsi = mom.rsi;

  const nearBullOB = obs.bullish.filter(ob => !ob.mitigated && Math.abs(close - ob.high) / close < 0.04);
  const nearBearOB = obs.bearish.filter(ob => !ob.mitigated && Math.abs(close - ob.low) / close < 0.04);
  const activeBullFVG = liq.fvgs.filter(f => f.type === 'Bullish' && !f.mitigated);
  const activeBearFVG = liq.fvgs.filter(f => f.type === 'Bearish' && !f.mitigated);

  const chopEvent = mkt.recentEvent?.type === 'CHoCH';

  // Long conditions
  const longConds: { label: string; met: boolean }[] = [
    { label: 'Trend Bullish or CHoCH Bullish',     met: trendBull || (chopEvent && mkt.recentEvent?.direction === 'Bullish') },
    { label: 'Price in Discount zone (< 40% range)', met: discount },
    { label: 'Active Bullish Order Block nearby',  met: nearBullOB.length > 0 },
    { label: 'Unmitigated Bullish FVG below',      met: activeBullFVG.some(f => f.top < close) },
    { label: 'RSI not overbought (< 75)',           met: rsi < 75 },
    { label: 'EMA alignment bullish',              met: mom.emaAlignment === 'Bullish' },
  ];
  const longValid = longConds.filter(c => c.met).length >= 3 && longConds[0].met;

  const bestBullOB = nearBullOB[0] ?? obs.bullish.filter(o => !o.mitigated)[0] ?? null;
  const longEntry    = bestBullOB ? bestBullOB.high : null;
  const longStop     = bestBullOB ? +(bestBullOB.low  * 0.995).toFixed(2) : null;
  const longTarget1  = activeBearFVG.length > 0 ? activeBearFVG[0].bottom : mkt.swingHigh?.price ?? null;
  const longTarget2  = mkt.rangeHigh > close ? mkt.rangeHigh : null;
  const longRR1 = longEntry && longStop && longTarget1
    ? +((longTarget1 - longEntry) / (longEntry - longStop)).toFixed(2) : null;
  const longRR2 = longEntry && longStop && longTarget2
    ? +((longTarget2 - longEntry) / (longEntry - longStop)).toFixed(2) : null;

  // Short conditions
  const shortConds: { label: string; met: boolean }[] = [
    { label: 'Trend Bearish or CHoCH Bearish',     met: trendBear || (chopEvent && mkt.recentEvent?.direction === 'Bearish') },
    { label: 'Price in Premium zone (> 60% range)', met: premium },
    { label: 'Active Bearish Order Block nearby',  met: nearBearOB.length > 0 },
    { label: 'Unmitigated Bearish FVG above',      met: activeBearFVG.some(f => f.bottom > close) },
    { label: 'RSI not oversold (> 30)',             met: rsi > 30 },
    { label: 'EMA alignment bearish',              met: mom.emaAlignment === 'Bearish' },
  ];
  const shortValid = shortConds.filter(c => c.met).length >= 3 && shortConds[0].met;

  const bestBearOB   = nearBearOB[0] ?? obs.bearish.filter(o => !o.mitigated)[0] ?? null;
  const shortEntry   = bestBearOB ? bestBearOB.low  : null;
  const shortStop    = bestBearOB ? +(bestBearOB.high * 1.005).toFixed(2) : null;
  const shortTarget1 = activeBullFVG.length > 0 ? activeBullFVG[0].top : mkt.swingLow?.price ?? null;
  const shortTarget2 = mkt.rangeLow < close ? mkt.rangeLow : null;
  const shortRR1 = shortEntry && shortStop && shortTarget1
    ? +((shortEntry - shortTarget1) / (shortStop - shortEntry)).toFixed(2) : null;
  const shortRR2 = shortEntry && shortStop && shortTarget2
    ? +((shortEntry - shortTarget2) / (shortStop - shortEntry)).toFixed(2) : null;

  // Confluence factors
  const factors: PhantomFlowResult['tradeSetup']['confluenceFactors'] = [
    { label: 'Trend Alignment',      weight: 25, contributing: trendBull || trendBear },
    { label: 'Premium/Discount Zone', weight: 20, contributing: premium || discount },
    { label: 'Order Block Proximity', weight: 20, contributing: nearBullOB.length > 0 || nearBearOB.length > 0 },
    { label: 'Fair Value Gap',        weight: 15, contributing: activeBullFVG.length > 0 || activeBearFVG.length > 0 },
    { label: 'RSI Confirmation',      weight: 10, contributing: (trendBull && rsi > 45 && rsi < 75) || (trendBear && rsi < 55 && rsi > 25) },
    { label: 'Structure Event (BOS/CHoCH)', weight: 10, contributing: mkt.recentEvent !== null },
  ];
  const confluenceScore = factors.filter(f => f.contributing).reduce((s, f) => s + f.weight, 0);

  const bias: 'Long' | 'Short' | 'Neutral' = longValid && !shortValid ? 'Long'
    : shortValid && !longValid ? 'Short'
    : longValid && shortValid  ? (trendBull ? 'Long' : 'Short')
    : 'Neutral';

  return {
    bias,
    longSetup: {
      valid: longValid, conditions: longConds,
      entry: longEntry, stopLoss: longStop, target1: longTarget1, target2: longTarget2,
      rr1: longRR1, rr2: longRR2,
      invalidation: mkt.swingLow ? `Close below ${mkt.swingLow.price.toFixed(2)} (swing low)` : 'N/A',
    },
    shortSetup: {
      valid: shortValid, conditions: shortConds,
      entry: shortEntry, stopLoss: shortStop, target1: shortTarget1, target2: shortTarget2,
      rr1: shortRR1, rr2: shortRR2,
      invalidation: mkt.swingHigh ? `Close above ${mkt.swingHigh.price.toFixed(2)} (swing high)` : 'N/A',
    },
    confluenceScore,
    confluenceFactors: factors,
  };
}

// ── Reversal Probability ──────────────────────────────────────────────────────

function calcReversalProbability(
  mkt: PhantomFlowResult['marketStructure'],
  rsi: number,
  obs: { bullish: OrderBlock[]; bearish: OrderBlock[] },
  fvgs: FVG[],
): number {
  let score = 0;
  const close = mkt.equilibrium + (mkt.rangeHigh - mkt.equilibrium) * (mkt.pctInRange / 100 - 0.5) * 2;

  if (mkt.zone === 'Premium') {
    score += 25;
    if (rsi > 70) score += 20;
    if (obs.bearish.some(o => !o.mitigated && Math.abs(close - o.low) / close < 0.03)) score += 25;
    if (fvgs.some(f => f.type === 'Bearish' && !f.mitigated && f.bottom > close)) score += 15;
    if (mkt.recentEvent?.type === 'CHoCH' && mkt.recentEvent.direction === 'Bearish') score += 15;
  } else if (mkt.zone === 'Discount') {
    score += 25;
    if (rsi < 35) score += 20;
    if (obs.bullish.some(o => !o.mitigated && Math.abs(close - o.high) / close < 0.03)) score += 25;
    if (fvgs.some(f => f.type === 'Bullish' && !f.mitigated && f.top < close)) score += 15;
    if (mkt.recentEvent?.type === 'CHoCH' && mkt.recentEvent.direction === 'Bullish') score += 15;
  }
  return clamp(score, 0, 100);
}

// ── Stop Hunt Zones ───────────────────────────────────────────────────────────

function buildStopHuntZones(equalLevels: EqualLevel[]): { direction: 'Upside' | 'Downside'; price: number; desc: string }[] {
  return equalLevels
    .filter(l => l.status === 'Untouched')
    .map(l => ({
      direction: l.type === 'High' ? 'Upside' as const : 'Downside' as const,
      price: l.price,
      desc:  `${l.count} equal ${l.type === 'High' ? 'highs' : 'lows'} at ${l.price.toFixed(2)} — liquidity cluster`,
    }));
}

// ── Summary Builder ───────────────────────────────────────────────────────────

function buildSummary(
  mkt:    PhantomFlowResult['marketStructure'],
  setup:  PhantomFlowResult['tradeSetup'],
  mom:    Omit<PhantomFlowResult['momentum'], 'reversalProbability'>,
  fvgs:   FVG[],
  obs:    { bullish: OrderBlock[]; bearish: OrderBlock[] },
): PhantomFlowResult['summary'] {
  const bias: 'Bullish' | 'Bearish' | 'Neutral' =
    mkt.trend === 'Bullish' ? 'Bullish' :
    mkt.trend === 'Bearish' ? 'Bearish' : 'Neutral';

  const keyZones: string[] = [];
  if (mkt.swingHigh) keyZones.push(`Swing High: ${mkt.swingHigh.price.toFixed(2)}`);
  if (mkt.swingLow)  keyZones.push(`Swing Low: ${mkt.swingLow.price.toFixed(2)}`);
  keyZones.push(`Equilibrium (50%): ${mkt.equilibrium.toFixed(2)}`);
  const activeBullOB = obs.bullish.find(o => !o.mitigated);
  const activeBearOB = obs.bearish.find(o => !o.mitigated);
  if (activeBullOB) keyZones.push(`Bullish OB: ${activeBullOB.low.toFixed(2)}–${activeBullOB.high.toFixed(2)}`);
  if (activeBearOB) keyZones.push(`Bearish OB: ${activeBearOB.low.toFixed(2)}–${activeBearOB.high.toFixed(2)}`);

  const warnings: string[] = [];
  if (mkt.zone === 'Premium' && mkt.trend === 'Bullish')
    warnings.push('Price in Premium — long trades carry higher reversal risk');
  if (mkt.zone === 'Discount' && mkt.trend === 'Bearish')
    warnings.push('Price in Discount — short trades carry higher reversal risk');
  if (mom.rsi > 70) warnings.push(`RSI overbought at ${mom.rsi.toFixed(1)} — momentum may stall`);
  if (mom.rsi < 30) warnings.push(`RSI oversold at ${mom.rsi.toFixed(1)} — potential bounce zone`);
  if (mkt.recentEvent?.type === 'CHoCH')
    warnings.push(`CHoCH detected — trend may be changing to ${mkt.recentEvent.direction}`);
  if (fvgs.filter(f => !f.mitigated).length === 0)
    warnings.push('No unmitigated FVGs — price may be in discovery mode');

  let tradeIdea: string | null = null;
  if (setup.bias === 'Long' && setup.longSetup.entry) {
    tradeIdea = `Potential long near ${setup.longSetup.entry.toFixed(2)} with stop at ${setup.longSetup.stopLoss?.toFixed(2) ?? 'N/A'}` +
      (setup.longSetup.target1 ? `, targeting ${setup.longSetup.target1.toFixed(2)}` : '') +
      (setup.longSetup.rr1 ? ` (R:R ${setup.longSetup.rr1.toFixed(1)}:1)` : '');
  } else if (setup.bias === 'Short' && setup.shortSetup.entry) {
    tradeIdea = `Potential short near ${setup.shortSetup.entry.toFixed(2)} with stop at ${setup.shortSetup.stopLoss?.toFixed(2) ?? 'N/A'}` +
      (setup.shortSetup.target1 ? `, targeting ${setup.shortSetup.target1.toFixed(2)}` : '') +
      (setup.shortSetup.rr1 ? ` (R:R ${setup.shortSetup.rr1.toFixed(1)}:1)` : '');
  }

  return { bias, keyZones, tradeIdea, warnings };
}

// ── Main Entry ────────────────────────────────────────────────────────────────

export function runPhantomFlow(symbol: string, bars: OHLCVRow[]): PhantomFlowResult {
  const closes  = bars.map(b => b.close);
  const swings  = detectSwings(bars);
  const mktRaw  = analyzeMarketStructure(bars, swings);
  const { bosEvents, ...mktStruct } = mktRaw;

  const fvgs      = findFVGs(bars);
  const obs       = findOrderBlocks(bars, bosEvents);
  const eqLevels  = findEqualLevels(swings, bars[bars.length - 1].close);
  const stopHunts = buildStopHuntZones(eqLevels);

  const ema20arr  = calcEMA(closes, 20);
  const ema50arr  = calcEMA(closes, 50);
  const ema200arr = calcEMA(closes, 200);
  const ema20  = ema20arr[ema20arr.length   - 1];
  const ema50  = ema50arr[ema50arr.length   - 1];
  const ema200 = ema200arr[ema200arr.length - 1];
  const rsi    = calcRSI(closes);

  const emaAlignment: 'Bullish' | 'Bearish' | 'Mixed' =
    (ema20 > ema50 && ema50 > ema200) ? 'Bullish' :
    (ema20 < ema50 && ema50 < ema200) ? 'Bearish' : 'Mixed';

  const momentumShift = calcMomentumShift(closes, ema20arr);

  // Trend strength
  const close = bars[bars.length - 1].close;
  let ts = 0;
  if (ema20 > ema50 && ema50 > ema200 && close > ema20) ts += 35;
  else if (ema20 > ema50) ts += 15;
  else if (ema20 < ema50 && ema50 < ema200 && close < ema20) ts += 35;
  else if (ema20 < ema50) ts += 15;
  if (rsi > 55 && rsi <= 70)  ts += 20;
  else if (rsi > 70)          ts += 10;
  else if (rsi < 45 && rsi >= 30) ts += 20;
  else if (rsi < 30)          ts += 10;
  if (mktStruct.trend !== 'Consolidating') ts += 15;
  ts = clamp(ts, 0, 100);

  const trendLabel: PhantomFlowResult['momentum']['trendLabel'] =
    ts >= 75 ? 'Very Strong' : ts >= 55 ? 'Strong' : ts >= 35 ? 'Moderate' : ts >= 20 ? 'Weak' : 'Choppy';

  const momPartial = { trendStrength: ts, trendLabel, rsi, ema20, ema50, ema200, emaAlignment, momentumShift };

  const reversalProbability = calcReversalProbability(mktStruct, rsi, obs, fvgs);
  const momentum = { ...momPartial, reversalProbability };

  const liquidity: PhantomFlowResult['liquidity'] = {
    equalHighs:    eqLevels.filter(l => l.type === 'High'),
    equalLows:     eqLevels.filter(l => l.type === 'Low'),
    fvgs,
    stopHuntZones: stopHunts,
  };

  const tradeSetup = buildTradeSetup(mktStruct, liquidity, obs, momPartial, close);
  const summary    = buildSummary(mktStruct, tradeSetup, momPartial, fvgs, obs);

  return {
    symbol,
    currentPrice: close,
    barsAnalyzed: bars.length,
    analyzedAt:   new Date().toISOString(),
    marketStructure: mktStruct,
    liquidity,
    orderBlocks: obs,
    momentum,
    tradeSetup,
    summary,
  };
}
