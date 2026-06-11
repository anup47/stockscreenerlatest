import { NextResponse } from 'next/server';
import { UNIVERSE } from '@/lib/universe';
import { buildStbtScan, calcStbtScore, type StbtResult } from '@/lib/stbt-engine';
import type { OHLCVRow } from '@/lib/indicators';
import type { StbtHistoryScan, StbtScreenData } from '@/lib/stbt-types';

export const maxDuration = 60;

const YF_BASE      = 'https://query1.finance.yahoo.com/v8/finance/chart';
const HISTORY_DAYS = 90;

interface YFResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }>;
        adjclose?: Array<{ adjclose: number[] }>;
      };
    }>;
    error?: unknown;
  };
}

async function fetchHistory(symbol: string): Promise<OHLCVRow[] | null> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1y&includeAdjustedClose=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: ctrl.signal });
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
  } catch { return null; }
  finally { clearTimeout(timer); }
}

interface OIBuildupRow  { symbol: string }
interface OIBuildupResponse {
  lb?: OIBuildupRow[]; sb?: OIBuildupRow[];
  sc?: OIBuildupRow[]; lu?: OIBuildupRow[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>(res => setTimeout(() => res(null), ms))]);
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

export async function GET() {
  const start = Date.now();

  const oiBuildupMap = new Map<string, 'lb' | 'sb' | 'sc' | 'lu'>();
  const fnoSet       = new Set<string>();

  const [niftyRows] = await Promise.all([
    fetchHistory('%5ENSEI'),
    withTimeout(
      (async () => {
        const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const oiRes = await fetch(`${base}/api/dhan/oi-buildup`, { cache: 'no-store' });
        if (!oiRes.ok) return;
        const oiData: OIBuildupResponse = await oiRes.json();
        for (const [key, rows] of [
          ['lb', oiData.lb ?? []], ['sb', oiData.sb ?? []],
          ['sc', oiData.sc ?? []], ['lu', oiData.lu ?? []],
        ] as Array<[string, OIBuildupRow[]]>) {
          for (const row of rows) {
            oiBuildupMap.set(row.symbol, key as 'lb' | 'sb' | 'sc' | 'lu');
            fnoSet.add(row.symbol);
          }
        }
      })(),
      8_000,
    ),
  ]);

  const niftyChangePct = niftyRows && niftyRows.length >= 2
    ? (niftyRows[niftyRows.length - 1].close - niftyRows[niftyRows.length - 2].close)
      / niftyRows[niftyRows.length - 2].close * 100
    : 0;

  const rawStocks = await Promise.all(
    UNIVERSE.map(async (stock) => {
      const rows = await fetchHistory(`${stock.nse_symbol}.NS`);
      if (!rows || rows.length < 65) return null;
      return { symbol: stock.nse_symbol, company: stock.company, rows };
    }),
  );
  const stockData = rawStocks.filter((r): r is NonNullable<typeof r> => r !== null);

  const allResults = buildStbtScan(stockData, niftyChangePct, oiBuildupMap, fnoSet);

  const history: Record<string, StbtHistoryScan> = {};
  const historyDates: string[] = [];

  const calendarRows = (niftyRows && niftyRows.length >= HISTORY_DAYS + 2)
    ? niftyRows
    : (stockData[0]?.rows.length ?? 0) >= HISTORY_DAYS + 2 ? stockData[0].rows : null;

  if (calendarRows) {
    const niftyChgMap = new Map<string, number>();
    if (niftyRows && niftyRows.length >= 2) {
      for (let i = 1; i < niftyRows.length; i++) {
        const chg = (niftyRows[i].close - niftyRows[i - 1].close) / niftyRows[i - 1].close * 100;
        niftyChgMap.set(isoDate(niftyRows[i].date), chg);
      }
    }

    const stockMaps = stockData.map(s => ({
      ...s,
      dateIdx: new Map(s.rows.map((r, i) => [isoDate(r.date), i])),
    }));

    const tradingDates = calendarRows.slice(-HISTORY_DAYS - 1, -1).map(r => isoDate(r.date)).reverse();

    for (const date of tradingDates) {
      const niftyChange    = niftyChgMap.get(date) ?? 0;
      const dayResults: StbtResult[] = [];

      for (const { symbol, company, rows, dateIdx } of stockMaps) {
        const idx = dateIdx.get(date);
        if (idx === undefined || idx < 64) continue;
        const r = calcStbtScore(symbol, company, rows.slice(0, idx + 1), niftyChange, undefined, false);
        if (r && r.score >= 30) dayResults.push(r);
      }
      dayResults.sort((a, b) => b.score - a.score);
      history[date] = { results: dayResults.slice(0, 10), total: dayResults.length, niftyChange };
      historyDates.push(date);
    }
  }

  return NextResponse.json({
    results:      allResults.slice(0, 10),
    total:        allResults.length,
    scanned:      stockData.length,
    niftyChange:  niftyChangePct,
    fetchedAt:    new Date().toISOString(),
    elapsedMs:    Date.now() - start,
    history,
    historyDates,
  } satisfies StbtScreenData);
}
