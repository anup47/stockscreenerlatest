'use client';

import { useState, useCallback } from 'react';
import type { StockResult } from '@/lib/indicators';

interface ApiResponse {
  results: StockResult[];
  timestamp: string;
  scanned: number;
  universeSize: number;
  elapsedMs: number;
}

type SortKey = keyof StockResult;

// ── Score helpers ─────────────────────────────────────────────────────────────

// Max score = 12 (Base 3 + Volume 3 + Momentum 2 + Patterns 4)
function scoreColor(score: number) {
  if (score >= 8) return 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40';
  if (score >= 5) return 'bg-amber-500/20  text-amber-300  ring-amber-500/40';
  return               'bg-slate-500/20  text-slate-400  ring-slate-500/30';
}

function scoreLabel(score: number) {
  if (score >= 8) return 'HIGH';
  if (score >= 5) return 'MED';
  return 'LOW';
}

// ── Badge definitions ─────────────────────────────────────────────────────────

const PATTERN_BADGES: Record<string, { label: string; color: string; title: string }> = {
  vcp:          { label: 'VCP',   color: 'bg-violet-500/20 text-violet-300 ring-violet-500/30', title: 'Volatility Contraction Pattern — 3+ successively tighter pullbacks with higher lows' },
  tightSqueeze: { label: 'SQZ5',  color: 'bg-sky-500/20    text-sky-300    ring-sky-500/30',    title: 'Tight BB Squeeze — width < 5% AND price within 1.5% of 20 SMA' },
  instSpike:    { label: 'INST',  color: 'bg-amber-500/20  text-amber-300  ring-amber-500/30',  title: 'Institutional Absorption Spike — vol dry-up followed by 4x+ spike on a small candle' },
  longBase:     { label: 'BASE',  color: 'bg-rose-500/20   text-rose-300   ring-rose-500/30',   title: 'Long Base Breakout — 6+ months flat range, now breaking out on elevated volume' },
  bbSqueeze:    { label: 'SQZ',   color: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30', title: 'BB Squeeze — Bollinger Band width < 8%' },
  volDryup:     { label: 'DRY',   color: 'bg-teal-500/20   text-teal-300   ring-teal-500/30',   title: 'Volume Dry-Up — 10-day avg volume < 60% of 50-day avg' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${scoreColor(score)}`}>
      <span>{score}/12</span>
      <span className="text-[9px] opacity-70">{scoreLabel(score)}</span>
    </span>
  );
}

function PatternBadge({ flag, type }: { flag: boolean; type: keyof typeof PATTERN_BADGES }) {
  if (!flag) return null;
  const b = PATTERN_BADGES[type];
  return (
    <span title={b.title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 cursor-help ${b.color}`}>
      {b.label}
    </span>
  );
}

function Num({ val, decimals = 2 }: { val: number | null; decimals?: number }) {
  if (val == null) return <span className="text-slate-600">—</span>;
  return <>{val.toFixed(decimals)}</>;
}

function RSNum({ val }: { val: number | null }) {
  if (val == null) return <span className="text-slate-600">—</span>;
  return (
    <span className={val > 0 ? 'text-emerald-400' : 'text-red-400'}>
      {val > 0 ? '+' : ''}{val.toFixed(1)}%
    </span>
  );
}

