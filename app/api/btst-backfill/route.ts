import { NextResponse } from 'next/server';
import { calcBtstScore, BTST_THRESHOLDS, type BtstResult } from '@/lib/btst-engine';
import type { OHLCVRow } from '@/lib/indicators';
import type { BtstScreenData } from '@/app/api/btst-screen/route';

export const maxDuration = 60;

const YF_BASE    = 'https://query1.finance.yahoo.com/v8/finance/chart';
const LOOKBACK = 90; // trading days

// 40 most liquid F&O names — all fetched in ONE parallel batch (~5-8s total)
const BTST_UNIVERSE: Array<{ nse_symbol: string; company: string }> = [
  { nse_symbol: 'RELIANCE',   company: 'Reliance Industries' },
  { nse_symbol: 'TCS',        company: 'TCS' },
  { nse_symbol: 'INFY',       company: 'Infosys' },
  { nse_symbol: 'HDFCBANK',   company: 'HDFC Bank' },
  { nse_symbol: 'ICICIBANK',  company: 'ICICI Bank' },
  { nse_symbol: 'SBIN',       company: 'SBI' },
  { nse_symbol: 'AXISBANK',   company: 'Axis Bank' },
  { nse_symbol: 'BHARTIARTL', company: 'Bharti Airtel' },
  { nse_symbol: 'ITC',        company: 'ITC' },
  { nse_symbol: 'LT',         company: 'L&T' },
  { nse_symbol: 'BAJFINANCE', company: 'Bajaj Finance' },
  { nse_symbol: 'HCLTECH',    company: 'HCL Tech' },
  { nse_symbol: 'WIPRO',      company: 'Wipro' },
  { nse_symbol: 'MARUTI',     company: 'Maruti' },
  { nse_symbol: 'TATAMOTORS', company: 'Tata Motors' },
  { nse_symbol: 'SUNPHARMA',  company: 'Sun Pharma' },
  { nse_symbol: 'TATASTEEL',  company: 'Tata Steel' },
  { nse_symbol: 'HINDALCO',   company: 'Hindalco' },
  { nse_symbol: 'ONGC',       company: 'ONGC' },
  { nse_symbol: 'COALINDIA',  company: 'Coal India' },
  { nse_symbol: 'NTPC',       company: 'NTPC' },
  { nse_symbol: 'POWERGRID',  company: 'Power Grid' },
  { nse_symbol: 'ADANIPORTS', company: 'Adani Ports' },
  { nse_symbol: 'TITAN',      company: 'Titan' },
  { nse_symbol: 'HAL',        company: 'HAL' },
  { nse_symbol: 'BEL',        company: 'BEL' },
  { nse_symbol: 'TATAPOWER',  company: 'Tata Power' },
  { nse_symbol: 'IRCTC',      company: 'IRCTC' },
  { nse_symbol: 'RVNL',       company: 'RVNL' },
  { nse_symbol: 'PFC',        company: 'PFC' },
  { nse_symbol: 'RECLTD',     company: 'REC' },
  { nse_symbol: 'BHEL',       company: 'BHEL' },
  { nse_symbol: 'VEDL',       company: 'Vedanta' },
  { nse_symbol: 'HEROMOTOCO', company: 'Hero MotoCorp' },
  { nse_symbol: 'INDIGO',     company: 'IndiGo' },
  { nse_symbol: 'ZOMATO',     company: 'Zomato' },
  { nse_symbol: 'PERSISTENT', company: 'Persistent Systems' },
  { nse_symbol: 'LTIM',       company: 'LTIMindtree' },
  { nse_symbol: 'COFORGE',    company: 'Coforge' },
  { nse_symbol: 'DRREDDY',    company: "Dr Reddy's" },
];

export interface BtstBackfillData {
  history:   Record<string, BtstScreenData>; // date (YYYY-MM-DD) → scan
  dates:     string[];                       // sorted newest-first
  elapsedMs: number;
}

interface YFResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }>;
        adjclose?: Array<{ adjclose: number[] }>;
      };
    }>;
  };
}

async function fetchHistory(symbol: string): Promise<OHLCVRow[] | null> {
  try {
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1y&includeAdjustedClose=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (!res.ok) return null;
    const json: YFResponse = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const { timestamp, indicators } = result;
    const quote    = indicators.quote[0];
    const adjClose = indicators.adjclose?.[0]?.adjclose ?? [];
    const rows: OHLCVRow[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const close = quote.close[i];
      if (close == null || isNaN(close)) continue;
      rows.push({
        date:     new Date(timestamp[i] * 1000),
        open:     quote.open[i],
        high:     quote.high[i],
        low:      quote.low[i],
        close,
        adjClose: adjClose[i] ?? close,
        volume:   quote.volume[i] ?? 0,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const start = Date.now();

  // 1. Fetch Nifty — used for per-date change pct and to derive trading dates
  const niftyRows = await fetchHistory('%5ENSEI');
  if (!niftyRows || niftyRows.length < LOOKBACK + 2) {
    return NextResponse.json({ error: 'Could not fetch Nifty data' }, { status: 502 });
  }

  // Build niftyChange per trading date
  const niftyChangByDate = new Map<string, number>();
  for (let i = 1; i < niftyRows.length; i++) {
    const date = isoDate(niftyRows[i].date);
    const chg  = (niftyRows[i].close - niftyRows[i - 1].close) / niftyRows[i - 1].close * 100;
    niftyChangByDate.set(date, chg);
  }

  // Last 90 trading dates from Nifty bars (newest first)
  const tradingDates = niftyRows.slice(-LOOKBACK).map(r => isoDate(r.date)).reverse();

  // 2. Fetch all 40 stocks in one parallel batch — no sequential loops
  const rawResults = await Promise.all(
    BTST_UNIVERSE.map(async (stock) => {
      const rows = await fetchHistory(`${stock.nse_symbol}.NS`);
      if (!rows || rows.length < BTST_THRESHOLDS.minBarsRequired + 5) return null;
      const dateIndex = new Map<string, number>();
      rows.forEach((r, idx) => dateIndex.set(isoDate(r.date), idx));
      return { symbol: stock.nse_symbol, company: stock.company, rows, dateIndex };
    }),
  );
  const stockData = rawResults.filter((r): r is NonNullable<typeof r> => r !== null);

  // 3. For each trading date, compute BTST scores using bars up to that date
  const history: Record<string, BtstScreenData> = {};

  for (const date of tradingDates) {
    const niftyChange = niftyChangByDate.get(date) ?? 0;
    const results: BtstResult[] = [];

    for (const { symbol, company, rows, dateIndex } of stockData) {
      const idx = dateIndex.get(date);
      if (idx === undefined || idx < BTST_THRESHOLDS.minBarsRequired - 1) continue;
      const slice  = rows.slice(0, idx + 1);
      const result = calcBtstScore(symbol, company, slice, niftyChange, undefined, false);
      if (result && result.score >= 30) results.push(result);
    }

    results.sort((a, b) => b.score - a.score);

    history[date] = {
      results:     results.slice(0, 10),
      total:       results.length,
      scanned:     stockData.length,
      niftyChange,
      fetchedAt:   date + 'T15:25:00.000Z',
      elapsedMs:   0,
    };
  }

  return NextResponse.json({
    history,
    dates: tradingDates,
    elapsedMs: Date.now() - start,
  } satisfies BtstBackfillData);
}
