import { NextRequest, NextResponse } from 'next/server';
import { buildAnalysis, type OHLCVBar, type Timeframe, type Duration, type FnOData } from '@/lib/ta-analysis';

export const maxDuration = 60;

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Map our timeframe tokens to Yahoo Finance interval + range params
const YF_PARAMS: Record<Timeframe, { interval: string; range: string }> = {
  '1min':   { interval: '1m',  range: '1d' },
  '2min':   { interval: '2m',  range: '5d' },
  '5min':   { interval: '5m',  range: '5d' },
  '10min':  { interval: '10m', range: '5d' },
  '30min':  { interval: '30m', range: '1mo' },
  '1hour':  { interval: '1h',  range: '3mo' },
  '1day':   { interval: '1d',  range: '1y' },
  '1week':  { interval: '1wk', range: '5y' },
  '1month': { interval: '1mo', range: '10y' },
};

async function fetchBars(symbol: string, tf: Timeframe): Promise<OHLCVBar[] | null> {
  try {
    const { interval, range } = YF_PARAMS[tf];
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const rows: OHLCVBar[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const close = quote.close[i];
      if (close == null || isNaN(close)) continue;
      rows.push({
        date: new Date(timestamp[i] * 1000).toISOString().slice(0, 16),
        open: quote.open[i] ?? close,
        high: quote.high[i] ?? close,
        low: quote.low[i] ?? close,
        close,
        volume: quote.volume[i] ?? 0,
      });
    }
    return rows.length >= 10 ? rows : null;
  } catch { return null; }
}

// Fetch F&O data from NSE public API (no auth needed for option chain)
async function fetchFnO(symbol: string): Promise<FnOData | null> {
  try {
    const nseUrl = `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(nseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/option-chain',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const records: Array<{
      strikePrice: number;
      expiryDate: string;
      CE?: { openInterest: number; impliedVolatility: number; totalTradedVolume: number };
      PE?: { openInterest: number; impliedVolatility: number; totalTradedVolume: number };
    }> = data.records?.data ?? [];
    if (!records.length) return null;

    let totalCEOI = 0, totalPEOI = 0;
    let maxCEOI = 0, maxCEStrike = 0;
    let maxPEOI = 0, maxPEStrike = 0;
    let ivSum = 0, ivCount = 0;

    for (const r of records) {
      if (r.CE) {
        totalCEOI += r.CE.openInterest;
        if (r.CE.openInterest > maxCEOI) { maxCEOI = r.CE.openInterest; maxCEStrike = r.strikePrice; }
        if (r.CE.impliedVolatility > 0) { ivSum += r.CE.impliedVolatility; ivCount++; }
      }
      if (r.PE) {
        totalPEOI += r.PE.openInterest;
        if (r.PE.openInterest > maxPEOI) { maxPEOI = r.PE.openInterest; maxPEStrike = r.strikePrice; }
      }
    }

    const pcr = totalCEOI > 0 ? +(totalPEOI / totalCEOI).toFixed(2) : 0;
    const ivCurrent = ivCount > 0 ? +(ivSum / ivCount).toFixed(2) : 0;

    // Max pain: strike where total loss for all option buyers is maximum
    const strikes = [...new Set(records.map(r => r.strikePrice))].sort((a, b) => a - b);
    let minLoss = Infinity, maxPain = strikes[Math.floor(strikes.length / 2)];
    for (const s of strikes) {
      let loss = 0;
      for (const r of records) {
        if (r.CE) loss += Math.max(0, r.strikePrice - s) * r.CE.openInterest;
        if (r.PE) loss += Math.max(0, s - r.strikePrice) * r.PE.openInterest;
      }
      if (loss < minLoss) { minLoss = loss; maxPain = s; }
    }

    const lotSize = data.records?.strikePrices ? 0 : (data.records?.underlyingValue ? 0 : 0);

    const note = pcr > 1.5 ? 'High PCR — market expects support; bullish bias.'
      : pcr < 0.7 ? 'Low PCR — heavy call writing; bearish bias / capped upside.'
      : 'PCR neutral — balanced market sentiment.';

    return {
      lotSize,
      openInterest: totalCEOI + totalPEOI,
      oiChangePct: 0,
      pcr,
      maxPainStrike: maxPain,
      ivCurrent,
      topCEStrike: { strike: maxCEStrike, oi: maxCEOI },
      topPEStrike: { strike: maxPEStrike, oi: maxPEOI },
      note,
    };
  } catch { return null; }
}

const FNO_STOCKS = new Set([
  'RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','HDFC','KOTAKBANK','SBIN','AXISBANK',
  'LT','WIPRO','HCLTECH','BAJFINANCE','MARUTI','ONGC','TITAN','SUNPHARMA','ULTRACEMCO',
  'POWERGRID','NTPC','COALINDIA','BAJAJFINSV','TECHM','TATASTEEL','JSWSTEEL','HINDALCO',
  'GRASIM','ADANIENT','ADANIPORTS','TATAMOTORS','M&M','NESTLEIND','DIVISLAB','CIPLA',
  'DRREDDY','EICHERMOT','HEROMOTOCO','BPCL','IOC','VEDL','SAIL','NMDC','MCDOWELL-N',
  'PIDILITIND','SIEMENS','ABB','HAVELLS','VOLTAS','BERGEPAINT','ASIANPAINT',
]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawSymbol = (searchParams.get('symbol') ?? '').toUpperCase().trim();
  const timeframe = (searchParams.get('timeframe') ?? '1day') as Timeframe;
  const duration = (searchParams.get('duration') ?? '1month') as Duration;

  if (!rawSymbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  // Normalise: if user typed bare symbol add .NS suffix for Yahoo
  const yfSymbol = rawSymbol.endsWith('.NS') || rawSymbol.endsWith('.BO')
    ? rawSymbol
    : `${rawSymbol}.NS`;

  const bars = await fetchBars(yfSymbol, timeframe);
  if (!bars) {
    return NextResponse.json({ error: `No data found for ${rawSymbol}. Try appending .NS or .BO.` }, { status: 404 });
  }

  // F&O data only for listed F&O stocks
  const baseSymbol = rawSymbol.replace(/\.(NS|BO)$/, '');
  const fno = FNO_STOCKS.has(baseSymbol) ? await fetchFnO(baseSymbol) : null;

  const analysis = buildAnalysis(rawSymbol, bars, timeframe, duration, fno);
  return NextResponse.json(analysis);
}
