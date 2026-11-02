// Free data sources for the Commodity Tracker. Every fetcher throws on failure; build.ts
// records the failure per source and leaves that metric empty rather than guessing.
import type { Bar, CotPoint } from './types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function getText(url: string, timeoutMs = 25_000) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} HTTP ${res.status}`);
  return res.text();
}
const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ── Yahoo Finance ────────────────────────────────────────────────────────────

export async function yahooDaily(symbol: string, range = '10y'): Promise<Bar[]> {
  const j = JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`));
  const r = j.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`Yahoo ${symbol}: no data`);
  const q = r.indicators.quote[0];
  const round = (x: number | null) => (x == null ? undefined : Math.round(x * 1000) / 1000);
  return r.timestamp.map((t: number, i: number) => ({
    d: iso(new Date((t + 5.5 * 3600) * 1000)), o: round(q.open[i]), h: round(q.high[i]), l: round(q.low[i]), c: round(q.close[i]),
  })).filter((b: Bar) => b.c != null);
}

// Front/next futures contract prices for the term-structure read (e.g. GCZ26.CMX).
export async function yahooLast(symbol: string): Promise<number> {
  const j = JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`));
  const p = j.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!p) throw new Error(`Yahoo ${symbol}: no price`);
  return p;
}

// ── LME official prices and stocks (westmetall.com) ──────────────────────────

export interface LmeDay { date: string; cash: number; m3: number | null; stock: number | null }

// Table columns: date | cash-settlement | 3-month | stock. One page per calendar year.
export async function westmetall(field: 'LME_Al_cash' | 'LME_Zn_cash', year?: number): Promise<LmeDay[]> {
  const html = await getText(`https://www.westmetall.com/en/markdaten.php?action=table&field=${field}${year ? `&year=${year}` : ''}`);
  const num = (s: string) => { const v = Number(s.replace(/,/g, '')); return Number.isFinite(v) && v > 0 ? v : null; };
  const out: LmeDay[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => strip(c[1]).trim());
    const dm = cells[0]?.match(/^(\d{1,2})\.\s*([A-Za-z]+)\s+(\d{4})$/);
    const mi = dm ? MONTHS.indexOf(dm[2].toLowerCase()) : -1;
    const cash = num(cells[1] ?? '');
    if (!dm || mi < 0 || cash == null) continue;
    out.push({ date: `${dm[3]}-${String(mi + 1).padStart(2, '0')}-${dm[1].padStart(2, '0')}`, cash, m3: num(cells[2] ?? ''), stock: num(cells[3] ?? '') });
  }
  if (!out.length) throw new Error(`westmetall ${field} ${year ?? ''}: no rows`);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── FRED (no API key needed for the graph CSV) ───────────────────────────────

export async function fredSeries(id: string): Promise<{ date: string; value: number }[]> {
  const csv = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  return csv.trim().split('\n').slice(1).map(l => l.split(','))
    .map(([date, v]) => ({ date, value: Number(v) }))
    .filter(r => Number.isFinite(r.value) && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

// ── US Treasury daily yield curves (official; FRED times out from Vercel) ────

export async function treasury10y(kind: 'nominal' | 'real', years: number[]): Promise<{ date: string; value: number }[]> {
  const type = kind === 'nominal' ? 'daily_treasury_yield_curve' : 'daily_treasury_real_yield_curve';
  const out: { date: string; value: number }[] = [];
  for (const y of years) {
    const csv = await getText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=${type}&field_tdr_date_value=${y}&page&_format=csv`);
    const [hdr, ...lines] = csv.trim().split('\n');
    const col = hdr.split(',').map(h => h.replace(/"/g, '').trim().toUpperCase()).indexOf('10 YR');
    if (col < 0) throw new Error('Treasury: no 10 Yr column');
    for (const l of lines) {
      const f = l.split(','), [m, d, yy] = f[0].split('/'), v = Number(f[col]);
      if (yy && Number.isFinite(v)) out.push({ date: `${yy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, value: v });
    }
  }
  if (!out.length) throw new Error('Treasury: no rows');
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// CPI-U, all items (not seasonally adjusted) — monthly, for year-on-year inflation.
export async function blsCpi(): Promise<{ date: string; value: number }[]> {
  const j = JSON.parse(await getText('https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0'));
  const data = j.Results?.series?.[0]?.data as { year: string; period: string; value: string }[] | undefined;
  if (!data?.length) throw new Error('BLS: no CPI data');
  return data.filter(r => /^M(0[1-9]|1[0-2])$/.test(r.period))
    .map(r => ({ date: `${r.year}-${r.period.slice(1)}-01`, value: Number(r.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── CFTC Commitments of Traders (disaggregated, futures only) ────────────────

export async function cftcCot(marketCode: string, weeks = 160): Promise<CotPoint[]> {
  const since = iso(new Date(Date.now() - weeks * 7 * 864e5));
  const url = `https://publicreporting.cftc.gov/resource/kh3c-gbw2.json?$limit=${weeks + 10}&$order=report_date_as_yyyy_mm_dd`
    + `&$where=${encodeURIComponent(`cftc_contract_market_code='${marketCode}' AND report_date_as_yyyy_mm_dd > '${since}'`)}`;
  const rows = JSON.parse(await getText(url)) as Record<string, string>[];
  if (!rows.length) throw new Error(`CFTC ${marketCode}: no rows`);
  const n = (r: Record<string, string>, k: string) => Number(r[k] ?? 0);
  return rows.map(r => {
    const mmLong = n(r, 'm_money_positions_long_all'), mmShort = n(r, 'm_money_positions_short_all');
    return {
      date: r.report_date_as_yyyy_mm_dd.slice(0, 10), mmLong, mmShort, mmNet: mmLong - mmShort,
      prodNet: n(r, 'prod_merc_positions_long_all') - n(r, 'prod_merc_positions_short_all'),
      swapNet: n(r, 'swap_positions_long_all') - n(r, 'swap__positions_short_all'),
      oi: n(r, 'open_interest_all'),
    };
  });
}

// ── ETF metal holdings (iShares trust pages show tonnes in trust daily) ──────

export async function isharesTonnes(url: string): Promise<{ tonnes: number; asOf: string }> {
  const s = strip(await getText(url, 30_000));
  const m = s.match(/Tonnes in Trust\s*([\d,]+(?:\.\d+)?)\s*as of\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/);
  if (!m) throw new Error('iShares: tonnes not found');
  return { tonnes: Number(m[1].replace(/,/g, '')), asOf: iso(new Date(`${m[2]} UTC`)) };
}

// ── News (Google News RSS) ───────────────────────────────────────────────────

export interface RawNews { title: string; source: string; link: string; time: string }

export async function googleNews(query: string, limit = 30, days = 1): Promise<RawNews[]> {
  const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${days}d`)}&hl=en-IN&gl=IN&ceid=IN:en`);
  const dec = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  return xml.split('<item>').slice(1, limit + 1).map(chunk => {
    const tag = (t: string) => dec((chunk.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
    const source = tag('source'), raw = tag('title'), ts = Date.parse(tag('pubDate'));
    return { title: source && raw.endsWith(` - ${source}`) ? raw.slice(0, -source.length - 3) : raw, source: source || 'Google News', link: tag('link'), time: Number.isNaN(ts) ? '' : new Date(ts).toISOString() };
  }).filter(n => n.title && n.time);
}
