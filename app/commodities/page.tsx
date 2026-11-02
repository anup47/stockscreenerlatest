'use client';

import { useEffect, useMemo, useState } from 'react';
import { Gem, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CODES, type CommoditiesFeed, type CommodityCode } from '@/lib/commodities/types';
import FundamentalSheet from './FundamentalSheet';
import TechChart from './TechChart';
import { Prediction, TechPanels, EquityReadThrough, SIGNAL_STYLE } from './Outlook';

type Tab = 'fundamental' | 'technical' | 'news';
const TABS: { key: Tab; label: string }[] = [
  { key: 'fundamental', label: 'Fundamental Sheet' }, { key: 'technical', label: 'Technical Chart' }, { key: 'news', label: 'News' },
];
const NEWS_STYLE = { Bullish: 'bg-emerald-100 text-emerald-700 border-emerald-200', Bearish: 'bg-red-100 text-red-700 border-red-200', Neutral: 'bg-gray-100 text-gray-600 border-gray-200' };
const fmtPrice = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 1 : 2, minimumFractionDigits: v >= 100 ? 1 : 2 });
const ist = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export default function CommoditiesPage() {
  const [feed, setFeed] = useState<CommoditiesFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<CommodityCode>('GOLD');
  const [tab, setTab] = useState<Tab>('fundamental');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/commodities', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setFeed(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const c = feed?.commodities[code];
  const failing = useMemo(() => Object.entries(feed?.health ?? {}).filter(([, v]) => v.startsWith('error')), [feed]);
  const stale = feed ? Date.now() - Date.parse(feed.updatedAt) > 36 * 3600_000 : false;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1500px] mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2"><Gem className="size-5 text-emerald-600" /> Commodity Tracker</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gold, silver, aluminium and zinc: fundamentals first, with technicals, high-impact news and a 1–7 day signal plus 12-month scenario.
              {feed && <> Updated {ist(feed.updatedAt)} IST · refreshes daily at 9:00 am IST.</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stale && <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border bg-amber-50 text-amber-700 border-amber-200"><AlertTriangle className="size-3" /> Data over a day old</span>}
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted disabled:opacity-40">
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>

        {error && <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">{error}</div>}

        {/* ── Top cards ─────────────────────────────────────────────────────── */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {CODES.map(k => {
            const x = feed?.commodities[k];
            return (
              <button key={k} onClick={() => setCode(k)}
                className={cn('rounded-xl border bg-card p-4 text-left shadow-sm transition-colors', code === k ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-border hover:bg-muted/40')}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{x?.name ?? k}</span>
                  {x && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', SIGNAL_STYLE[x.signal.label])}>{x.signal.label} {x.signal.score > 0 ? '+' : ''}{x.signal.score}</span>}
                </div>
                {x ? (<>
                  <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums">{fmtPrice(x.latest.price)} <span className="text-xs font-normal text-muted-foreground">{x.unit}</span></div>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className={cn('font-semibold tabular-nums', (x.latest.changePct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {x.latest.changePct == null ? '—' : `${x.latest.changePct > 0 ? '+' : ''}${x.latest.changePct.toFixed(2)}%`}
                    </span>
                    <span className="text-muted-foreground">{x.latest.date}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground truncate">₹ parity {x.history.at(-1)?.inrParity?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '—'} {x.inrUnit}</div>
                </>) : <div className="mt-2 h-10 rounded bg-muted animate-pulse" />}
              </button>
            );
          })}
        </div>

        {c && (<>
          {/* ── Tabs ────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex overflow-x-auto border-b border-border [scrollbar-width:none]">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn('px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px', tab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  {t.label}
                </button>
              ))}
              <span className="ml-auto self-center px-4 text-xs text-muted-foreground whitespace-nowrap">{c.name} · {c.priceSource}</span>
            </div>
            <div className="p-4">
              {tab === 'fundamental' && <FundamentalSheet c={c} />}
              {tab === 'technical' && (
                <div className="space-y-5">
                  <TechChart bars={c.bars} unit={c.unit} />
                  <TechPanels c={c} />
                </div>
              )}
              {tab === 'news' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Top {c.news.length || 5} high-impact headlines from the last 24 hours, tagged by keyword rules
                    ({c.code === 'GOLD' || c.code === 'SILVER' ? 'Fed, rates, dollar, war, central banks, ETF flows' : 'China stimulus, smelter cuts, power, property, inventories, imports'}).
                  </p>
                  {c.news.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No high-impact headlines in the last 24 hours.</p>}
                  <ul className="divide-y divide-border/60">
                    {c.news.map(n => (
                      <li key={n.link} className="py-2.5 flex items-start gap-3">
                        <span className={cn('shrink-0 mt-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium', NEWS_STYLE[n.sentiment])}>{n.sentiment}</span>
                        <div className="min-w-0">
                          <a href={n.link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">{n.title} <ExternalLink className="inline size-3 text-muted-foreground" /></a>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{n.source} · {ist(n.time)} · impact {n.impact}/5{n.keywords.length ? ` · ${n.keywords.slice(0, 4).join(', ')}` : ''}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[10px] text-muted-foreground">Source: Google News (Reuters, Bloomberg, Kitco, Mining.com and others as indexed). Bloomberg and SMM pages are not scraped directly.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Prediction and equity read-through ──────────────────────────── */}
          <Prediction c={c} />
          <EquityReadThrough c={c} />
        </>)}

        {feed && (
          <footer className="text-[11px] text-muted-foreground space-y-1">
            <p><b>Sources.</b> Prices: COMEX via Yahoo Finance (gold, silver), LME official cash via westmetall.com (aluminium, zinc). LME 3-month and stocks: westmetall.com.
              Macro: US Treasury (10Y and real yield), BLS (CPI), Yahoo Finance (DXY, USD/INR). Positioning: CFTC COT. ETF holdings: iShares IAU/SLV. News: Google News.</p>
            {failing.length > 0 && <p className="text-amber-700">Last update had issues with: {failing.map(([k]) => k).join(', ')}.</p>}
          </footer>
        )}
      </div>
    </div>
  );
}
