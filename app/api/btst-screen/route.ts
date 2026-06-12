import { NextResponse } from 'next/server';
import { UNIVERSE } from '@/lib/universe';
import { buildBtstScan, calcBtstScore, type BtstResult } from '@/lib/btst-engine';
import type { OHLCVRow } from '@/lib/indicators';
import type { HistoryScan, BtstScreenData } from '@/lib/btst-types';
import { computeBacktestStats, type BacktestTrade } from '@/lib/backtest-engine';

// Re-export for any server-side consumers that previously imported from this route
export type { HistoryScan, BtstScreenData };

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
  const ctrl = new AbortController();
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

// Simulate a 5-day BTST hold with stop-loss.
// Checks each day's LOW — if it touches or breaks the stop, exit at stopLoss price.
// Returns null if insufficient forward data.
function simulate5dBtst(
  rows: OHLCVRow[],
  idx: number,
  stopLoss: number,
): { exitPrice: number } | null {
  if (idx + 5 >= rows.length) return null;
  for (let k = 1; k <= 5; k++) {
    const row = rows[idx + k];
    if (!row || !row.close || isNaN(row.close) || row.low == null) return null;
    if (row.low <= stopLoss) return { exitPrice: stopLoss }; // stop triggered
  }
  const exitRow = rows[idx + 5];
  if (!exitRow?.close || isNaN(exitRow.close)) return null;
  return { exitPrice: exitRow.close };
}

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

  const allResults = buildBtstScan(stockData, niftyChangePct, oiBuildupMap, fnoSet);

  const history: Record<string, HistoryScan> = {};
  const historyDates: string[] = [];
  const btTrades: BacktestTrade[]    = [];
  const bt5dTrades: BacktestTrade[] = [];

  // Use Nifty rows for trading calendar + RS; fall back to first stock's rows when Nifty fetch fails
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
      const niftyChange = niftyChgMap.get(date) ?? 0;
      const daySignals: Array<{ r: BtstResult; nextClose: number | null; rows: OHLCVRow[]; idx: number }> = [];

      for (const { symbol, company, rows, dateIdx } of stockMaps) {
        const idx = dateIdx.get(date);
        if (idx === undefined || idx < 64) continue;
        const r = calcBtstScore(symbol, company, rows.slice(0, idx + 1), niftyChange, undefined, false);
        if (!r || r.score < 30) continue;
        const nc = rows[idx + 1]?.close;
        daySignals.push({ r, nextClose: nc && nc > 0 && !isNaN(nc) ? nc : null, rows, idx });
      }

      daySignals.sort((a, b) => b.r.score - a.r.score);
      const top10 = daySignals.slice(0, 10);

      history[date] = { results: top10.map(s => s.r), total: daySignals.length, niftyChange };
      historyDates.push(date);

      // Backtest — top 10 per day matches what the screener shows
      for (const { r, nextClose, rows: stockRows, idx } of top10) {
        // 1-day exit
        if (nextClose) {
          btTrades.push({
            date, symbol: r.symbol, company: r.company,
            score: r.score, conviction: r.conviction,
            entryClose: r.close, nextClose,
            returnPct: (nextClose - r.close) / r.close * 100,
            isWin:     nextClose > r.close,
          });
        }
        // 5-day exit with stop loss applied intraday
        const exit5d = simulate5dBtst(stockRows, idx, r.stopLoss);
        if (exit5d) {
          bt5dTrades.push({
            date, symbol: r.symbol, company: r.company,
            score: r.score, conviction: r.conviction,
            entryClose: r.close, nextClose: exit5d.exitPrice,
            returnPct: (exit5d.exitPrice - r.close) / r.close * 100,
            isWin:     exit5d.exitPrice > r.close,
          });
        }
      }
    }
  }

  const backtest    = computeBacktestStats(btTrades);
  const backtest5d  = computeBacktestStats(bt5dTrades);

  return NextResponse.json({
    results:      allResults.slice(0, 10),
    total:        allResults.length,
    scanned:      stockData.length,
    niftyChange:  niftyChangePct,
    fetchedAt:    new Date().toISOString(),
    elapsedMs:    Date.now() - start,
    history,
    historyDates,
    backtest,
    backtest5d,
  } satisfies BtstScreenData);
}
