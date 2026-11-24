'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AiDcData, LayerStat, Read, StockStat } from '@/lib/ai-dc';

const READ_STYLE: Record<Read, { pill: string; bar: string; label: string }> = {
  tailwind: { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', label: 'Tailwind' },
  mixed:    { pill: 'bg-amber-50 text-amber-700 border-amber-200',       bar: 'bg-amber-400',   label: 'Mixed' },
  headwind: { pill: 'bg-red-50 text-red-700 border-red-200',             bar: 'bg-red-500',     label: 'Headwind' },
};
const STATUS_STYLE = {
  leading:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'in line': 'bg-slate-50 text-slate-600 border-slate-200',
  lagging:   'bg-red-50 text-red-700 border-red-200',
} as const;
const TREND = {
  up:    { label: 'Uptrend',   cls: 'text-emerald-700' },
  down:  { label: 'Downtrend', cls: 'text-red-700' },
  mixed: { label: 'Mixed',     cls: 'text-amber-700' },
} as const;

const sg = (v: number | null, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
const tone = (v: number | null) => (v == null || v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-emerald-700' : 'text-red-700');
const money = (s: Pick<StockStat, 'currency' | 'price'>) =>
  s.currency === 'INR'
    ? `₹${s.price.toLocaleString('en-IN', { maximumFractionDigits: s.price >= 1000 ? 0 : 1 })}`
    : `$${s.price.toFixed(2)}`;

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap', cls)}>{children}</span>;
}

function Card({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ── Pulse ────────────────────────────────────────────────────────────────────

function Pulse({ d }: { d: AiDcData }) {
  const n = (r: Read) => d.pulse.filter(p => p.read === r).length;
  const [tail, mixed, head] = [n('tailwind'), n('mixed'), n('headwind')];
  const verdict: Read = tail >= 4 ? 'tailwind' : head >= 4 ? 'headwind' : 'mixed';
  const verdictText = { tailwind: 'Mostly tailwinds', mixed: 'Mixed — pick layers, not the whole theme', headwind: 'Mostly headwinds — be selective, size small' }[verdict];
  return (
    <Card
      title="Is the AI trade in favour right now?"
      aside={<span className="text-[11px] text-muted-foreground">{tail} tailwind · {mixed} mixed · {head} headwind</span>}
    >
      <div className={cn('mb-3 rounded-lg border px-3 py-2 text-sm font-semibold', READ_STYLE[verdict].pill)}>{verdictText}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {d.pulse.map(p => (
          <div key={p.key} className="rounded-lg border border-border bg-background p-3 flex gap-3">
            <span className={cn('w-1 shrink-0 rounded-full', READ_STYLE[p.read].bar)} />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-foreground">{p.label}</span>
                <Pill cls={READ_STYLE[p.read].pill}>{READ_STYLE[p.read].label}</Pill>
              </div>
              <p className="text-xs tabular-nums text-foreground">{p.value}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">{p.note}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Anthropic IPO ────────────────────────────────────────────────────────────

const IPO_SOURCES = [
  ['Wikipedia', 'https://en.wikipedia.org/wiki/Initial_public_offering_of_Anthropic'],
  ['StockTitan', 'https://www.stocktitan.net/articles/anthropic-ipo-live-ant-first-trading-day-2026'],
  ['Bloomberg', 'https://www.bloomberg.com/news/articles/2026-10-01/anthropic-said-to-target-mega-ipo-before-thanksgiving-holiday'],
] as const;

const IPO_POINTS: [string, string][] = [
  ['A daily price on a frontier AI lab', 'AI model makers were only valued in private rounds until now. A strong or weak ANT now feeds sentiment across all AI stocks.'],
  ['Fresh cash for compute', 'Most of the money goes on chips and data-centre capacity through Anthropic\'s compute deals with Google (TPUs), Amazon (Trainium) and Microsoft Azure — demand that flows down the chain below.'],
  ['Big backers mark gains', 'Amazon and Alphabet are major shareholders, so ANT\'s price feeds into their reported earnings.'],
  ['New supply of AI stock', 'A raise of about $81B (as reported) can pull money from other AI names in the short run. The next supply event is the lock-up expiry — typically about 180 days after listing; check the prospectus.'],
];

function AnthropicCard({ a }: { a: NonNullable<AiDcData['anthropic']> }) {
  return (
    <Card title="Key event · Anthropic IPO" aside={<span className="text-[11px] text-muted-foreground">Nasdaq: ANT · listed 19 Nov 2026</span>}>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-1 mb-3">
        <span className="text-3xl font-black tabular-nums text-foreground">${a.price.toFixed(2)}</span>
        <span className={cn('text-sm font-semibold tabular-nums', tone(a.vsIpo))}>{sg(a.vsIpo)} vs ${a.ipoPrice} IPO price</span>
        {a.high != null && a.low != null && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {a.sessions === 1 ? 'First-day range' : `Range over ${a.sessions} sessions`} ${a.low.toFixed(2)}–${a.high.toFixed(2)}
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {IPO_POINTS.map(([h, b]) => (
          <li key={h} className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{h}. </span>{b}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">For Indian stocks: </span>
        no direct listed exposure. The effect comes through global AI sentiment, compute demand reaching data-centre, power and grid stocks,
        and enterprise AI adoption at Indian IT firms — both new work and pricing pressure.
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">
        IPO price and size as reported:{' '}
        {IPO_SOURCES.map(([n, u], i) => (
          <span key={n}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer" className="underline hover:text-foreground">{n}</a></span>
        ))}. Live price from Yahoo Finance.
      </p>
    </Card>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

function Leaderboard({ layers, nifty3m, onPick }: { layers: LayerStat[]; nifty3m: number | null; onPick: (k: string) => void }) {
  const rows = layers.filter(l => l.india && l.vsBench3m != null).sort((a, b) => b.vsBench3m! - a.vsBench3m!);
  const max = Math.max(10, ...rows.map(r => Math.abs(r.vsBench3m!)));
  return (
    <Card title="Which Indian layers are leading?" aside={<span className="text-[11px] text-muted-foreground">Median 3M return vs Nifty 50 ({sg(nifty3m)})</span>}>
      <div className="space-y-1.5">
        {rows.map(l => {
          const v = l.vsBench3m!, w = `${(Math.abs(v) / max) * 50}%`;
          return (
            <button key={l.key} onClick={() => onPick(l.key)} className="w-full grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] sm:grid-cols-[minmax(0,13rem)_1fr_3.5rem] items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/50">
              <span className="truncate text-xs text-foreground">{l.title}</span>
              <span className="relative h-3 rounded bg-muted">
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <span className={cn('absolute inset-y-0 rounded', v >= 0 ? 'left-1/2 bg-emerald-500' : 'right-1/2 bg-red-500')} style={{ width: w }} />
              </span>
              <span className={cn('text-right text-xs font-semibold tabular-nums', tone(v))}>{v > 0 ? '+' : ''}{v.toFixed(1)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Percentage points ahead of or behind Nifty over 3 months. Tap a layer to open it below.</p>
    </Card>
  );
}

// ── Pullbacks ────────────────────────────────────────────────────────────────

function Pullbacks({ layers }: { layers: LayerStat[] }) {
  const picks = layers.filter(l => l.india)
    .flatMap(l => l.stocks.filter(s => s.pullback).map(s => ({ ...s, layer: l.title })))
    .sort((a, b) => (b.chg3m ?? -999) - (a.chg3m ?? -999));
  return (
    <Card title="Watchlist · pullbacks in uptrends" aside={<span className="text-[11px] text-muted-foreground">{picks.length} Indian stocks</span>}>
      <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
        In an uptrend (price above its 50-day average, which is above the 200-day) but 5–15% below the 52-week high — the usual place to look
        for an entry in a trend. A starting list, not a buy signal: check order books and valuation first.
      </p>
      {picks.length === 0
        ? <p className="text-xs text-muted-foreground">No AI-chain stock fits right now — uptrends are either near their highs or broken.</p>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {picks.map(s => (
              <div key={s.symbol} className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{s.symbol}</span>
                  <span className="text-xs tabular-nums text-foreground">{money(s)}</span>
                </div>
                <p className="truncate text-[10px] text-muted-foreground">{s.layer}</p>
                <p className="mt-1 text-[11px] tabular-nums">
                  <span className="text-red-700">{sg(s.offHigh)} from high</span>
                  <span className="text-muted-foreground"> · 3M </span><span className={tone(s.chg3m)}>{sg(s.chg3m)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
    </Card>
  );
}

// ── Value chain ──────────────────────────────────────────────────────────────

function StockTable({ stocks }: { stocks: StockStat[] }) {
  const th = 'px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap';
  const td = 'px-2 py-2 tabular-nums whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border bg-muted/50">
          <th className={th}>Stock</th>
          <th className={cn(th, 'text-right')}>Price</th>
          <th className={cn(th, 'text-right hidden md:table-cell')}>1D</th>
          <th className={cn(th, 'text-right hidden sm:table-cell')}>1M</th>
          <th className={cn(th, 'text-right')}>3M</th>
          <th className={cn(th, 'text-right hidden md:table-cell')}>1Y</th>
          <th className={cn(th, 'text-right')}>From high</th>
          <th className={th}>Trend</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {stocks.map(s => (
          <tr key={s.symbol} className="align-top hover:bg-muted/30">
            <td className="px-2 py-2">
              <div className="font-semibold text-foreground">{s.symbol} <span className="font-normal text-muted-foreground">{s.name}</span></div>
              <div className="text-[10px] leading-snug text-muted-foreground max-w-[22rem] whitespace-normal">{s.role}</div>
            </td>
            <td className={cn(td, 'text-right text-foreground')}>{money(s)}</td>
            <td className={cn(td, 'text-right hidden md:table-cell', tone(s.chg1d))}>{sg(s.chg1d)}</td>
            <td className={cn(td, 'text-right hidden sm:table-cell', tone(s.chg1m))}>{sg(s.chg1m)}</td>
            <td className={cn(td, 'text-right font-semibold', tone(s.chg3m))}>{sg(s.chg3m)}</td>
            <td className={cn(td, 'text-right hidden md:table-cell', tone(s.chg1y))}>{sg(s.chg1y)}</td>
            <td className={cn(td, 'text-right', s.offHigh != null && s.offHigh > -5 ? 'text-emerald-700' : 'text-muted-foreground')}>{s.offHigh == null ? '—' : `${s.offHigh.toFixed(1)}%`}</td>
            <td className={td}>
              {s.trend ? <span className={cn('font-medium', TREND[s.trend].cls)}>{TREND[s.trend].label}</span> : <span className="text-muted-foreground">New</span>}
              {s.pullback && <div className="text-[10px] text-blue-700">pullback</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function LayerCard({ l, index, open, onToggle }: { l: LayerStat; index: number; open: boolean; onToggle: () => void }) {
  return (
    <div id={`layer-${l.key}`} className="rounded-xl border border-border bg-card scroll-mt-4">
      <button onClick={onToggle} className="w-full flex items-start gap-3 p-4 text-left" aria-expanded={open}>
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">{index}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{l.title}</span>
            <Pill cls="bg-background text-muted-foreground border-border">{l.india ? 'India' : 'Global'} · {l.link}</Pill>
            {l.status && <Pill cls={STATUS_STYLE[l.status]}>{l.status}</Pill>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
            <span>3M median <b className={tone(l.median3m)}>{sg(l.median3m)}</b></span>
            <span>vs {l.india ? 'Nifty' : 'Nasdaq 100'} <b className={tone(l.vsBench3m)}>{l.vsBench3m == null ? '—' : `${l.vsBench3m > 0 ? '+' : ''}${l.vsBench3m.toFixed(1)} pts`}</b></span>
            {l.breadth != null && <span><b className="text-foreground">{l.breadth}%</b> in uptrend</span>}
            <span>{l.stocks.length} stocks</span>
          </div>
        </div>
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs leading-relaxed">
            <p className="rounded-lg bg-emerald-50/60 px-3 py-2 text-muted-foreground"><span className="font-semibold text-emerald-800">Why it benefits: </span>{l.why}</p>
            <p className="rounded-lg bg-amber-50/60 px-3 py-2 text-muted-foreground"><span className="font-semibold text-amber-800">What to watch: </span>{l.watch}</p>
          </div>
          <StockTable stocks={l.stocks} />
        </div>
      )}
    </div>
  );
}

const FLOW = ['Hyperscalers & AI labs', 'Chips', 'Data centres', 'Power & grid', 'Cables · cooling · fibre', 'Servers & IT services'];

// ── Section ──────────────────────────────────────────────────────────────────

export default function AiDcLive() {
  const [d, setD] = useState<AiDcData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/ai-dc')
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j as AiDcData; })
      .then(setD)
      .catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  // Open the leading Indian layer by default so the page lands on something actionable.
  useEffect(() => {
    if (!d) return;
    const top = d.layers.filter(l => l.india && l.vsBench3m != null).sort((a, b) => b.vsBench3m! - a.vsBench3m!)[0];
    if (top) setOpen(new Set([top.key]));
  }, [d]);

  const updated = useMemo(() => d && new Date(d.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [d]);
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pick = (k: string) => { setOpen(s => new Set(s).add(k)); setTimeout(() => document.getElementById(`layer-${k}`)?.scrollIntoView({ behavior: 'smooth' }), 0); };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">AI &amp; Data Centres</h1>
        <p className="text-sm text-muted-foreground">
          Follow the money from AI spending to Indian stocks. Live prices, refreshed every 15 minutes{updated && <> · updated {updated} IST</>}.
        </p>
      </header>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">Live data unavailable: {err}</div>}
      {!d && !err && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-xs text-muted-foreground">
          <RefreshCw className="size-3.5 animate-spin" /> Loading live prices for ~70 stocks…
        </div>
      )}

      {d && (
        <>
          <Pulse d={d} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {d.anthropic && <AnthropicCard a={d.anthropic} />}
            <Leaderboard layers={d.layers} nifty3m={d.bench.nifty3m} onPick={pick} />
          </div>
          <Pullbacks layers={d.layers} />

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">The value chain — follow the money</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {FLOW.map((f, i) => (
                    <span key={f} className="flex items-center gap-1.5">
                      {i > 0 && <span aria-hidden>→</span>}
                      <span className="rounded-full border border-border bg-card px-2 py-0.5">{f}</span>
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setOpen(open.size === d.layers.length ? new Set() : new Set(d.layers.map(l => l.key)))}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                {open.size === d.layers.length ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
            {d.layers.map((l, i) => <LayerCard key={l.key} l={l} index={i + 1} open={open.has(l.key)} onToggle={() => toggle(l.key)} />)}
          </section>

          <Card title="How to read this">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                ['Trend', 'Uptrend = price above its 50-day average, which is above the 200-day. Downtrend is the reverse; anything else is mixed.'],
                ['From high', 'How far below the 52-week high. Green when within 5% — the stock is at or near highs.'],
                ['vs Nifty / Nasdaq 100', 'Median 3-month return of the layer minus the index. +5 pts or more = leading; −5 or worse = lagging.'],
                ['In uptrend', 'Share of the layer\'s stocks in an uptrend. Broad participation is healthier than one stock carrying the group.'],
              ].map(([k, v]) => (
                <div key={k}><dt className="font-semibold text-foreground">{k}</dt><dd className="text-muted-foreground leading-snug">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Prices from Yahoo Finance; GPU rents from GetDeploying (CC BY 4.0). Momentum and trend describe the past, not the future — this is a research map, not investment advice.
              {d.failed.length > 0 && <> No data this refresh for: {d.failed.join(', ')}.</>}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
