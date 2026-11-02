'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radar, Search, AlertTriangle, PlugZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import { RULES, type DayResult as BaseDay, type Deal, type Summary, type Verdict } from '@/lib/big-player';
import { PriceVolumeChart, VolumeRatioChart, TradeSizeScatter, VERDICT_COLOR, type Bar } from './Charts';

type DayResult = BaseDay & { deals: Deal[] };
interface Result {
  symbol: string; name: string; secId: number | null; asOf: string; latestNseDate: string; publishedAt: string;
  days: number; rows: DayResult[]; summary: Summary; bars: Bar[]; barsSource: string;
  dhan: { status: string; message: string; credsFrom?: string }; dealsFrom: string | null;
}

const RANGES = [10, 20, 40, 60];
const SECID_KEY = 'bigPlayer.secIds';
const LAST_KEY = 'bigPlayer.last';

const ROW_STYLE: Record<Verdict, string> = {
  'BIG PLAYER BOUGHT': 'bg-emerald-50', 'BIG PLAYER SOLD': 'bg-red-50', 'RETAIL BUYING / FOMO': 'bg-amber-50', 'RETAIL CHURN': 'bg-yellow-50/70', 'MIXED / NO CLEAR PLAYER': '',
};
const PILL_STYLE: Record<Verdict, string> = {
  'BIG PLAYER BOUGHT': 'bg-emerald-600 text-white', 'BIG PLAYER SOLD': 'bg-red-600 text-white',
  'RETAIL BUYING / FOMO': 'bg-amber-400 text-amber-950', 'RETAIL CHURN': 'bg-yellow-200 text-yellow-900', 'MIXED / NO CLEAR PLAYER': 'bg-gray-100 text-gray-600',
};

