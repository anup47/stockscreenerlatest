import { NextRequest, NextResponse } from 'next/server';
import { analyse, decodeRow, intradayFlow, shardOf, type IntradayDay } from '@/lib/big-player';
import { readBhavIndex, readBhavShard, readDeals, dhanCharts, envDhanCreds, renewEnvToken, DhanError, type DhanStatus } from '@/lib/big-player-server';

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
// DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN env vars (renewed automatically when DHAN_PIN and DHAN_TOTP_SECRET
// are set). Without them the tab still works from NSE data alone.
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
  const env = envDhanCreds();
  const creds = hdrId && hdrTok ? { clientId: hdrId, accessToken: hdrTok, from: 'browser' } : env ? { ...env, from: 'env' } : null;

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
  let dhan: { status: DhanStatus; message: string; credsFrom?: string } = { status: 'no_credentials', message: 'Dhan not connected: save your Dhan keys in Settings, or add DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN in Vercel (plus DHAN_PIN and DHAN_TOTP_SECRET so the token renews itself). Buy/sell split uses the candle proxy.' };
  let intraday: Map<string, IntradayDay> | undefined;
  let bars = sessions.map(s => ({ d: s.d, o: s.o, h: s.h, l: s.l, c: s.c, v: s.vol }));
  let barsSource = 'NSE bhavcopy';
  if (creds && secId && window.length) {
    const base = { securityId: String(secId), exchangeSegment: 'NSE_EQ', instrument: 'EQUITY' };
    const run = async (c: { clientId: string; accessToken: string }) => {
      if (!c.accessToken) throw new DhanError('expired', 'No Dhan access token yet.');
      const today = new Date(Date.now() + 19800_000).toISOString().slice(0, 10);
      const daily = await dhanCharts('historical', { ...base, expiryCode: 0, oi: false, fromDate: addDays(today, -270), toDate: addDays(today, 1) }, c);
      // Minute candles in chunks of at most 60 calendar days (Dhan caps a request at 90).
      const flows = new Map<string, IntradayDay>();
      for (let from = window[0].d; from <= window.at(-1)!.d; from = addDays(from, 60)) {
        const to = [addDays(from, 59), window.at(-1)!.d].sort()[0];
        const m = await dhanCharts('intraday', { ...base, interval: '1', oi: false, fromDate: `${from} 09:15:00`, toDate: `${to} 15:30:00` }, c);
        intradayFlow(m.timestamp, m.open, m.close, m.volume).forEach((v, d) => flows.set(d, v));
      }
      return { daily, flows };
    };
    try {
      let out;
      try { out = await run(creds); }
      catch (e) {
        // Server-side token expired: generate a fresh one from DHAN_PIN + DHAN_TOTP_SECRET and retry once.
        const fresh = e instanceof DhanError && e.status === 'expired' && creds.from === 'env' ? await renewEnvToken().catch(() => null) : null;
        if (!fresh) throw e;
        out = await run({ clientId: creds.clientId, accessToken: fresh });
      }
      const { daily, flows } = out;
      if (daily.timestamp.length > sessions.length / 2) {
        bars = daily.timestamp.map((t, i) => ({ d: istDate(t), o: daily.open[i], h: daily.high[i], l: daily.low[i], c: daily.close[i], v: daily.volume[i] }));
        barsSource = 'Dhan daily candles';
      }
      intraday = flows;
      dhan = { status: 'ok', credsFrom: creds.from, message: `Intraday buy/sell split from Dhan 1-minute candles (${window.filter(s => flows.has(s.d)).length} of ${window.length} sessions).` };
    } catch (e) {
      dhan = e instanceof DhanError ? { status: e.status, message: e.message, credsFrom: creds.from } : { status: 'error', message: `Dhan request failed: ${e instanceof Error ? e.message : String(e)}`, credsFrom: creds.from };
      if (dhan.status === 'expired') dhan.message = creds.from === 'browser'
        ? 'Your saved Dhan access token has expired. Renew it in Settings (it renews itself if your PIN and TOTP secret are saved). Buy/sell split uses the candle proxy.'
        : 'The Dhan access token in Vercel (DHAN_ACCESS_TOKEN) has expired. Add DHAN_PIN and DHAN_TOTP_SECRET in Vercel so it renews itself. Buy/sell split uses the candle proxy.';
    }
  } else if (creds && !secId) {
    dhan = { status: 'error', message: `No Dhan security ID found for ${symbol}; buy/sell split uses the candle proxy.` };
  }

  const analysed = analyse(sessions, days, intraday);
  // NSE bulk/block deals on each day (collected from the first PC run onwards).
  const dealsFile = await readDeals(index.updatedAt);
  const stockDeals = dealsFile?.deals[symbol] ?? [];
  const rows = analysed.rows.map(r => ({ ...r, deals: stockDeals.filter(x => x.d === r.d) }));
  const body = {
    symbol, name, secId: secId || null, asOf: sessions.at(-1)?.d, latestNseDate: index.dates.at(-1), publishedAt: index.updatedAt,
    days, rows, summary: analysed.summary, bars: bars.slice(-180), barsSource, dhan, dealsFrom: dealsFile?.from ?? null,
  };
  if (dhan.status === 'ok' || dhan.status === 'no_credentials') memo.set(key, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return NextResponse.json(body);
}
