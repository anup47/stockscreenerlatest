'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conviction, STRONG, type ScreenRow, type ScreenerFile } from '@/lib/big-player';

type Side = 'buy' | 'sell';
type LensKey = 'conviction' | 'last' | 'avg3' | 'avg5' | 'avg10' | 'streak' | 'days10';

// Each lens is one reading of "big players keep buying"; thresholds sit where the market's top 1–5% start
// (a 5-day average of +2 is reached by about 2 of 1,700 stocks, so +5 cut-offs would leave empty lists).
const LENSES: Record<LensKey, { label: string; hint: string; steps: number[]; def: number; get: (r: ScreenRow, side: Side) => number }> = {
  conviction: { label: 'Conviction', hint: '5-day average + persistence over 10 days + rule-based big-player days + named bulk/block deals', steps: [1, 2, 3, 4], def: 2, get: (r, s) => (s === 'buy' ? 1 : -1) * conviction(r) },
  last:       { label: 'Last day',   hint: 'score on the latest session', steps: [2, 3, 4, 5], def: 3, get: (r, s) => (s === 'buy' ? 1 : -1) * r.sc.at(-1)! },
  avg3:       { label: '3-day avg',  hint: 'average score, last 3 sessions', steps: [1, 1.5, 2, 3], def: 1.5, get: (r, s) => (s === 'buy' ? 1 : -1) * r.avg3 },
  avg5:       { label: '5-day avg',  hint: 'average score, last 5 sessions', steps: [0.6, 0.8, 1, 1.5], def: 0.8, get: (r, s) => (s === 'buy' ? 1 : -1) * r.avg5 },
  avg10:      { label: '10-day avg', hint: 'average score, last 10 sessions', steps: [0.4, 0.6, 0.8, 1], def: 0.6, get: (r, s) => (s === 'buy' ? 1 : -1) * r.avg10 },
  streak:     { label: 'Streak',     hint: `consecutive latest sessions scoring ±${STRONG} or more in the chosen direction`, steps: [1, 2, 3, 4], def: 2, get: (r, s) => (s === 'buy' ? 1 : -1) * r.streak },
  days10:     { label: 'Strong days', hint: `sessions in the last 10 scoring ${STRONG} or more in the chosen direction`, steps: [2, 3, 4, 5], def: 3, get: (r, s) => (s === 'buy' ? r.acc10 : r.dist10) },
};
const TURNOVER = [1, 5, 25, 100];

