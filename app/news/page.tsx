'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Newspaper, RefreshCw, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NewsFeed, NewsItem, NewsKind, Sentiment } from '@/lib/news-24h';

const REFRESH_MS = 60 * 60_000;
const KINDS: NewsKind[] = ['Company', 'Filing', 'Deal', 'Price', 'Sector', 'Macro'];
const COMPANY_KINDS = new Set<NewsKind>(['Company', 'Filing', 'Deal', 'Price']);
const KIND_LABEL: Record<NewsKind, string> = {
  Company: 'Company news', Filing: 'Filings', Deal: 'Bulk/block deals', Price: 'Price/volume', Sector: 'Sector & peers', Macro: 'Macro',
};

const SENT_STYLE: Record<Sentiment, { pill: string; bar: string; row: string; chipOn: string; chipOff: string }> = {
  Positive: { pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', row: 'border-l-emerald-500', chipOn: 'bg-emerald-600 text-white border-emerald-600', chipOff: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' },
  Negative: { pill: 'bg-red-100 text-red-700 border-red-200',             bar: 'bg-red-500',     row: 'border-l-red-500',     chipOn: 'bg-red-500 text-white border-red-500',         chipOff: 'border-red-200 text-red-700 hover:bg-red-50' },
  Neutral:  { pill: 'bg-gray-100 text-gray-600 border-gray-200',          bar: 'bg-gray-400',    row: 'border-l-gray-300',    chipOn: 'bg-gray-600 text-white border-gray-600',       chipOff: 'border-gray-200 text-gray-600 hover:bg-gray-50' },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true };
  const day = (x: Date) => x.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  return day(d) === day(new Date())
    ? d.toLocaleTimeString('en-IN', opts)
    : d.toLocaleString('en-IN', { ...opts, day: 'numeric', month: 'short' });
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function ImpactDots({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Impact ${n}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={cn('size-1.5 rounded-full', i <= n ? (n >= 4 ? 'bg-foreground' : 'bg-muted-foreground') : 'bg-border')} />
      ))}
      <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">{n}</span>
    </span>
  );
}

const Chip = ({ on, onClick, className, children }: { on: boolean; onClick: () => void; className?: string; children: React.ReactNode }) => (
  <button onClick={onClick}
    className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
      on ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted', className)}>
    {children}
  </button>
);

