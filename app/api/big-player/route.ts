import { NextRequest, NextResponse } from 'next/server';
import { analyse, decodeRow, intradayFlow, shardOf, type IntradayDay } from '@/lib/big-player';
import { readBhavIndex, readBhavShard, dhanCharts, DhanError, type DhanStatus } from '@/lib/big-player-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WINDOWS = [10, 20, 40, 60];
const istDate = (sec: number) => new Date(((sec > 1e12 ? sec / 1000 : sec) + 19800) * 1000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Short in-process cache so repeated searches don't spend Dhan's rate limit.
const memo = new Map<string, { at: number; body: unknown }>();

// GET /api/big-player?list=1                        → symbols + company names for the search box
// GET /api/big-player?symbol=RELIANCE&days=20[&secId=2885]
// Dhan credentials: x-dhan-client-id / x-dhan-access-token headers (the app's Dhan settings), else
// DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN env vars. Without them the tab still works from NSE data alone.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const index = await readBhavIndex();
  if (!index) return NextResponse.json({ error: 'NSE delivery data has not been published yet. Run scripts/bhav-delivery.mjs on the office PC.' }, { status: 503 });

  if (q.get('list')) {
    return NextResponse.json({ asOf: index.dates.at(-1), stocks: Object.entries(index.stocks).map(([s, [, name]]) => [s, name]) },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } });
  }

  const symbol = (q.get('symbol') ?? '').trim().toUpperCase().replace(/\.(NS|NSE)$/, '');
  const days = WINDOWS.includes(Number(q.get('days'))) ? Number(q.get('days')) : 20;
  if (!symbol) return NextResponse.json({ error: 'Enter an NSE symbol, for example RELIANCE.' }, { status: 400 });
  if (!index.stocks[symbol]) {
    const all = Object.keys(index.stocks);
    const suggestions = [...all.filter(s => s.startsWith(symbol)), ...all.filter(s => !s.startsWith(symbol) && s.includes(symbol))].slice(0, 8);
    return NextResponse.json({ error: `${symbol} is not an NSE-listed stock that traded in the last ${index.dates.length} sessions.`, suggestions }, { status: 404 });
  }

  const hdrId = req.headers.get('x-dhan-client-id') ?? '', hdrTok = req.headers.get('x-dhan-access-token') ?? '';
  const creds = hdrId && hdrTok ? { clientId: hdrId, accessToken: hdrTok, from: 'browser' }
    : process.env.DHAN_CLIENT_ID && process.env.DHAN_ACCESS_TOKEN ? { clientId: process.env.DHAN_CLIENT_ID, accessToken: process.env.DHAN_ACCESS_TOKEN, from: 'env' } : null;

  const key = `${symbol}|${days}|${creds?.from ?? 'none'}|${index.updatedAt}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return NextResponse.json(hit.body);

  const shard = await readBhavShard(shardOf(symbol), index.updatedAt);
  const row = shard?.rows[symbol];
  if (!row) return NextResponse.json({ error: 'NSE delivery data for this stock could not be loaded. Try again shortly.' }, { status: 503 });
  const sessions = decodeRow(shard.dates, row);
  const [secIdFromIndex, name] = index.stocks[symbol];
  const secId = Number(q.get('secId')) || secIdFromIndex;
  const window = sessions.slice(-days);

  // Dhan: daily candles for the price chart (longer history than the NSE cache) and 1-minute candles
  // for the intraday buy/sell split. Both optional.
  let dhan: { status: DhanStatus; message: string; credsFrom?: string } = { status: 'no_credentials', message: 'Dhan not connected: add DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN in Vercel, or save your Dhan keys in the app. Buy/sell split uses the candle proxy.' };
  let intraday: Map<string, IntradayDay> | undefined;
  let bars = sessions.map(s => ({ d: s.d, o: s.o, h: s.h, l: s.l, c: s.c, v: s.vol }));
  let barsSource = 'NSE bhavcopy';
  if (creds && secId && window.length) {
    const base = { securityId: String(secId), exchangeSegment: 'NSE_EQ', instrument: 'EQUITY' };
    try {
      const today = new Date(Date.now() + 19800_000).toISOString().slice(0, 10);
      const daily = await dhanCharts('historical', { ...base, expiryCode: 0, oi: false, fromDate: addDays(today, -270), toDate: addDays(today, 1) }, creds);
      if (daily.timestamp.length > sessions.length / 2) {
        bars = daily.timestamp.map((t, i) => ({ d: istDate(t), o: daily.open[i], h: daily.high[i], l: daily.low[i], c: daily.close[i], v: daily.volume[i] }));
        barsSource = 'Dhan daily candles';
      }
      // Minute candles in chunks of at most 60 calendar days (Dhan caps a request at 90).
      const flows = new Map<string, IntradayDay>();
      for (let from = window[0].d; from <= window.at(-1)!.d; from = addDays(from, 60)) {
        const to = [addDays(from, 59), window.at(-1)!.d].sort()[0];
        const m = await dhanCharts('intraday', { ...base, interval: '1', oi: false, fromDate: `${from} 09:15:00`, toDate: `${to} 15:30:00` }, creds);
        intradayFlow(m.timestamp, m.open, m.close, m.volume).forEach((v, d) => flows.set(d, v));
      }
      intraday = flows;
      dhan = { status: 'ok', credsFrom: creds.from, message: `Intraday buy/sell split from Dhan 1-minute candles (${window.filter(s => flows.has(s.d)).length} of ${window.length} sessions).` };
    } catch (e) {
      dhan = e instanceof DhanError ? { status: e.status, message: e.message, credsFrom: creds.from } : { status: 'error', message: `Dhan request failed: ${e instanceof Error ? e.message : String(e)}`, credsFrom: creds.from };
    }
  } else if (creds && !secId) {
    dhan = { status: 'error', message: `No Dhan security ID found for ${symbol}; buy/sell split uses the candle proxy.` };
  }

  const { rows, summary } = analyse(sessions, days, intraday);
  const body = {
    symbol, name, secId: secId || null, asOf: sessions.at(-1)?.d, latestNseDate: index.dates.at(-1), publishedAt: index.updatedAt,
    days, rows, summary, bars: bars.slice(-180), barsSource, dhan,
  };
  if (dhan.status === 'ok' || dhan.status === 'no_credentials') memo.set(key, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return NextResponse.json(body);
}