const sgn = (v: number | null, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);
const tone = (v: number | null) => (v == null || v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-emerald-700' : 'text-red-700');

function Spark({ sc }: { sc: number[] }) {
  return (
    <svg viewBox={`0 0 ${sc.length * 4} 22`} className="h-5 w-20 shrink-0" aria-label={`Last ${sc.length} daily scores: ${sc.join(', ')}`}>
      <line x1="0" x2={sc.length * 4} y1="11" y2="11" stroke="#e2e8f0" strokeWidth="0.5" />
      {sc.map((v, i) => v !== 0 && (
        <rect key={i} x={i * 4 + 0.5} width="3" y={v > 0 ? 11 - v * 2 : 11} height={Math.abs(v) * 2} fill={v > 0 ? '#16a34a' : '#dc2626'} opacity={Math.abs(v) >= STRONG ? 1 : 0.45} />
      ))}
    </svg>
  );
}

export default function Screener({ onPick }: { onPick: (symbol: string) => void }) {
  const [file, setFile] = useState<ScreenerFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('buy');
  const [lens, setLens] = useState<LensKey>('conviction');
  const [min, setMin] = useState(LENSES.conviction.def);
  const [turnover, setTurnover] = useState(5);
  const [sme, setSme] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/big-player?screener=1').then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setFile(j); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load the screener'));
  }, []);

  const pickLens = (k: LensKey) => { setLens(k); setMin(LENSES[k].def); setShowAll(false); };
  const L = LENSES[lens];
  const list = useMemo(() => (file?.rows ?? [])
    .filter(r => r.to >= turnover && (sme || !r.sme) && L.get(r, side) >= min)
    .sort((a, b) => L.get(b, side) - L.get(a, side) || LENSES.conviction.get(b, side) - LENSES.conviction.get(a, side) || b.to - a.to),
  [file, side, L, min, turnover, sme]);
  const shown = showAll ? list : list.slice(0, 50);

  const downloadCsv = () => {
    const head = ['Symbol', 'Company', 'Close', '1D %', '5D %', '20D %', 'Conviction', 'Last day score', '3D avg', '5D avg', '10D avg', 'Streak', 'Strong buy days (10)', 'Strong sell days (10)', 'Big buy days (20)', 'Big sell days (20)', 'Delivery 5D %', 'Delivery prior %', 'Turnover Rs Cr/day', 'Net deals 5D Rs Cr', 'Latest verdict', 'Scores (20 days)'];
    const lines = list.map(r => [r.s, `"${r.n.replace(/"/g, '""')}"`, r.c, r.ch1, r.ch5, r.ch20, conviction(r), r.sc.at(-1), r.avg3, r.avg5, r.avg10, r.streak, r.acc10, r.dist10, r.bigBuy, r.bigSell, r.dl5, r.dl20, r.to, r.deal5, r.v, r.sc.join(' ')].join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `big-player-${side === 'buy' ? 'buying' : 'selling'}-${lens}-${file?.asOf}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  if (error) return <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">{error}</div>;
  if (!file) return <div className="h-64 rounded-xl border border-border bg-muted/40 animate-pulse" />;

  // The 3/5/10-day averages share one column; 5D/20D price change only shows on very wide screens.
  const cols: { keys: LensKey[]; label: string; wide?: boolean }[] = [
    { keys: [], label: 'Stock' }, { keys: [], label: 'Close' }, { keys: [], label: '5D / 20D', wide: true }, { keys: [], label: 'Last 20 days' },
    { keys: ['conviction'], label: 'Conviction' }, { keys: ['last'], label: 'Last day' }, { keys: ['avg3', 'avg5', 'avg10'], label: 'Avg 3D · 5D · 10D' },
    { keys: ['streak'], label: 'Streak' }, { keys: ['days10'], label: 'Strong 10D' }, { keys: [], label: 'Big 20D' }, { keys: [], label: 'Deliv 5D' }, { keys: [], label: '₹ Cr/day' }, { keys: [], label: 'Deals 5D' },
  ];
  const hl = (...k: LensKey[]) => (k.includes(lens) ? (side === 'buy' ? 'bg-emerald-50' : 'bg-red-50') : '');
  const avgCell = (k: LensKey, v: number) => <span className={cn(tone(v), lens === k && 'font-bold underline underline-offset-2')}>{sgn(v, 2)}</span>;

  return (
    <div className="space-y-4">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="Direction">
            <button onClick={() => setSide('buy')} className={cn('h-9 px-3 flex items-center gap-1.5 text-sm font-medium', side === 'buy' ? 'bg-emerald-600 text-white' : 'hover:bg-muted')}><TrendingUp className="size-4" /> Big players buying</button>
            <button onClick={() => setSide('sell')} className={cn('h-9 px-3 flex items-center gap-1.5 text-sm font-medium', side === 'sell' ? 'bg-red-600 text-white' : 'hover:bg-muted')}><TrendingDown className="size-4" /> Big players selling</button>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">NSE data through {new Date(`${file.asOf}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {file.rows.length.toLocaleString('en-IN')} stocks scored</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground w-16">Rank by</span>
          {(Object.keys(LENSES) as LensKey[]).map(k => (
            <button key={k} onClick={() => pickLens(k)} title={LENSES[k].hint}
              className={cn('h-8 rounded-md border px-2.5 text-xs font-medium', lens === k ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted')}>{LENSES[k].label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground w-16">At least</span>
            {L.steps.map(v => (
              <button key={v} onClick={() => { setMin(v); setShowAll(false); }}
                className={cn('h-8 min-w-11 rounded-md border px-2 text-xs font-semibold tabular-nums', min === v ? (side === 'buy' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-red-600 bg-red-600 text-white') : 'border-border hover:bg-muted')}>
                {lens === 'days10' ? `${v} days` : lens === 'streak' ? `${v}d` : `${side === 'buy' ? '+' : '−'}${v}`}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Turnover</span>
            {TURNOVER.map(t => (
              <button key={t} onClick={() => setTurnover(t)} className={cn('h-8 rounded-md border px-2 text-xs font-medium', turnover === t ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted')}>≥ ₹{t} Cr</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={sme} onChange={() => setSme(x => !x)} className="accent-emerald-600" /> Include SME stocks
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{L.label}: {L.hint}. Click any stock for its day-by-day breakdown.</p>
      </section>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {list.length} stock{list.length === 1 ? '' : 's'} {side === 'buy' ? 'being bought' : 'being sold'} by big players
            <span className="font-normal text-muted-foreground"> · {L.label} {lens === 'days10' ? `≥ ${min} days` : lens === 'streak' ? `≥ ${min} days` : `${side === 'buy' ? '≥ +' : '≤ −'}${min}`}, turnover ≥ ₹{turnover} Cr/day</span>
          </h3>
          <button onClick={downloadCsv} disabled={!list.length} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted disabled:opacity-40"><Download className="size-3" /> Download CSV</button>
        </div>
        {list.length === 0 && <p className="px-4 pb-6 pt-2 text-sm text-muted-foreground">No stocks clear this bar. Lower the threshold or the turnover filter.</p>}
        {list.length > 0 && (<>
          <div className="hidden xl:block">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border bg-muted/30">
                <tr>{cols.map((c, i) => <th key={c.label} className={cn('px-1.5 py-2 font-semibold whitespace-nowrap', i === 0 ? 'text-left' : 'text-right', hl(...c.keys), c.wide && 'hidden 2xl:table-cell')}>{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {shown.map(r => (
                  <tr key={r.s} onClick={() => onPick(r.s)} className="cursor-pointer hover:bg-muted/40">
                    <td className="px-1.5 py-1.5 max-w-[180px]"><div className="font-semibold text-sm">{r.s}{r.sme && <span className="ml-1 text-[9px] text-muted-foreground">SME</span>}</div><div className="truncate text-[11px] text-muted-foreground">{r.n}</div></td>
                    <td className="px-1.5 py-1.5 text-right tabular-nums">{r.c.toLocaleString('en-IN')}<div className={cn('text-[11px]', tone(r.ch1))}>{sgn(r.ch1, 2)}%</div></td>
                    <td className="hidden 2xl:table-cell px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap"><span className={tone(r.ch5)}>{sgn(r.ch5)}%</span> / <span className={tone(r.ch20)}>{sgn(r.ch20)}%</span></td>
                    <td className="px-1.5 py-1.5"><div className="flex justify-end"><Spark sc={r.sc} /></div></td>
                    <td className={cn('px-1.5 py-1.5 text-right tabular-nums font-bold', tone(conviction(r)), hl('conviction'))}>{sgn(conviction(r))}</td>
                    <td className={cn('px-1.5 py-1.5 text-right tabular-nums font-semibold', tone(r.sc.at(-1)!), hl('last'))}>{sgn(r.sc.at(-1)!, 0)}</td>
                    <td className={cn('px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap', hl('avg3', 'avg5', 'avg10'))}>{avgCell('avg3', r.avg3)} · {avgCell('avg5', r.avg5)} · {avgCell('avg10', r.avg10)}</td>
                    <td className={cn('px-1.5 py-1.5 text-right tabular-nums', tone(r.streak), hl('streak'))}>{r.streak ? `${Math.abs(r.streak)}d ${r.streak > 0 ? '▲' : '▼'}` : '—'}</td>
                    <td className={cn('px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap', hl('days10'))}><span className="text-emerald-700">{r.acc10}▲</span> <span className="text-red-700">{r.dist10}▼</span></td>
                    <td className="px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">{r.bigBuy || r.bigSell ? <><span className="text-emerald-700">{r.bigBuy}▲</span> <span className="text-red-700">{r.bigSell}▼</span></> : '—'}</td>
                    <td className="px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">{r.dl5 == null ? '—' : `${r.dl5.toFixed(0)}%`}{r.dl5 != null && r.dl20 != null && <span className={cn('ml-1 text-[11px]', tone(r.dl5 - r.dl20))}>{sgn(r.dl5 - r.dl20, 0)}</span>}</td>
                    <td className="px-1.5 py-1.5 text-right tabular-nums">{r.to >= 100 ? r.to.toFixed(0) : r.to.toFixed(1)}</td>
                    <td className={cn('px-1.5 py-1.5 text-right tabular-nums', tone(r.deal5))}>{r.deal5 ? sgn(r.deal5, Math.abs(r.deal5) >= 100 ? 0 : 1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones and tablets: one card per stock. */}
          <ul className="xl:hidden divide-y divide-border/60 border-t border-border">
            {shown.map(r => (
              <li key={r.s}>
                <button onClick={() => onPick(r.s)} className="w-full px-4 py-3 text-left hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="font-semibold text-sm">{r.s}{r.sme && <span className="ml-1 text-[9px] text-muted-foreground">SME</span>}</div><div className="truncate text-[11px] text-muted-foreground">{r.n}</div></div>
                    <div className="text-right shrink-0"><div className={cn('text-base font-bold tabular-nums', side === 'buy' ? 'text-emerald-700' : 'text-red-700')}>{lens === 'days10' || lens === 'streak' ? `${L.get(r, side)} days` : sgn(L.get(r, 'buy'), lens === 'last' ? 0 : 2)}</div><div className="text-[10px] text-muted-foreground">{L.label}</div></div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <Spark sc={r.sc} />
                    <span className="text-xs tabular-nums">{r.c.toLocaleString('en-IN')} <span className={tone(r.ch1)}>{sgn(r.ch1, 2)}%</span> · 5D <span className={tone(r.ch5)}>{sgn(r.ch5)}%</span></span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                    <span>Conv <b className={tone(conviction(r))}>{sgn(conviction(r))}</b></span>
                    <span>5D avg <b className={tone(r.avg5)}>{sgn(r.avg5, 2)}</b></span>
                    <span>Strong <b className="text-emerald-700">{r.acc10}▲</b> <b className="text-red-700">{r.dist10}▼</b></span>
                    <span>Deliv <b className="text-foreground">{r.dl5 == null ? '—' : `${r.dl5.toFixed(0)}%`}</b></span>
                    <span>₹{r.to >= 100 ? r.to.toFixed(0) : r.to.toFixed(1)} Cr/d</span>
                    <span>Deals <b className={tone(r.deal5)}>{r.deal5 ? sgn(r.deal5, 0) : '—'}</b></span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {list.length > 50 && !showAll && (
            <button onClick={() => setShowAll(true)} className="w-full border-t border-border py-2.5 text-xs font-medium text-emerald-700 hover:bg-muted/40">Show all {list.length}</button>
          )}
        </>)}
      </section>

      <p className="text-[11px] text-muted-foreground">
        <b>How to read it.</b> Each stock gets a daily score from −5 to +5 (see the stock view for the rules). A day scoring {STRONG} or more counts as a strong buying day, −{STRONG} or less as a strong selling day.
        Conviction = 5-day average + ½ × (strong buying days − strong selling days in the last 10) + (big-player bought days − sold days in the last 20) + up to ±1 for net named bulk/block deals over the last 5 sessions (full point at ₹10 Cr).
        Bars in &ldquo;Last 20 days&rdquo; show each day&apos;s score, solid when strong. Delivery 5D shows the average with the change against the 20 sessions before.
        Buy/sell split here uses the candle proxy for every stock; ETFs, REITs and stocks trading under ₹{file.minTurnoverCr} Cr a day are left out.
      </p>
    </div>
  );
}