const store = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const inr = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${Math.round(v / 1e3)}k`);
const pct = (v: number | null, signed = false) => (v == null ? '—' : `${signed && v > 0 ? '+' : ''}${v.toFixed(signed ? 2 : 1)}%`);
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const lean = (r: DayResult) => (r.verdict === 'MIXED / NO CLEAR PLAYER' && Math.abs(r.score) >= 3 ? (r.score > 0 ? 'leans accumulation' : 'leans distribution') : null);

export default function BigPlayerTrackerPage() {
  const dhan = useDhanCredentials();
  const [input, setInput] = useState('');
  const [days, setDays] = useState(20);
  const [stocks, setStocks] = useState<[string, string][]>([]);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<{ message: string; suggestions?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (sym: string, range: number) => {
    const symbol = sym.trim().toUpperCase();
    if (!symbol) return;
    setLoading(true); setError(null);
    const secIds = store.get<Record<string, number>>(SECID_KEY, {});
    try {
      const qs = new URLSearchParams({ symbol, days: String(range), ...(secIds[symbol] ? { secId: String(secIds[symbol]) } : {}) });
      const res = await fetch(`/api/big-player?${qs}`, { headers: dhan.headers, cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) { setError({ message: json.error ?? `HTTP ${res.status}`, suggestions: json.suggestions }); return; }
      setData(json);
      if (json.secId) store.set(SECID_KEY, { ...secIds, [symbol]: json.secId });
      store.set(LAST_KEY, { symbol, days: range });
      window.history.replaceState(null, '', `?symbol=${encodeURIComponent(symbol)}&days=${range}`);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : 'Request failed' });
    } finally { setLoading(false); }
  }, [dhan.headers]);

  // Start from ?symbol= in the URL, else the last search, once the Dhan keys have been read from storage.
  useEffect(() => {
    if (!dhan.isHydrated) return;
    const url = new URLSearchParams(window.location.search);
    const last = store.get<{ symbol: string; days: number } | null>(LAST_KEY, null);
    const sym = url.get('symbol') ?? last?.symbol ?? 'RELIANCE';
    const range = Number(url.get('days')) || last?.days || 20;
    setInput(sym); setDays(RANGES.includes(range) ? range : 20);
    search(sym, RANGES.includes(range) ? range : 20);
    fetch('/api/big-player?list=1').then(r => (r.ok ? r.json() : null)).then(j => j && setStocks(j.stocks)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dhan.isHydrated]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); search(input, days); };
  const pickRange = (r: number) => { setDays(r); if (data) search(data.symbol, r); };
  const rowsDesc = data ? [...data.rows].reverse() : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1500px] mx-auto px-4 py-6 space-y-5">
        <div className="min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2"><Radar className="size-5 text-emerald-600" /> Big Player Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Did large institutional orders or small retail orders drive a stock each day? Read from trade size, delivery, volume and where the price closed.
          </p>
        </div>

        {/* ── Search ─────────────────────────────────────────────────────────── */}
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="bp-symbol">Enter NSE Symbol</label>
          <input id="bp-symbol" list="bp-stocks" value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="Enter NSE Symbol"
            autoComplete="off" spellCheck={false}
            className="h-9 w-full sm:w-64 rounded-md border border-border bg-background px-3 text-sm font-medium uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          <datalist id="bp-stocks">{stocks.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</datalist>
          <button type="submit" disabled={loading || !input.trim()}
            className="h-9 flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <Search className={cn('size-4', loading && 'animate-pulse')} /> {loading ? 'Searching…' : 'Search'}
          </button>
          <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="Trading days">
            {RANGES.map(r => (
              <button key={r} type="button" onClick={() => pickRange(r)}
                className={cn('h-9 px-3 text-xs font-medium', days === r ? 'bg-foreground text-background' : 'hover:bg-muted')}>{r}D</button>
            ))}
          </div>
        </form>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {error.message}
            {error.suggestions?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs">Did you mean:</span>
                {error.suggestions.map(s => (
                  <button key={s} onClick={() => { setInput(s); search(s, days); }} className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-amber-100">{s}</button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {data && (<>
          {/* ── Card 1: summary ─────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{data.symbol} <span className="text-sm font-normal text-muted-foreground">{data.name}</span></h2>
              <span className="text-xs text-muted-foreground">NSE data through {fmtDate(data.asOf)}</span>
            </div>
            <p className="text-sm sm:text-base font-medium leading-snug">{data.summary.headline}</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PILL_STYLE) as Verdict[]).map(v => (
                <span key={v} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', PILL_STYLE[v])}>{v} · {data.summary.counts[v]}</span>
              ))}
            </div>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 pt-1">
              <Stat label="Last 3 days" value={data.summary.last3Trend} sub={`score ${data.summary.last3Score > 0 ? '+' : ''}${data.summary.last3Score}`}
                tone={data.summary.last3Score >= 2 ? 'up' : data.summary.last3Score <= -2 ? 'down' : undefined} />
              <Stat label={`Net score, ${data.summary.days} days`} value={`${data.summary.netScore > 0 ? '+' : ''}${data.summary.netScore}`} sub="sum of daily −5…+5 scores"
                tone={data.summary.netScore > 0 ? 'up' : data.summary.netScore < 0 ? 'down' : undefined} />
              <Stat label="Delivery, last 5 days" value={pct(data.summary.delivRecent)} sub={`vs ${pct(data.summary.delivBase)} earlier in the window`}
                tone={data.summary.delivRecent != null && data.summary.delivBase != null ? (data.summary.delivRecent > data.summary.delivBase + 3 ? 'up' : data.summary.delivRecent < data.summary.delivBase - 3 ? 'down' : undefined) : undefined} />
              <Stat label="Buy minus sell volume" value={pct(data.summary.cumFlowPct, true)} sub={data.dhan.status === 'ok' ? 'of window volume, Dhan 1-min tick rule' : 'of window volume, candle proxy'}
                tone={data.summary.cumFlowPct > 5 ? 'up' : data.summary.cumFlowPct < -5 ? 'down' : undefined} />
            </div>
            <DhanStatus dhan={data.dhan} />
            {data.asOf < data.latestNseDate && <p className="text-xs text-amber-700">This stock did not trade on {fmtDate(data.latestNseDate)}.</p>}
          </section>

          {/* ── Card 2: day-by-day table ───────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="px-4 pt-3 pb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Day by day, newest first</h3>
              <span className="text-[11px] text-muted-foreground">Ratios compare each day with its own previous 20 sessions</span>
            </div>
            <table className="hidden lg:table w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border bg-muted/30">
                <tr>
                  {['Date', 'Close', 'Vol vs 20D', 'Avg Trade Size', 'Delivery%', 'Close vs VWAP', 'Verdict', 'Score', 'Confidence'].map((h, i) => (
                    <th key={h} className={cn('px-3 py-2 font-semibold', i === 0 || i === 6 ? 'text-left' : 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rowsDesc.map(r => (
                  <tr key={r.d} className={ROW_STYLE[r.verdict]}>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{fmtDate(r.d)}<DealBadges deals={r.deals} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.c.toLocaleString('en-IN')}<div className={cn('text-[11px]', (r.chgPct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{pct(r.chgPct, true)}</div></td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', r.volRatio > RULES.bigVol && 'font-semibold')}>{r.volRatio.toFixed(2)}×</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.avgTradeSize.toLocaleString('en-IN')} sh · {inr(r.avgTradeValue)}
                      <div className={cn('text-[11px]', r.atsRatio > RULES.bigSize ? 'text-emerald-700 font-semibold' : r.atsRatio < RULES.smallSize ? 'text-amber-700 font-semibold' : 'text-muted-foreground')}>{r.atsRatio.toFixed(2)}× 20D avg</div>
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', (r.delivPct ?? 0) > RULES.bigDeliv && 'font-semibold')}>{pct(r.delivPct)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', r.closeVsVwap >= 0 ? 'text-emerald-700' : 'text-red-700')}>{pct(r.closeVsVwap, true)}</td>
                    <td className="px-3 py-2"><VerdictPill r={r} /></td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-semibold', r.score > 0 ? 'text-emerald-700' : r.score < 0 ? 'text-red-700' : 'text-muted-foreground')}>{r.score > 0 ? '+' : ''}{r.score}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.confidence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phones and tablets: one card per day instead of a wide table. */}
            <ul className="lg:hidden divide-y divide-border/60 border-t border-border">
              {rowsDesc.map(r => (
                <li key={r.d} className={cn('px-4 py-3', ROW_STYLE[r.verdict])}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{fmtDate(r.d)}<DealBadges deals={r.deals} /> <span className="font-normal tabular-nums">· {r.c.toLocaleString('en-IN')}</span>
                      <span className={cn('ml-1 text-xs', (r.chgPct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>{pct(r.chgPct, true)}</span></span>
                    <span className={cn('text-sm font-bold tabular-nums', r.score > 0 ? 'text-emerald-700' : r.score < 0 ? 'text-red-700' : 'text-muted-foreground')}>{r.score > 0 ? '+' : ''}{r.score}</span>
                  </div>
                  <div className="mt-1.5"><VerdictPill r={r} /> <span className="text-[11px] text-muted-foreground">confidence {r.confidence}%</span></div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <Kv k="Vol vs 20D" v={`${r.volRatio.toFixed(2)}×`} />
                    <Kv k="Avg trade" v={`${r.avgTradeSize.toLocaleString('en-IN')} sh (${r.atsRatio.toFixed(2)}×)`} />
                    <Kv k="Delivery" v={pct(r.delivPct)} />
                    <Kv k="Close vs VWAP" v={pct(r.closeVsVwap, true)} />
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          <DealsCard rows={data.rows} from={data.dealsFrom} />

          {/* ── Charts ──────────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold">Price, volume and 20 DMA</h3>
              <span className="text-[11px] text-muted-foreground">{data.barsSource} · arrows mark big-player days, R marks retail days</span>
            </div>
            <PriceVolumeChart bars={data.bars} rows={data.rows} days={data.days} />
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm min-w-0">
              <h3 className="text-sm font-semibold">Avg trade size vs number of trades</h3>
              <p className="text-[11px] text-muted-foreground mb-2">Top-left: fewer, larger trades (big players). Bottom-right: many small trades (retail). Ringed dot is the latest day; dashed lines are window averages.</p>
              <TradeSizeScatter rows={data.rows} />
              <Legend />
            </section>
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm min-w-0">
              <h3 className="text-sm font-semibold">Volume vs 20-day average</h3>
              <p className="text-[11px] text-muted-foreground mb-2">Bars above the dashed 1.5× line clear the big-player volume rule. Colour shows the day&apos;s verdict.</p>
              <VolumeRatioChart rows={data.rows} />
              <Legend />
            </section>
          </div>

          <footer className="text-[11px] text-muted-foreground space-y-1">
            <p><b>Rules.</b> Big player bought / sold: average trade size above {RULES.bigSize}× its 20-day average, delivery above {RULES.bigDeliv}%, volume above {RULES.bigVol}× average,
              and the close in the top / bottom 30% of the day&apos;s range. Retail buying / FOMO: trade size below {RULES.smallSize}× average with trades above {RULES.fomoTrades}× average.
              Retail churn: small trades with the price within ±{RULES.flatPct}%. Score −5…+5 = direction (close in range, close vs VWAP, buy/sell split) × footprint (trade size, delivery, volume).
              Confidence: how far the day clears its rule&apos;s thresholds and whether the price signals agree; lower when fewer than 10 earlier sessions exist.</p>
            <p><b>Sources.</b> Trades, delivery and VWAP: NSE full bhavcopy (sec_bhavdata_full), refreshed by the office PC after NSE publishes it around 6 pm IST.
              Price candles and 1-minute intraday flow: DhanHQ v2 when connected. Bulk and block deals: NSE daily files, collected since {data.dealsFrom ? fmtDate(data.dealsFrom) : 'the first PC run'}.</p>
          </footer>
        </>)}

        {!data && !error && loading && <div className="h-40 rounded-xl border border-border bg-muted/40 animate-pulse" />}
      </div>
    </div>
  );
}

function DealBadges({ deals }: { deals: Deal[] }) {
  const kinds = [...new Set(deals.map(d => d.kind))];
  return <>{kinds.map(k => (
    <span key={k} title={deals.filter(d => d.kind === k).map(d => `${d.side} ${d.qty.toLocaleString('en-IN')} @ ${d.price} — ${d.client}`).join('\n')}
      className="ml-1.5 rounded bg-indigo-100 px-1 py-px text-[10px] font-semibold uppercase text-indigo-700 align-middle">{k}</span>
  ))}</>;
}

// Named bulk/block deals in the window: the one place the exchange says who traded.
function DealsCard({ rows, from }: { rows: DayResult[]; from: string | null }) {
  const deals = rows.flatMap(r => r.deals).sort((a, b) => b.d.localeCompare(a.d) || b.qty * b.price - a.qty * a.price);
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold">Bulk and block deals in this window</h3>
        <span className="text-[11px] text-muted-foreground">NSE names the buyer or seller · collected since {from ? fmtDate(from) : '—'}</span>
      </div>
      {deals.length === 0 ? <p className="text-sm text-muted-foreground">None reported{from && rows[0] && from > rows[0].d ? ` since ${fmtDate(from)}` : ''}.</p> : (
        <ul className="divide-y divide-border/60">
          {deals.map((d, i) => (
            <li key={i} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
              <span className="w-14 shrink-0 text-xs text-muted-foreground">{fmtDate(d.d)}</span>
              <span className="rounded bg-indigo-100 px-1 py-px text-[10px] font-semibold uppercase text-indigo-700">{d.kind}</span>
              <span className={cn('text-xs font-bold', d.side === 'BUY' ? 'text-emerald-700' : 'text-red-700')}>{d.side}</span>
              <span className="min-w-0 flex-1 font-medium">{d.client}</span>
              <span className="tabular-nums text-xs text-muted-foreground">{d.qty.toLocaleString('en-IN')} sh @ ₹{d.price.toLocaleString('en-IN')} · {inr(d.qty * d.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VerdictPill({ r }: { r: DayResult }) {
  const l = lean(r);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', PILL_STYLE[r.verdict])}>{r.verdict}</span>
      {l && <span className={cn('text-[11px]', r.score > 0 ? 'text-emerald-700' : 'text-red-700')}>{l}</span>}
    </span>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-lg border border-border/70 p-3 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-base sm:text-lg font-bold tabular-nums', tone === 'up' && 'text-emerald-700', tone === 'down' && 'text-red-700')}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2 min-w-0"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums font-medium text-right">{v}</dd></div>;
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {Object.entries(VERDICT_COLOR).map(([v, c]) => <span key={v} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: c }} />{v}</span>)}
    </div>
  );
}

function DhanStatus({ dhan }: { dhan: Result['dhan'] }) {
  const ok = dhan.status === 'ok';
  return (
    <p className={cn('flex items-start gap-1.5 text-xs', ok ? 'text-emerald-700' : 'text-amber-700')}>
      {ok ? <PlugZap className="size-3.5 mt-px shrink-0" /> : <AlertTriangle className="size-3.5 mt-px shrink-0" />}
      <span>{dhan.message}{ok && dhan.credsFrom ? ` Keys from ${dhan.credsFrom === 'env' ? 'Vercel env' : 'your saved Dhan settings'}.` : ''}</span>
    </p>
  );
}
