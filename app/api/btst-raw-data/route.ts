// Lightweight endpoint: fetch OHLCV for 40 stocks + Nifty, return raw numbers.
// No scoring here — scoring runs client-side so there is no timeout risk.
import { NextResponse } from 'next/server';

export const maxDuration = 30;

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const BTST_UNIVERSE = [
  { s: 'RELIANCE',   c: 'Reliance Industries' },
  { s: 'TCS',        c: 'TCS' },
  { s: 'INFY',       c: 'Infosys' },
  { s: 'HDFCBANK',   c: 'HDFC Bank' },
  { s: 'ICICIBANK',  c: 'ICICI Bank' },
  { s: 'SBIN',       c: 'SBI' },
  { s: 'AXISBANK',   c: 'Axis Bank' },
  { s: 'BHARTIARTL', c: 'Bharti Airtel' },
  { s: 'ITC',        c: 'ITC' },
  { s: 'LT',         c: 'L&T' },
  { s: 'BAJFINANCE', c: 'Bajaj Finance' },
  { s: 'HCLTECH',    c: 'HCL Tech' },
  { s: 'WIPRO',      c: 'Wipro' },
  { s: 'MARUTI',     c: 'Maruti' },
  { s: 'TATAMOTORS', c: 'Tata Motors' },
  { s: 'SUNPHARMA',  c: 'Sun Pharma' },
  { s: 'TATASTEEL',  c: 'Tata Steel' },
  { s: 'HINDALCO',   c: 'Hindalco' },
  { s: 'ONGC',       c: 'ONGC' },
  { s: 'NTPC',       c: 'NTPC' },
  { s: 'POWERGRID',  c: 'Power Grid' },
  { s: 'ADANIPORTS', c: 'Adani Ports' },
  { s: 'TITAN',      c: 'Titan' },
  { s: 'HAL',        c: 'HAL' },
  { s: 'BEL',        c: 'BEL' },
  { s: 'TATAPOWER',  c: 'Tata Power' },
  { s: 'IRCTC',      c: 'IRCTC' },
  { s: 'RVNL',       c: 'RVNL' },
  { s: 'PFC',        c: 'PFC' },
  { s: 'RECLTD',     c: 'REC' },
  { s: 'BHEL',       c: 'BHEL' },
  { s: 'VEDL',       c: 'Vedanta' },
  { s: 'HEROMOTOCO', c: 'Hero MotoCorp' },
  { s: 'INDIGO',     c: 'IndiGo' },
  { s: 'ZOMATO',     c: 'Zomato' },
  { s: 'PERSISTENT', c: 'Persistent Systems' },
  { s: 'LTIM',       c: 'LTIMindtree' },
  { s: 'COFORGE',    c: 'Coforge' },
  { s: 'DRREDDY',    c: "Dr Reddy's" },
  { s: 'COALINDIA',  c: 'Coal India' },
];

export interface BtstRawStock {
  symbol:  string;
  company: string;
  dates:   string[];   // ISO "YYYY-MM-DD"
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export interface BtstRawData {
  stocks:       BtstRawStock[];
  niftyDates:   string[];
  niftyCloses:  number[];
  tradingDates: string[];   // last 90 Nifty dates, newest-first
  fetchedAt:    string;
}

interface YFResult {
  timestamp: number[];
  indicators: {
    quote: Array<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }>;
  };
}

async function fetchOHLCV(yfSymbol: string): Promise<{ dates: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000); // abort if YF hangs
  try {
    const res = await fetch(
      `${YF_BASE}/${encodeURIComponent(yfSymbol)}?interval=1d&range=1y`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: ctrl.signal },
    );
    if (!res.ok) return null;
    const json = await res.json() as { chart: { result?: YFResult[] } };
    const r = json.chart?.result?.[0];
    if (!r) return null;
    const q = r.indicators.quote[0];
    const dates: string[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [], v: number[] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      if (q.close[i] == null || isNaN(q.close[i])) continue;
      dates.push(new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10));
      o.push(q.open[i]);
      h.push(q.high[i]);
      l.push(q.low[i]);
      c.push(q.close[i]);
      v.push(q.volume[i] ?? 0);
    }
    return { dates, o, h, l, c, v };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function GET() {
  // Each fetchOHLCV already has an 8s abort. Running 41 in parallel means
  // total time = max(individual times) ≤ 8s, well within maxDuration=30.
  const [nifty, ...stockRaw] = await Promise.all([
    fetchOHLCV('%5ENSEI'),
    ...BTST_UNIVERSE.map(u => fetchOHLCV(`${u.s}.NS`)),
  ]);

  if (!nifty || nifty.dates.length < 92) {
    return NextResponse.json({ error: 'Nifty data unavailable' }, { status: 502 });
  }

  const tradingDates = nifty.dates.slice(-90).reverse(); // newest first

  const stocks: BtstRawStock[] = BTST_UNIVERSE
    .map((u, i) => {
      const raw = stockRaw[i];
      if (!raw || raw.dates.length < 70) return null;
      return { symbol: u.s, company: u.c, dates: raw.dates, o: raw.o, h: raw.h, l: raw.l, c: raw.c, v: raw.v };
    })
    .filter((s): s is BtstRawStock => s !== null);

  return NextResponse.json({
    stocks,
    niftyDates:   nifty.dates,
    niftyCloses:  nifty.c,
    tradingDates,
    fetchedAt:    new Date().toISOString(),
  } satisfies BtstRawData);
}
