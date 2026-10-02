import { NextRequest, NextResponse } from 'next/server';
import { fetchEquityQuotes } from '@/lib/dhan-api';
import { readTargetsBlob, type TargetOverride } from '@/lib/research-targets-blob';
import researchList from '@/lib/research-list.json';

export const maxDuration = 60;

interface ResearchStock {
  id: number;
  company: string;
  symbol: string;
  yfSymbol: string;
  sector: string;
  stance: 'ACCUMULATE' | 'WATCH' | 'AVOID';
  researchCmp: number | null;
  baseTarget: number | null;  // base-case price target
  bullTarget: number | null;  // bull-case price target
  horizon: '12M' | '18M' | '24M' | '3Y' | null;
  currency?: 'INR' | 'USD';
  note?: string;
}

// Deep-dive stocks; also read by scripts/sync-research-targets.mjs to map PDF tickers.
// expectedReturn = avg(baseTarget, bullTarget) vs live CMP. null = not yet set.
const RESEARCH = researchList as ResearchStock[];

type MergedStock = ResearchStock & { fromSync: boolean; sourceFile?: string };

function applyOverride(s: ResearchStock, ov: TargetOverride | undefined): MergedStock {
  if (!ov) return { ...s, fromSync: false };
  return {
    ...s,
    baseTarget:  ov.baseTarget  ?? s.baseTarget,
    bullTarget:  ov.bullTarget  ?? s.bullTarget,
    researchCmp: ov.researchCmp ?? s.researchCmp,
    stance:      ov.stance      ?? s.stance,
    horizon:     (ov.horizon as ResearchStock['horizon']) ?? s.horizon,
    note:        ov.note        ?? s.note,
    fromSync:    true,
    sourceFile:  ov.sourceFile,
  };
}

function pdfOnlyStock(sym: string, ov: TargetOverride, i: number): ResearchStock {
  return {
    id: 1000 + i, company: ov.company, symbol: sym,
    yfSymbol: /^\d+$/.test(sym) ? `${sym}.BO` : `${sym}.NS`,
    sector: ov.sector ?? 'Research', stance: 'WATCH',
    researchCmp: null, baseTarget: null, bullTarget: null, horizon: null,
  };
}

interface LivePrice { price: number; changePct: number }

// Yahoo Finance fallback — BSE SME (.BO), NYSE (USD), and any Dhan-uncovered NSE stocks
async function fetchPriceYahoo(yfSymbol: string): Promise<LivePrice | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?interval=1d&range=5d&includeAdjustedClose=false`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
      (c: unknown) => typeof c === 'number' && !isNaN(c) && c > 0,
    );
    if (closes.length < 1) return null;
    const last = closes[closes.length - 1];
    const prev = closes.length >= 2 ? closes[closes.length - 2] : last;
    return { price: last, changePct: prev ? ((last - prev) / prev) * 100 : 0 };
  } catch { return null; }
}

async function fetchYahooBatch(yfSymbols: string[]): Promise<Map<string, LivePrice>> {
  const map = new Map<string, LivePrice>();
  const CONCURRENCY = 8;
  for (let i = 0; i < yfSymbols.length; i += CONCURRENCY) {
    const batch = yfSymbols.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(sym => fetchPriceYahoo(sym)));
    batch.forEach((sym, j) => { if (results[j]) map.set(sym, results[j]!); });
  }
  return map;
}

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  // PDF-synced overrides layered onto RESEARCH; stocks found only in PDFs get stub rows.
  const blob = await readTargetsBlob();
  const listed = new Set(RESEARCH.map(s => s.symbol.toUpperCase()));
  const pdfOnly = Object.entries(blob.overrides)
    .filter(([sym, ov]) => !listed.has(sym) && (ov.baseTarget != null || ov.bullTarget != null))
    .map(([sym, ov], i) => pdfOnlyStock(sym, ov, i));
  const MERGED = [...RESEARCH, ...pdfOnly].map(s => applyOverride(s, blob.overrides[s.symbol.toUpperCase()]));

  // Dhan covers NSE equity stocks; BSE SME (.BO) and NYSE (USD) always via Yahoo
  const nseStocks   = MERGED.filter(s => !s.yfSymbol.endsWith('.BO') && s.currency !== 'USD');
  const nonNseStocks = MERGED.filter(s =>  s.yfSymbol.endsWith('.BO') || s.currency === 'USD');

  // Parallel: Dhan for NSE (when creds provided) + Yahoo for BSE/NYSE
  const [dhanQuotes, yahooNonNse] = await Promise.all([
    (clientId && accessToken)
      ? fetchEquityQuotes(nseStocks.map(s => s.symbol), clientId, accessToken)
      : Promise.resolve(new Map<string, { ltp: number; changePct: number }>()),
    fetchYahooBatch(nonNseStocks.map(s => s.yfSymbol)),
  ]);

  // Fallback to Yahoo Finance for any NSE stock Dhan didn't return
  const dhanMisses    = nseStocks.filter(s => !dhanQuotes.has(s.symbol));
  const yahooNseFall  = dhanMisses.length > 0
    ? await fetchYahooBatch(dhanMisses.map(s => s.yfSymbol))
    : new Map<string, LivePrice>();

  // Merge into a single yfSymbol → LivePrice map
  const nseBySymbol = new Map(nseStocks.map(s => [s.symbol, s]));
  const prices      = new Map<string, LivePrice>();

  for (const [yfSym, lp] of yahooNonNse)  prices.set(yfSym, lp);
  for (const [sym,   q]  of dhanQuotes) {
    const stock = nseBySymbol.get(sym);
    if (stock) prices.set(stock.yfSymbol, { price: q.ltp, changePct: q.changePct });
  }
  for (const [yfSym, lp] of yahooNseFall) prices.set(yfSym, lp);

  const rows = MERGED.map(stock => {
    const live      = prices.get(stock.yfSymbol);
    const livePrice = live?.price     ?? null;
    const changePct = live?.changePct ?? null;

    // Expected return = avg(base, bull) vs live CMP when both targets exist;
    // falls back to whichever single target is set.
    let expectedReturn: number | null = null;
    if (livePrice != null) {
      const { baseTarget: b, bullTarget: u } = stock;
      if (b != null && u != null) {
        expectedReturn = (((b + u) / 2) - livePrice) / livePrice * 100;
      } else if (b != null) {
        expectedReturn = (b - livePrice) / livePrice * 100;
      } else if (u != null) {
        expectedReturn = (u - livePrice) / livePrice * 100;
      }
    }

    const vsCmp = (livePrice != null && stock.researchCmp != null)
      ? ((livePrice - stock.researchCmp) / stock.researchCmp) * 100
      : null;

    return {
      ...stock,
      target: stock.baseTarget, // backward compat alias
      livePrice, changePct, expectedReturn, vsCmp,
    };
  });

  const source = (clientId && accessToken) ? 'dhan' : 'yahoo';
  return NextResponse.json({ rows, fetchedAt: new Date().toISOString(), source, lastPdfSync: blob.lastSync || null });
}