export default function NewsPage() {
  const [feed, setFeed]       = useState<NewsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [sentiment, setSentiment] = useState<Sentiment | 'All'>('All');
  const [minImpact, setMinImpact] = useState(1);
  const [ticker, setTicker]       = useState('All');
  const [kinds, setKinds]         = useState<Set<NewsKind>>(new Set(KINDS));
  // Impact-first by default so company news isn't buried under hourly sector/peer stories.
  const [sortBy, setSortBy]       = useState<'time' | 'impact'>('impact');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/news-24h', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFeed(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Items Qwen judged unrelated (namesakes etc.) or older than the window are never shown.
  const items = useMemo(() => {
    if (!feed) return [];
    const cutoff = Date.now() - feed.windowHours * 3600_000;
    return feed.items.filter(i => i.relevant && Date.parse(i.time) >= cutoff);
  }, [feed]);

  const pulse = useMemo(() => {
    const by = (s: Sentiment) => items.filter(i => i.sentiment === s).length;
    const covered = new Set(items.filter(i => COMPANY_KINDS.has(i.kind)).flatMap(i => i.tickers));
    const quiet = (feed?.stocks ?? []).filter(s => !covered.has(s.symbol));
    const top = [...items].filter(i => i.impact >= 4).sort((a, b) => b.impact - a.impact || b.time.localeCompare(a.time)).slice(0, 3);
    return { pos: by('Positive'), neg: by('Negative'), neu: by('Neutral'), covered: covered.size, quiet, top };
  }, [items, feed]);

  const rows = useMemo(() => {
    const list = items.filter(i =>
      (sentiment === 'All' || i.sentiment === sentiment) &&
      i.impact >= minImpact &&
      kinds.has(i.kind) &&
      (ticker === 'All' || i.tickers.includes(ticker)));
    return list.sort((a, b) => sortBy === 'impact'
      ? b.impact - a.impact || b.time.localeCompare(a.time)
      : b.time.localeCompare(a.time));
  }, [items, sentiment, minImpact, kinds, ticker, sortBy]);

  const total = pulse.pos + pulse.neg + pulse.neu;
  const stale = feed?.generatedAt ? Date.now() - Date.parse(feed.generatedAt) > 2 * 3600_000 : false;
  const pendingCount = items.filter(i => i.pending).length;
  const selectedStock = feed?.stocks.find(s => s.symbol === ticker);

  const toggleKind = (k: NewsKind) => setKinds(prev => {
    const next = new Set(prev);
    if (next.has(k) && next.size > 1) next.delete(k); else next.add(k);
    return next;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1500px] mx-auto px-4 py-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Newspaper className="size-5 text-emerald-600" />
              24H News Summary
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {feed?.stocks.length ?? '—'} Research Targets stocks · filings, deals, price alerts, company, sector & macro news
              {feed?.generatedAt && <> · built {fmtTime(feed.generatedAt)} IST ({ago(feed.generatedAt)}) with {feed.model}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {stale && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border bg-amber-50 text-amber-700 border-amber-200"
                title="The feed is rebuilt hourly by a scheduled task on the office PC. It pauses while that PC is off.">
                <AlertTriangle className="size-3" /> Not updated for {ago(feed!.generatedAt)}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" /> Auto-refresh hourly
            </span>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-40">
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error} — <button className="underline" onClick={load}>Retry</button>
          </div>
        )}

        {/* ── Portfolio Pulse ────────────────────────────────────────────────── */}
        <section className="mb-5 rounded-xl border border-border shadow-sm p-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Portfolio Pulse</p>
            <p className="text-lg font-semibold text-foreground">
              <span className="text-emerald-700">{pulse.pos} Positive</span>,{' '}
              <span className="text-red-600">{pulse.neg} Negative</span>,{' '}
              <span className="text-gray-600">{pulse.neu} Neutral</span>
              <span className="text-muted-foreground font-normal"> in last 24H</span>
            </p>
            {total > 0 && (
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={SENT_STYLE.Positive.bar} style={{ width: `${(pulse.pos / total) * 100}%` }} />
                <div className={SENT_STYLE.Negative.bar} style={{ width: `${(pulse.neg / total) * 100}%` }} />
                <div className={SENT_STYLE.Neutral.bar}  style={{ width: `${(pulse.neu / total) * 100}%` }} />
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {pulse.covered} of {feed?.stocks.length ?? 0} stocks have company-level updates · {pulse.quiet.length} with no material update
              {pendingCount > 0 && <> · {pendingCount} provisional items, Qwen reviews them on the next run</>}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Most price-sensitive</p>
            {pulse.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing rated impact 4 or 5 in the last 24 hours.</p>
            ) : (
              <ul className="space-y-1.5">
                {pulse.top.map(i => (
                  <li key={i.id} className={cn('border-l-2 pl-2 text-sm leading-snug', SENT_STYLE[i.sentiment].row)}>
                    <button className="font-semibold text-foreground hover:underline mr-1.5" onClick={() => setTicker(i.tickers.length === 1 ? i.tickers[0] : 'All')}>
                      {i.label}
                    </button>
                    <span className="text-foreground/80">{i.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Filters ────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Chip on={sentiment === 'All'} onClick={() => setSentiment('All')}>All ({total})</Chip>
          {(['Positive', 'Negative', 'Neutral'] as Sentiment[]).map(s => (
            <Chip key={s} on={false} onClick={() => setSentiment(sentiment === s ? 'All' : s)}
              className={sentiment === s ? SENT_STYLE[s].chipOn : SENT_STYLE[s].chipOff}>
              {s} ({s === 'Positive' ? pulse.pos : s === 'Negative' ? pulse.neg : pulse.neu})
            </Chip>
          ))}

          <div className="w-px self-stretch bg-border mx-1" />

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Impact
            <select value={minImpact} onChange={e => setMinImpact(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
              <option value={1}>Any</option>
              {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 5 ? '5 only' : `${n}+`}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Ticker
            <select value={ticker} onChange={e => setTicker(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground max-w-[220px]">
              <option value="All">All stocks</option>
              {[...(feed?.stocks ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol)).map(s => (
                <option key={s.symbol} value={s.symbol}>{s.symbol} · {s.company}</option>
              ))}
            </select>
          </label>

          <div className="w-px self-stretch bg-border mx-1" />

          <button onClick={() => setSortBy(sortBy === 'time' ? 'impact' : 'time')}
            className="px-3 py-1 rounded-md text-xs font-medium border border-border hover:bg-muted">
            Sort: {sortBy === 'time' ? 'Newest first' : 'Impact first'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-xs text-muted-foreground mr-1">Show:</span>
          {KINDS.map(k => (
            <button key={k} onClick={() => toggleKind(k)}
              className={cn('px-2.5 py-0.5 rounded text-xs font-medium border transition-colors',
                kinds.has(k) ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted text-muted-foreground')}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-left">
                  {['Time', 'Ticker', 'Company', 'Headline', 'Source', 'Summary', 'Sentiment', 'Impact', 'Link'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(i => <NewsRow key={i.id} item={i} onTicker={setTicker} />)}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {selectedStock
                        ? <><span className="font-semibold text-foreground">{selectedStock.symbol}</span> · {selectedStock.company}: No material update in the last 24H</>
                        : feed?.generatedAt ? 'No items match these filters.' : 'The feed has not been built yet. It appears after the first hourly run on the office PC.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── No material update ─────────────────────────────────────────────── */}
        {pulse.quiet.length > 0 && (
          <section className="mt-5">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              No material update in last 24H ({pulse.quiet.length})
              <span className="font-normal"> · no company news, filing, deal or price/volume alert</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pulse.quiet.map(s => (
                <button key={s.symbol} onClick={() => setTicker(s.symbol)} title={`${s.company} · ${s.sector}`}
                  className="px-2 py-0.5 rounded border border-border text-xs text-muted-foreground hover:bg-muted">
                  {s.symbol}
                </button>
              ))}
            </div>
          </section>
        )}

        {feed?.health && Object.keys(feed.health).length > 0 && (
          <p className="mt-6 text-[11px] text-muted-foreground">
            Sources last run: {Object.entries(feed.health).map(([k, v]) => `${k} ${v}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

function NewsRow({ item: i, onTicker }: { item: NewsItem; onTicker: (t: string) => void }) {
  const s = SENT_STYLE[i.sentiment];
  return (
    <tr className={cn('border-b border-border/60 last:border-0 border-l-4 align-top hover:bg-muted/30', s.row)}>
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap tabular-nums">{fmtTime(i.time)}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <button onClick={() => i.tickers.length === 1 && onTicker(i.tickers[0])}
          className={cn('text-xs font-semibold', i.tickers.length === 1 ? 'text-foreground hover:underline' : 'text-muted-foreground cursor-default')}
          title={i.tickers.length > 1 ? `Bears on: ${i.tickers.join(', ')}` : undefined}>
          {i.label}
        </button>
        <div className="text-[10px] text-muted-foreground">{KIND_LABEL[i.kind]}</div>
      </td>
      <td className="px-3 py-2.5 text-xs text-foreground/80 min-w-[120px]">{i.company}</td>
      <td className="px-3 py-2.5 text-xs text-foreground min-w-[220px] max-w-[340px]">{i.headline}</td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{i.source}</td>
      <td className="px-3 py-2.5 text-xs text-foreground/90 min-w-[240px] max-w-[380px]">
        {i.summary}
        {i.pending && <span className="ml-1 text-[10px] text-muted-foreground" title="Provisional verdict; Qwen reviews it on the next hourly run">· provisional</span>}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border', s.pill)}>{i.sentiment}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap"><ImpactDots n={i.impact} /></td>
      <td className="px-3 py-2.5">
        {i.link && (
          <a href={i.link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="Open source">
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </td>
    </tr>
  );
}
