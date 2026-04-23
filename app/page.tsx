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

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7 ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30' :
    score >= 4 ? 'bg-amber-500/20  text-amber-300  ring-amber-500/30'  :
                 'bg-slate-500/20  text-slate-400  ring-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${color}`}>
      {score}/10
    </span>
  );
}

function SignalBadge({ active, label, title }: { active: boolean; label: string; title?: string }) {
  if (!active) return null;
  return (
    <span
      title={title}
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
    >
      {label}
    </span>
  );
}

function Num({ val, decimals = 2, prefix = '' }: { val: number | null; decimals?: number; prefix?: string }) {
  if (val === null || val === undefined) return <span className="text-slate-600">—</span>;
  return <span>{prefix}{val.toFixed(decimals)}</span>;
}

function RSNum({ val }: { val: number | null }) {
  if (val === null || val === undefined) return <span className="text-slate-600">—</span>;
  const color = val > 0 ? 'text-emerald-400' : 'text-red-400';
  return <span className={color}>{val > 0 ? '+' : ''}{val.toFixed(1)}%</span>;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-800">
          {Array.from({ length: 10 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-3 rounded bg-slate-800 shimmer" style={{ width: `${50 + Math.random() * 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch]   = useState('');

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

  const sorted = data
    ? [...data.results]
        .filter(r =>
          !search ||
          r.symbol.toLowerCase().includes(search.toLowerCase()) ||
          r.company.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          const av = a[sortKey] as number | string | boolean | null;
          const bv = b[sortKey] as number | string | boolean | null;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sortAsc ? cmp : -cmp;
        })
    : [];

  const SortTh = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      onClick={() => handleSort(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-200 transition-colors whitespace-nowrap"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col ? (sortAsc ? ' ▲' : ' ▼') : ''}
      </span>
    </th>
  );

  const scanTime = data
    ? new Date(data.timestamp).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      }) + ' IST'
    : null;

  return (
    <div className="min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              BSE Group A — Swing Setup Screener
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Stage 2 structure · BB squeeze · Volume dry-up · VCP · Relative Strength
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {scanTime && (
              <span className="text-xs text-slate-500">
                Last scan: <span className="text-slate-300">{scanTime}</span>
                {data && <> &nbsp;·&nbsp; {data.scanned}/{data.universeSize} passed</>}
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

      <main className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* ── Legend + search ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Score 7-10 &nbsp;High
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 4-6 &nbsp;Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> 0-3 &nbsp;Low
            </span>
            <span className="text-slate-600">|</span>
            <span title="Bollinger Band squeeze"><span className="text-emerald-300 font-bold">SQZ</span> BB Squeeze</span>
            <span title="Volume dry-up"><span className="text-emerald-300 font-bold">DRY</span> Vol Dry-up</span>
            <span title="Volatility Contraction Pattern"><span className="text-emerald-300 font-bold">VCP</span> Pattern</span>
          </div>

          {data && (
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter symbol / company…"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-52"
            />
          )}
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
            Error: {error}. Check your internet connection and try again.
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!data && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-slate-500">
            <svg className="w-16 h-16 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-lg font-medium text-slate-400">Click &ldquo;Run Scan&rdquo; to screen for today&rsquo;s setups</p>
            <p className="text-sm text-center max-w-sm">
              Runs Stage 2 filter + BB squeeze, volume dry-up, RS vs Nifty, RSI, ADX, and VCP
              across {UNIVERSE_SIZE} Group A stocks. Takes ~20 seconds.
            </p>
            <button
              onClick={runScan}
              className="mt-2 px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
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
                <thead className="bg-slate-900/80 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 w-8">#</th>
                    <SortTh label="Symbol"      col="symbol" />
                    <SortTh label="Company"     col="company" />
                    <SortTh label="Price"       col="price" />
                    <SortTh label="Score"       col="score" />
                    <SortTh label="BB Width%"   col="bbWidthPct" />
                    <SortTh label="RSI"         col="rsi" />
                    <SortTh label="ADX"         col="adx" />
                    <SortTh label="Vol Ratio"   col="volRatio" />
                    <SortTh label="RS vs Nifty" col="rsVsNifty" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      Signals
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Setup Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <SkeletonRows />
                  ) : (
                    sorted.map((r, i) => (
                      <tr
                        key={r.symbol}
                        className="hover:bg-slate-800/50 transition-colors group"
                      >
                        <td className="px-4 py-3 text-slate-600 tabular-nums">{i + 1}</td>

                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-white">{r.symbol}</span>
                        </td>

                        <td className="px-4 py-3 text-slate-400 max-w-[180px] truncate" title={r.company}>
                          {r.company}
                        </td>

                        <td className="px-4 py-3 tabular-nums font-medium text-slate-200">
                          Rs.{r.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        <td className="px-4 py-3">
                          <ScoreBadge score={r.score} />
                        </td>

                        <td className={`px-4 py-3 tabular-nums ${r.bbSqueeze ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          <Num val={r.bbWidthPct} />
                        </td>

                        <td className={`px-4 py-3 tabular-nums ${r.rsi != null && r.rsi >= 50 && r.rsi <= 68 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          <Num val={r.rsi} decimals={1} />
                        </td>

                        <td className={`px-4 py-3 tabular-nums ${r.adx != null && r.adx < 22 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          <Num val={r.adx} decimals={1} />
                        </td>

                        <td className={`px-4 py-3 tabular-nums ${r.volDryup ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          <Num val={r.volRatio} />
                        </td>

                        <td className="px-4 py-3 tabular-nums">
                          <RSNum val={r.rsVsNifty} />
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            <SignalBadge active={r.bbSqueeze} label="SQZ" title="Bollinger Band squeeze — width < 8%" />
                            <SignalBadge active={r.volDryup}  label="DRY" title="Volume dry-up — 10D avg < 60% of 50D avg" />
                            <SignalBadge active={r.vcp}       label="VCP" title="Volatility Contraction Pattern detected" />
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-500 text-xs max-w-[300px]" title={r.setupNotes}>
                          <span className="line-clamp-2">{r.setupNotes}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data && sorted.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                {search ? `No stocks match "${search}"` : 'No stocks passed the Stage 2 filter today.'}
              </div>
            )}
          </div>
        )}

        {/* ── Methodology card ─────────────────────────────────────────── */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Stage 2 Filter', color: 'text-blue-400', desc: 'Price > SMA50 > SMA150 > SMA200 AND within 35% of 52W high. Hard filter — must pass to appear.' },
            { title: 'Base Formation (0–3)', color: 'text-violet-400', desc: 'BB Width < 8% (squeeze), ATR in bottom 25th pct (volatility contracting), 5-day price range < 6%.' },
            { title: 'Volume Pattern (0–3)', color: 'text-amber-400', desc: '10D vol < 60% of 50D vol (dry-up), up-day volume dominates, 3-month RS vs Nifty > 0.' },
            { title: 'Momentum + VCP (0–3)', color: 'text-emerald-400', desc: 'RSI 50–68 (sweet spot), ADX < 22 (coiling), VCP: 3+ successively tighter pullbacks detected.' },
          ].map(c => (
            <div key={c.title} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h3 className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${c.color}`}>{c.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// Static constant used in empty state
const UNIVERSE_SIZE = 150;