function TradeCard({ t }: { t: import('@/lib/indicators').TradeSetup }) {
  const actionStyle =
    t.action === 'BUY'   ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40' :
    t.action === 'WATCH' ? 'bg-amber-500/20   text-amber-300   ring-amber-500/40'   :
                           'bg-slate-500/20   text-slate-400   ring-slate-500/30';

  const ind = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-1.5 min-w-[210px]">
      {/* Row 1: action badge + entry note */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ring-1 ${actionStyle}`}>
          {t.action}
        </span>
        <span className="text-[10px] text-slate-500 leading-tight">{t.entryNote}</span>
      </div>
      {/* Row 2: Entry + Stop Loss */}
      <div className="flex items-center gap-3 text-[11px]">
        <div>
          <span className="text-slate-600 mr-1">Entry</span>
          <span className="text-slate-200 font-mono font-semibold">Rs.{ind(t.entryLevel)}</span>
        </div>
        <div>
          <span className="text-slate-600 mr-1">SL</span>
          <span className="text-red-400 font-mono">Rs.{ind(t.stopLoss)}</span>
          <span className="text-red-600 ml-1 text-[10px]">-{t.riskPct}%</span>
        </div>
      </div>
      {/* Row 3: Targets */}
      <div className="flex items-center gap-3 text-[11px]">
        <div>
          <span className="text-slate-600 mr-1">T1</span>
          <span className="text-emerald-400 font-mono">Rs.{ind(t.target1)}</span>
          <span className="text-emerald-700 ml-1 text-[10px]">+{t.t1Pct}%</span>
        </div>
        <div>
          <span className="text-slate-600 mr-1">T2</span>
          <span className="text-emerald-300 font-mono">Rs.{ind(t.target2)}</span>
          <span className="text-emerald-600 ml-1 text-[10px]">+{t.t2Pct}%</span>
        </div>
        <span className="text-slate-700 text-[10px] ml-auto">R:R&nbsp;1:3</span>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-800">
          {Array.from({ length: 12 }).map((_, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3 rounded bg-slate-800 shimmer" style={{ width: `${45 + (i * j * 7) % 45}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Pattern legend data ───────────────────────────────────────────────────────

const PATTERNS = [
  {
    name: 'Coiled Spring',
    badge: 'SQZ + DRY',
    badgeColor: 'text-emerald-300',
    desc: 'Stage 2 uptrend (Price > SMA50 > SMA150 > SMA200) + BB squeeze + volume dry-up + RS vs Nifty > 0 + RSI 50–68. The base pattern. Spring compressed, about to release.',
    pts: '0–8 pts',
    color: 'border-emerald-800',
  },
  {
    name: 'BB Squeeze',
    badge: 'SQZ / SQZ5',
    badgeColor: 'text-sky-300',
    desc: 'Bands tighten as volatility collapses. SQZ = width < 8%. SQZ5 = ultra-tight < 5% with price hugging the middle band. When bands expand, the move starts.',
    pts: '+1 (SQZ5)',
    color: 'border-sky-800',
  },
  {
    name: 'VCP',
    badge: 'VCP',
    badgeColor: 'text-violet-300',
    desc: 'Volatility Contraction Pattern (Minervini). 3+ pullbacks each smaller than the last (≥30% contraction), with higher lows. Volume dries up on each leg. Entry on first expansion with 3x+ volume.',
    pts: '+1',
    color: 'border-violet-800',
  },
  {
    name: 'Institutional Spike',
    badge: 'INST',
    badgeColor: 'text-amber-300',
    desc: '4–8 weeks of silent accumulation (volume 40–60% below normal), then one day with 4–10x spike volume on a SMALL price candle (< 4% range). Institutions absorbing supply without moving price.',
    pts: '+1',
    color: 'border-amber-800',
  },
  {
    name: 'Long Base Breakout',
    badge: 'BASE',
    badgeColor: 'text-rose-300',
    desc: 'Stock flat for 6+ months in a tight range (< 30% from low to high). Now near the top of that range and breaking out on elevated volume. "The bigger the base, the bigger the case."',
    pts: '+1',
    color: 'border-rose-800',
  },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch]   = useState('');
  const [patFilter, setPatFilter] = useState<string>('all');

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/screen');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const filtered = data
    ? data.results.filter(r => {
        const matchSearch =
          !search ||
          r.symbol.toLowerCase().includes(search.toLowerCase()) ||
          r.company.toLowerCase().includes(search.toLowerCase());
        const matchPat =
          patFilter === 'all' ||
          (patFilter === 'vcp'    && r.vcp)         ||
          (patFilter === 'sqz5'   && r.tightSqueeze) ||
          (patFilter === 'inst'   && r.instSpike)    ||
          (patFilter === 'base'   && r.longBase)     ||
          (patFilter === 'sqz'    && r.bbSqueeze)    ||
          (patFilter === 'dry'    && r.volDryup);
        return matchSearch && matchPat;
      })
    : [];

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] as number | string | boolean | null;
    const bv = b[sortKey] as number | string | boolean | null;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const SortTh = ({ label, col, cls = '' }: { label: string; col: SortKey; cls?: string }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-3 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-200 transition-colors whitespace-nowrap ${cls}`}
    >
      {label}{sortKey === col ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const scanTime = data
    ? new Date(data.timestamp).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      }) + ' IST'
    : null;

  // Pattern counts for filter bar
  const counts = data ? {
    all:  data.results.length,
    vcp:  data.results.filter(r => r.vcp).length,
    sqz5: data.results.filter(r => r.tightSqueeze).length,
    inst: data.results.filter(r => r.instSpike).length,
    base: data.results.filter(r => r.longBase).length,
    sqz:  data.results.filter(r => r.bbSqueeze).length,
    dry:  data.results.filter(r => r.volDryup).length,
  } : null;

  return (
    <div className="min-h-screen">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">
                BSE Group A — Swing Setup Screener
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold ring-1 ring-emerald-500/20">
                5 PATTERNS
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Coiled Spring &nbsp;·&nbsp; BB Squeeze &nbsp;·&nbsp; VCP &nbsp;·&nbsp; Institutional Spike &nbsp;·&nbsp; Long Base Breakout
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {scanTime && (
              <span className="text-xs text-slate-500">
                {scanTime}
                {data && <> &nbsp;·&nbsp; <span className="text-slate-300">{data.scanned}/{data.universeSize}</span> passed</>}
                {data && <> &nbsp;·&nbsp; {(data.elapsedMs / 1000).toFixed(1)}s</>}
              </span>
            )}
            <button
              onClick={runScan}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  Scanning…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Run Scan
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-5 py-5">

        {/* ── Pattern filter tabs ──────────────────────────────────────── */}
        {data && counts && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {([
              { key: 'all',  label: 'All',               count: counts.all  },
              { key: 'vcp',  label: 'VCP',               count: counts.vcp  },
              { key: 'sqz5', label: 'Tight Squeeze',     count: counts.sqz5 },
              { key: 'inst', label: 'Institutional Spike', count: counts.inst },
              { key: 'base', label: 'Long Base',          count: counts.base },
              { key: 'sqz',  label: 'BB Squeeze',         count: counts.sqz  },
              { key: 'dry',  label: 'Vol Dry-up',         count: counts.dry  },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setPatFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  patFilter === f.key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-60">{f.count}</span>
              </button>
            ))}

            <div className="ml-auto">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search symbol / company…"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-44"
              />
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
            Error: {error}
          </div>
        )}

        {/* ── Empty / landing state ────────────────────────────────────── */}
        {!data && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-28 gap-4 text-slate-500">
            <svg className="w-14 h-14 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-base font-medium text-slate-300">Click Run Scan to find today&rsquo;s setups</p>
            <p className="text-xs text-center max-w-md leading-relaxed">
              Screens 142 BSE Group A stocks for 5 patterns: Coiled Spring, BB Squeeze, VCP,
              Institutional Spike, and Long Base Breakout. Takes ~10–20 seconds.
            </p>
            <button
              onClick={runScan}
              className="mt-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
            >
              Run Scan Now
            </button>
          </div>
        )}

        {/* ── Results table ────────────────────────────────────────────── */}
        {(data || loading) && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-600 w-7">#</th>
                    <SortTh label="Symbol"      col="symbol" />
                    <SortTh label="Company"     col="company" />
                    <SortTh label="Price"       col="price" />
                    <SortTh label="Score"       col="score" />
                    <SortTh label="BB Width%"   col="bbWidthPct" />
                    <SortTh label="RSI"         col="rsi" />
                    <SortTh label="ADX"         col="adx" />
                    <SortTh label="Vol Ratio"   col="volRatio" />
                    <SortTh label="RS vs Nifty" col="rsVsNifty" />
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      Patterns
                    </th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider min-w-[180px]">
                      Setup Notes
                    </th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider min-w-[230px]">
                      Trade Setup
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {loading ? (
                    <SkeletonRows />
                  ) : sorted.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-12 text-slate-500 text-sm">
                        {search || patFilter !== 'all'
                          ? 'No stocks match this filter.'
                          : 'No stocks passed the Stage 2 filter today.'}
                      </td>
                    </tr>
                  ) : (
                    sorted.map((r, i) => (
                      <tr key={r.symbol} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2.5 text-slate-600 tabular-nums text-xs">{i + 1}</td>

                        <td className="px-3 py-2.5">
                          <span className="font-mono font-bold text-white text-sm">{r.symbol}</span>
                        </td>

                        <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[160px] truncate" title={r.company}>
                          {r.company}
                        </td>

                        <td className="px-3 py-2.5 tabular-nums font-medium text-slate-200 text-xs whitespace-nowrap">
                          Rs.{r.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        <td className="px-3 py-2.5">
                          <ScoreBadge score={r.score} />
                        </td>

                        <td className={`px-3 py-2.5 tabular-nums text-xs ${r.bbSqueeze ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
                          <Num val={r.bbWidthPct} />
                        </td>

                        <td className={`px-3 py-2.5 tabular-nums text-xs ${r.rsi != null && r.rsi >= 50 && r.rsi <= 68 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
                          <Num val={r.rsi} decimals={1} />
                        </td>

                        <td className={`px-3 py-2.5 tabular-nums text-xs ${r.adx != null && r.adx < 22 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
                          <Num val={r.adx} decimals={1} />
                        </td>

                        <td className={`px-3 py-2.5 tabular-nums text-xs ${r.volDryup ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
                          <Num val={r.volRatio} />
                        </td>

                        <td className="px-3 py-2.5 tabular-nums text-xs">
                          <RSNum val={r.rsVsNifty} />
                        </td>

                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 flex-wrap min-w-[120px]">
                            <PatternBadge flag={r.bbSqueeze}    type="bbSqueeze" />
                            <PatternBadge flag={r.tightSqueeze} type="tightSqueeze" />
                            <PatternBadge flag={r.volDryup}     type="volDryup" />
                            <PatternBadge flag={r.instSpike}    type="instSpike" />
                            <PatternBadge flag={r.vcp}          type="vcp" />
                            <PatternBadge flag={r.longBase}     type="longBase" />
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-slate-500 text-[11px] max-w-[180px]" title={r.setupNotes}>
                          <span className="line-clamp-2 leading-relaxed">{r.setupNotes}</span>
                        </td>

                        <td className="px-3 py-2.5">
                          <TradeCard t={r.tradeSetup} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Score legend ─────────────────────────────────────────────── */}
        {data && (
          <div className="flex items-center gap-5 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> 8–12 High
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 5–7 Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> 0–4 Low
            </span>
            <span className="text-slate-700">|</span>
            <span>Score = Base(0–3) + Volume(0–3) + Momentum(0–2) + Patterns(0–4) = max 12</span>
          </div>
        )}

        {/* ── Pattern methodology cards ────────────────────────────────── */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {PATTERNS.map(p => (
            <div key={p.name} className={`bg-slate-900/60 border-t-2 ${p.color} border-x border-b border-slate-800 rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-bold text-white">{p.name}</h3>
                <span className={`text-[10px] font-bold ${p.badgeColor}`}>{p.badge}</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{p.desc}</p>
              <div className="mt-2 text-[10px] text-slate-600">Score: {p.pts}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
