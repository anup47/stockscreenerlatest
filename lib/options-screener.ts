import type { Stock } from './universe';
import type { OHLCVRow } from './indicators';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  trend: number;      // max 25
  momentum: number;   // max 20
  volume: number;     // max 20
  volatility: number; // max 15
  setup: number;      // max 20
}

export interface OptionsResult {
  symbol: string;
  company: string;
  price: number;
  direction: 'CALL' | 'PUT';
  score: number;
  bullishScore: number;
  bearishScore: number;
  directionalSpread: number;
  confidence: 'Strong' | 'Moderate' | 'Watchlist';
  setupType: string;
  optionSide: 'Buy Call' | 'Buy Put';
  holdingBias: '1-2 days' | '2-5 days';
  entryQuality: 'Early' | 'Triggered' | 'Extended';
  volRatio: number;
  atrPct: number;
  rsi: number;
  trendStatus: string;
  priceVsEma20Pct: number;
  priceVsEma50Pct: number;
  scoreBreakdown: ScoreBreakdown;
  reasons: string[];
  riskFlags: string[];
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
  if (closes.length < period + 1) return 50;
  let ag = 0, al = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  return al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(1);
}

function calcAtr(rows: OHLCVRow[], period: number): number {
  if (rows.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    trs.push(Math.max(
      rows[i].high - rows[i].low,
      Math.abs(rows[i].high - rows[i - 1].close),
      Math.abs(rows[i].low - rows[i - 1].close),
    ));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function calcMacd(closes: number[]): { line: number; signal: number } {
  if (closes.length < 27) return { line: 0, signal: 0 };
  const e12 = emaArr(closes, 12);
  const e26 = emaArr(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const sig = emaArr(macdLine.slice(-9), 9);
  return { line: macdLine[macdLine.length - 1], signal: sig[sig.length - 1] };
}

function volRatio(rows: OHLCVRow[]): number {
  if (rows.length < 20) return 1;
  const vols = rows.map(r => r.volume);
  const avg20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const avg5 = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
  return avg20 > 0 ? +(avg5 / avg20).toFixed(2) : 1;
}

function upVolShare(rows: OHLCVRow[], n: number): number {
  const recent = rows.slice(-n);
  let up = 0, down = 0;
  for (const r of recent) {
    if (r.close > r.open) up += r.volume;
    else down += r.volume;
  }
  return (up + down) > 0 ? up / (up + down) : 0.5;
}

function pctChange(closes: number[], n: number): number {
  if (closes.length <= n) return 0;
  return (closes[closes.length - 1] / closes[closes.length - 1 - n] - 1) * 100;
}

// ── Setup detection ───────────────────────────────────────────────────────────

type SetupLabel =
  | 'Breakout with Volume'
  | 'Pullback Reversal'
  | 'Breakdown with Volume'
  | 'Bear Rally Failure'
  | 'Trend Continuation'
  | 'None';

function detectSetup(
  rows: OHLCVRow[],
  e20: number[],
  e50: number[],
): { label: SetupLabel; dir: 'bullish' | 'bearish' | 'neutral' } {
  const closes = rows.map(r => r.close);
  const highs  = rows.map(r => r.high);
  const lows   = rows.map(r => r.low);
  const n = closes.length;
  const price = closes[n - 1];
  const vr = volRatio(rows);

  const ema20now = e20[e20.length - 1];
  const ema50now = e50[e50.length - 1];
  const ema50old = e50[Math.max(0, e50.length - 10)];

  // 20-day lookback (exclude current bar)
  const recent20H = Math.max(...highs.slice(-21, -1));
  const recent20L = Math.min(...lows.slice(-21, -1));

  // Breakout
  if (price > recent20H * 1.001 && vr >= 1.25) {
    return { label: 'Breakout with Volume', dir: 'bullish' };
  }

  // Breakdown
  if (price < recent20L * 0.999 && vr >= 1.25) {
    return { label: 'Breakdown with Volume', dir: 'bearish' };
  }

  // Pullback Reversal: uptrend, recent dip to EMA band, recovering
  const uptrending = ema50now > ema50old && price > ema50now;
  const dippedToEma = lows.slice(-5).some(l => l <= ema20now * 1.015 && l >= ema20now * 0.97);
  const recovering  = closes[n - 1] > closes[n - 2] && closes[n - 2] > closes[n - 3];
  if (uptrending && dippedToEma && recovering) {
    return { label: 'Pullback Reversal', dir: 'bullish' };
  }

  // Bear Rally Failure: downtrend, bounced into EMA resistance, stalling
  const downtrending = ema50now < e50[Math.max(0, e50.length - 10)] && price < ema50now;
  const bouncedToEma = highs.slice(-5).some(h => h >= ema20now * 0.97 && h <= ema20now * 1.03);
  const stallingNow  = closes[n - 1] < ema20now && closes[n - 2] < ema20now;
  if (downtrending && bouncedToEma && stallingNow) {
    return { label: 'Bear Rally Failure', dir: 'bearish' };
  }

  // Trend Continuation
  if (price > ema20now && ema20now > ema50now) return { label: 'Trend Continuation', dir: 'bullish' };
  if (price < ema20now && ema20now < ema50now) return { label: 'Trend Continuation', dir: 'bearish' };

  return { label: 'None', dir: 'neutral' };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreBull(
  rows: OHLCVRow[], closes: number[],
  e20: number[], e50: number[], e200: number[],
  rsi: number, macd: { line: number; signal: number },
  vr: number, setup: SetupLabel,
): ScoreBreakdown {
  const price = closes[closes.length - 1];
  const ema20  = e20[e20.length - 1];
  const ema50  = e50[e50.length - 1];
  const ema200 = e200[e200.length - 1];
  const rsiOld = calcRsi(closes.slice(0, -5));

  // ATR expansion: short ATR vs long ATR
  const atrShort = calcAtr(rows.slice(-7), 5);
  const atrLong  = calcAtr(rows, 14);
  const atrExpand = atrShort > atrLong * 1.05;
  const pch5 = pctChange(closes, 5);

  let trend = 0;
  if (price > ema20)  trend += 5;
  if (price > ema50)  trend += 7;
  if (price > ema200) trend += 8;
  if (ema20 > ema50 && ema50 > ema200) trend += 5;

  let momentum = 0;
  if (rsi > 50) momentum += 5;
  if (rsi > 60) momentum += 5;
  if (rsi > rsiOld) momentum += 5;
  if (macd.line > macd.signal) momentum += 5;

  let volume = 0;
  if (vr > 1.2) volume += 5;
  if (vr > 1.5) volume += 5;
  if (upVolShare(rows, 5)  > 0.52) volume += 5;
  if (upVolShare(rows, 10) > 0.55) volume += 5;

  let volatility = 0;
  if (atrExpand) volatility += 5;
  if (pch5 > 0)  volatility += 5;
  if (pch5 > 2)  volatility += 5;

  const setupPts = setup === 'Breakout with Volume' ? 20
    : setup === 'Pullback Reversal'     ? 15
    : setup === 'Trend Continuation'    ? 8
    : 0;

  return {
    trend:      Math.min(25, trend),
    momentum:   Math.min(20, momentum),
    volume:     Math.min(20, volume),
    volatility: Math.min(15, volatility),
    setup:      Math.min(20, setupPts),
  };
}

function scoreBear(
  rows: OHLCVRow[], closes: number[],
  e20: number[], e50: number[], e200: number[],
  rsi: number, macd: { line: number; signal: number },
  vr: number, setup: SetupLabel,
): ScoreBreakdown {
  const price  = closes[closes.length - 1];
  const ema20  = e20[e20.length - 1];
  const ema50  = e50[e50.length - 1];
  const ema200 = e200[e200.length - 1];
  const rsiOld = calcRsi(closes.slice(0, -5));

  const atrShort = calcAtr(rows.slice(-7), 5);
  const atrLong  = calcAtr(rows, 14);
  const atrExpand = atrShort > atrLong * 1.05;
  const pch5 = pctChange(closes, 5);
  const dvShare5  = 1 - upVolShare(rows, 5);
  const dvShare10 = 1 - upVolShare(rows, 10);

  let trend = 0;
  if (price < ema20)  trend += 5;
  if (price < ema50)  trend += 7;
  if (price < ema200) trend += 8;
  if (ema20 < ema50 && ema50 < ema200) trend += 5;

  let momentum = 0;
  if (rsi < 50) momentum += 5;
  if (rsi < 40) momentum += 5;
  if (rsi < rsiOld) momentum += 5;
  if (macd.line < macd.signal) momentum += 5;

  let volume = 0;
  if (vr > 1.2) volume += 5;
  if (vr > 1.5) volume += 5;
  if (dvShare5  > 0.52) volume += 5;
  if (dvShare10 > 0.55) volume += 5;

  let volatility = 0;
  if (atrExpand) volatility += 5;
  if (pch5 < 0)  volatility += 5;
  if (pch5 < -2) volatility += 5;

  const setupPts = setup === 'Breakdown with Volume'  ? 20
    : setup === 'Bear Rally Failure'    ? 15
    : setup === 'Trend Continuation'    ? 8
    : 0;

  return {
    trend:      Math.min(25, trend),
    momentum:   Math.min(20, momentum),
    volume:     Math.min(20, volume),
    volatility: Math.min(15, volatility),
    setup:      Math.min(20, setupPts),
  };
}

function total(bd: ScoreBreakdown) {
  return bd.trend + bd.momentum + bd.volume + bd.volatility + bd.setup;
}

// ── F&O universe ──────────────────────────────────────────────────────────────

export const FNO_SET = new Set([
  'AARTIIND','ABB','ABBOTINDIA','ABCAPITAL','ABFRL','ACC','ADANIENT','ADANIPORTS',
  'ADANIPOWER','ADANITRANS','ALKEM','AMBUJACEM','ANGELONE','APOLLOHOSP','APOLLOTYRE',
  'ASHOKLEY','ASIANPAINT','ASTRAL','ATUL','AUBANK','AUROPHARMA','AXISBANK',
  'BAJAJ-AUTO','BAJAJFINSV','BAJFINANCE','BALKRISIND','BANDHANBNK','BANKBARODA',
  'BATAINDIA','BEL','BERGEPAINT','BHARATFORG','BHARTIARTL','BHEL','BIOCON',
  'BOSCHLTD','BPCL','BRITANNIA','BSE','BSOFT',
  'CANBK','CANFINHOME','CDSL','CENTURYTEX','CESC','CGPOWER','CHAMBLFERT',
  'CHOLAFIN','CIPLA','COALINDIA','COFORGE','COLPAL','CONCOR','COROMANDEL',
  'CUMMINSIND','CYIENT',
  'DABUR','DALBHARAT','DEEPAKNTR','DELTACORP','DIXON','DMART','DRREDDY',
  'EICHERMOT','EMAMILTD','ESCORTS','ETERNAL','EXIDEIND',
  'FACT','FEDERALBNK',
  'GAIL','GLENMARK','GMRINFRA','GNFC','GODREJCP','GODREJPROP','GRANULES',
  'GRASIM','GSPL','GUJARATGAS',
  'HAL','HAVELLS','HCLTECH','HDFCBANK','HDFCLIFE','HEROMOTOCO','HINDALCO',
  'HINDCOPPER','HPCL','HUDCO','HINDUNILVR',
  'IBREALEST','ICICIBANK','ICICIGI','ICICIPRULI','IDFCFIRSTB','IEX','IGL',
  'INDHOTEL','INDIGO','INDUSTOWER','INDUSINDBK','INFY','IOC','IPCALAB',
  'IRB','IRCTC','IREDA','IRFC','ISEC','ITC',
  'JKCEMENT','JSWENERGY','JSWSTEEL','JUBLFOOD',
  'KAYNES','KOTAKBANK','KPITTECH',
  'LALPATHLAB','LAURUSLABS','LICHSGFIN','LICI','LINDE','LT','LTF','LTIM','LUPIN',
  'M&M','MANAPPURAM','MARICO','MARUTI','MAXHEALTH','MCX','METROPOLIS',
  'MFSL','MPHASIS','MRF','MUTHOOTFIN',
  'NATIONALUM','NAUKRI','NAVINFLUOR','NBCC','NCC','NESTLEIND','NHPC','NMDC','NTPC',
  'OBEROIRLTY','OFSS','ONGC',
  'PAGEIND','PEL','PERSISTENT','PETRONET','PFC','PHOENIXLTD','PIDILITIND',
  'PIIND','PNB','POLYCAB','POWERGRID','PVR',
  'RAMCOCEM','RBLBANK','RECLTD','RELIANCE','RVNL',
  'SAIL','SBICARD','SBILIFE','SBIN','SHREECEM','SHRIRAMFIN','SIEMENS',
  'SRF','SUNPHARMA','SUNTV','SUZLON','SYNGENE','SJVN',
  'TATACHEM','TATACOMM','TATAMOTORS','TATAPOWER','TATASTEEL','TATATECH',
  'TCS','TECHM','TITAN','TORNTPHARM','TORNTPOWER','TRENT',
  'UBL','ULTRACEMCO','UPL',
  'VEDL','VOLTAS',
  'WHIRLPOOL','WIPRO',
  'ZYDUSLIFE',
]);

// ── Main function ─────────────────────────────────────────────────────────────

const MIN_SCORE  = 58;
const MIN_SPREAD = 12;

export function screenOptionsStock(stock: Stock, rows: OHLCVRow[]): OptionsResult | null {
  if (rows.length < 52) return null;
  if (!FNO_SET.has(stock.nse_symbol)) return null;

  const closes = rows.map(r => r.close);
  const highs  = rows.map(r => r.high);
  const lows   = rows.map(r => r.low);
  const n      = closes.length;
  const price  = closes[n - 1];

  const e20  = emaArr(closes, 20);
  const e50  = emaArr(closes, 50);
  const e200 = emaArr(closes, 200);
  const ema20  = e20[e20.length - 1];
  const ema50  = e50[e50.length - 1];
  const ema200 = e200[e200.length - 1];

  const rsiVal = calcRsi(closes, 14);
  const macd   = calcMacd(closes);
  const vr     = volRatio(rows);
  const atr14  = calcAtr(rows, 14);
  const atrPct = price > 0 ? +(atr14 / price * 100).toFixed(2) : 0;

  const { label: setup, dir: setupDir } = detectSetup(rows, e20, e50);

  const bullBD = scoreBull(rows, closes, e20, e50, e200, rsiVal, macd, vr, setup);
  const bearBD = scoreBear(rows, closes, e20, e50, e200, rsiVal, macd, vr, setup);

  const bullScore = total(bullBD);
  const bearScore = total(bearBD);
  const spread    = Math.abs(bullScore - bearScore);

  const isBull = bullScore >= MIN_SCORE && bullScore > bearScore && spread >= MIN_SPREAD;
  const isBear = bearScore >= MIN_SCORE && bearScore > bullScore && spread >= MIN_SPREAD;
  if (!isBull && !isBear) return null;

  // Setup direction must agree (neutral/none is allowed for trend continuation)
  if (isBull && setupDir === 'bearish') return null;
  if (isBear && setupDir === 'bullish') return null;

  const direction: 'CALL' | 'PUT' = isBull ? 'CALL' : 'PUT';
  const score         = isBull ? bullScore : bearScore;
  const scoreBreakdown = isBull ? bullBD : bearBD;

  const confidence: 'Strong' | 'Moderate' | 'Watchlist' =
    score >= 75 ? 'Strong' : score >= 65 ? 'Moderate' : 'Watchlist';

  const holdingBias = (setup === 'Breakout with Volume' || setup === 'Breakdown with Volume')
    ? '1-2 days' : '2-5 days';

  const recent20H = Math.max(...highs.slice(-21, -1));
  const recent20L = Math.min(...lows.slice(-21, -1));

  let entryQuality: 'Early' | 'Triggered' | 'Extended';
  if (isBull) {
    entryQuality = price > recent20H * 1.025 ? 'Extended'
      : price >= recent20H * 0.997 ? 'Triggered' : 'Early';
  } else {
    entryQuality = price < recent20L * 0.975 ? 'Extended'
      : price <= recent20L * 1.003 ? 'Triggered' : 'Early';
  }

  const trendStatus = price > ema200
    ? (price > ema50 ? (price > ema20 ? 'Stage 2 Uptrend' : 'Above EMA50/200') : 'Above 200 EMA')
    : (price < ema50 ? (price < ema20 ? 'Stage 4 Downtrend' : 'Below EMA50/200') : 'Below 200 EMA');

  const reasons: string[] = [];
  const riskFlags: string[] = [];

  if (isBull) {
    if (price > ema200) reasons.push(`Price above 200-EMA (Rs.${ema200.toFixed(0)}) — uptrend intact`);
    if (price > ema50)  reasons.push(`Price above 50-EMA (Rs.${ema50.toFixed(0)}) — medium-term bull`);
    if (rsiVal > 55)    reasons.push(`RSI ${rsiVal} rising — momentum building`);
    if (macd.line > macd.signal) reasons.push('MACD above signal — bullish crossover');
    if (vr > 1.3)       reasons.push(`Vol ${vr}x avg — above-average participation`);
    if (setup !== 'None') reasons.push(`Pattern: ${setup}`);
    if (rsiVal > 72)    riskFlags.push('RSI overbought (>72) — momentum may be stretched');
  } else {
    if (price < ema200) reasons.push(`Price below 200-EMA (Rs.${ema200.toFixed(0)}) — downtrend structure`);
    if (price < ema50)  reasons.push(`Price below 50-EMA (Rs.${ema50.toFixed(0)}) — medium-term bear`);
    if (rsiVal < 45)    reasons.push(`RSI ${rsiVal} falling — momentum weakening`);
    if (macd.line < macd.signal) reasons.push('MACD below signal — bearish crossover');
    if (vr > 1.3)       reasons.push(`Vol ${vr}x avg — distribution volume`);
    if (setup !== 'None') reasons.push(`Pattern: ${setup}`);
    if (rsiVal < 28)    riskFlags.push('RSI oversold (<28) — bounce risk for put buyers');
  }

  if (vr < 1.1)            riskFlags.push('Low volume — move lacks institutional conviction');
  if (entryQuality === 'Extended') riskFlags.push('Price extended from trigger — prefer wait for pullback');
  if (atrPct < 1.0)        riskFlags.push('Low ATR (< 1%) — option premium decay risk is high');
  if (setup === 'None')    riskFlags.push('No clean pattern trigger — trend continuation only');
  if (spread < 18)         riskFlags.push('Moderate directional clarity — confirm with your view');

  return {
    symbol: stock.nse_symbol,
    company: stock.company,
    price,
    direction,
    score,
    bullishScore: bullScore,
    bearishScore: bearScore,
    directionalSpread: spread,
    confidence,
    setupType: setup === 'None' ? 'Trend Continuation' : setup,
    optionSide: isBull ? 'Buy Call' : 'Buy Put',
    holdingBias,
    entryQuality,
    volRatio: vr,
    atrPct,
    rsi: rsiVal,
    trendStatus,
    priceVsEma20Pct: +((price / ema20 - 1) * 100).toFixed(1),
    priceVsEma50Pct: +((price / ema50 - 1) * 100).toFixed(1),
    scoreBreakdown,
    reasons,
    riskFlags,
  };
}
