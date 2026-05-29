'use client';

import { useState, useEffect } from 'react';
import { BTST_WEIGHTS, type BtstResult } from '@/lib/btst-engine';
import type { BtstScreenData } from '@/app/api/btst-screen/route';

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_PREFIX  = 'btst-scan-';
const STORAGE_INDEX   = 'btst-scan-index';
const MAX_STORED_DAYS = 90;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function saveResult(data: BtstScreenData): void {
  const key   = STORAGE_PREFIX + todayKey();
  const index: string[] = loadIndex();
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (!index.includes(todayKey())) {
      const updated = [todayKey(), ...index].slice(0, MAX_STORED_DAYS);
      localStorage.setItem(STORAGE_INDEX, JSON.stringify(updated));
    }
  } catch { /* storage full — silent */ }
}

function loadIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_INDEX) ?? '[]') as string[];
  } catch { return []; }
}

function loadByDate(date: string): BtstScreenData | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + date);
    return raw ? (JSON.parse(raw) as BtstScreenData) : null;
  } catch { return null; }
}

type ConvictionFilter = 'Any' | 'Medium' | 'High' | 'Very High';
type SortKey         = 'score' | 'volumeRatio' | 'changePct';

const CONVICTION_ORDER: Record<BtstResult['conviction'], number> = {
  'Very High': 4,
  'High':      3,
  'Medium':    2,
  'Low':       1,
};

const CONVICTION_COLOURS: Record<BtstResult['conviction'], string> = {
  'Very High': 'bg-emerald-600 text-white',
  'High':      'bg-sky-600 text-white',
  'Medium':    'bg-amber-500 text-white',
  'Low':       'bg-slate-500 text-white',
};

const SCORE_BAR_COLOUR = (score: number) => {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 65) return 'bg-sky-500';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-slate-400';
};

function fmt(n: number | undefined | null, dec = 2): string {
  return (n ?? 0).toFixed(dec);
}

function fmtCr(v: number): string {
  return `₹${(v / 1e7).toFixed(1)} Cr`;
}

function ScoreBreakdown({ pts }: { pts: BtstResult['pts'] }) {
  const rows: Array<[string, number, number]> = [
    ['Breakout Quality',    pts.breakout,   BTST_WEIGHTS.breakoutQuality],
    ['Candle Close Str.',   pts.candle,     BTST_WEIGHTS.candleCloseStr],
    ['Volume Confirm',      pts.volume,     BTST_WEIGHTS.volumeConfirm],
    ['Trend Alignment',     pts.trend,      BTST_WEIGHTS.trendAlignment],
    ['Volatility Exp.',     pts.volatility, BTST_WEIGHTS.volatilityExpansion],
    ['Relative Strength',   pts.rs,         BTST_WEIGHTS.relativeStrength],
    ['F&O Confirmation',    pts.fno,        BTST_WEIGHTS.fnoConfirmation],
    ['Risk Quality',        pts.risk,       BTST_WEIGHTS.riskQuality],
    ['Liquidity',           pts.liquidity,  BTST_WEIGHTS.liquidity],
  ];
  return (
    <table className="w-full text-xs mt-2 border-collapse">
      <thead>
        <tr className="text-slate-400 border-b border-slate-700">
          <th className="text-left py-1 pr-3 font-normal">Component</th>
          <th className="text-right py-1 pr-2 font-normal">Score</th>
          <th className="text-right py-1 font-normal">Max</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, val, max]) => (
          <tr key={label} className="border-b border-slate-800">
            <td className="py-0.5 pr-3 text-slate-300">{label}</td>
            <td className={`text-right py-0.5 pr-2 font-semibold ${val === max ? 'text-emerald-400' : val === 0 ? 'text-red-400' : 'text-amber-300'}`}>{val}</td>
            <td className="text-right py-0.5 text-slate-500">{max}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultCard({ result, rank }: { result: BtstResult; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 font-bold text-lg w-7">{rank}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-xl tracking-wide">{result.symbol}</span>
              {result.isFnO && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-violet-700 text-violet-200 font-semibold">F&O</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CONVICTION_COLOURS[result.conviction]}`}>
                {result.conviction}
              </span>
            </div>
            <div className="text-slate-400 text-xs mt-0.5">{result.company}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-slate-400 text-xs mb-1">Score</div>
          <div className="text-white font-bold text-2xl">{result.score}</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="w-full bg-slate-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${SCORE_BAR_COLOUR(result.score)}`}
          style={{ width: `${result.score}%` }}
        />
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Close',          `₹${fmt(result.close, 1)}`],
          ['Breakout',       `₹${fmt(result.breakoutLevel, 1)}`],
          ['Vol Ratio',      `${fmt(result.volumeRatio, 1)}x`],
          ['Change',         `${result.changePct >= 0 ? '+' : ''}${fmt(result.changePct, 2)}%`],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-900 rounded-lg p-2">
            <div className="text-slate-500 text-xs">{label}</div>
            <div className={`text-sm font-semibold mt-0.5 ${label === 'Change' ? (result.changePct >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white'}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* EMA chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: '20 EMA', above: result.close > result.ema20 },
          { label: '50 EMA', above: result.close > result.ema50 },
          { label: '200 DMA', above: result.close > result.sma200 },
        ].map(({ label, above }) => (
          <span
            key={label}
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              above
                ? 'border-emerald-700 bg-emerald-900/40 text-emerald-300'
                : 'border-red-800 bg-red-900/20 text-red-400'
            }`}
          >
            {label} {above ? '✓' : '✗'}
          </span>
        ))}
        {result.isFnO && result.fnoSignal !== 'None' && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
            result.fnoSignal === 'Long Buildup' || result.fnoSignal === 'Short Covering'
              ? 'border-violet-600 bg-violet-900/40 text-violet-300'
              : 'border-orange-700 bg-orange-900/20 text-orange-400'
          }`}>
            {result.fnoSignal}
          </span>
        )}
      </div>

      {/* Entry / Stop */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-900 rounded-lg p-2">
          <div className="text-slate-500 text-xs">Entry Zone</div>
          <div className="text-emerald-300 text-sm font-semibold mt-0.5">{result.entryZone}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-2">
          <div className="text-slate-500 text-xs">Stop Loss</div>
          <div className="text-red-400 text-sm font-semibold mt-0.5">₹{fmt(result.stopLoss, 1)}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-2">
          <div className="text-slate-500 text-xs">Stop %</div>
          <div className={`text-sm font-semibold mt-0.5 ${result.stopPct <= 2 ? 'text-emerald-400' : result.stopPct <= 3 ? 'text-amber-400' : 'text-red-400'}`}>
            {fmt(result.stopPct, 1)}%
          </div>
        </div>
      </div>

      {/* Traded value + ATR */}
      <div className="flex gap-4 text-xs text-slate-400">
        <span>Traded: <span className="text-slate-300">{fmtCr(result.tradedValue)}</span></span>
        <span>ATR: <span className="text-slate-300">{fmt(result.atrPct, 2)}%</span></span>
      </div>

      {/* Explanation */}
      <p className="text-slate-400 text-xs italic leading-relaxed">{result.explanation}</p>

      {/* Accordion: score breakdown */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-xs text-slate-500 hover:text-slate-300 text-left transition-colors"
      >
        {expanded ? '▲ Hide' : '▼ Show'} score breakdown
      </button>
      {expanded && <ScoreBreakdown pts={result.pts} />}
    </div>
  );
}

function fmtDateLabel(iso: string): string {
  // "2026-05-29" → "Thu 29 May 2026"
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BtstPage() {
  const [loading,     setLoading]   = useState(false);
  const [data,        setData]      = useState<BtstScreenData | null>(null);
  const [error,       setError]     = useState<string | null>(null);
  const [conviction,  setConviction]= useState<ConvictionFilter>('Any');
  const [fnoOnly,     setFnoOnly]   = useState(false);
  const [sortKey,     setSortKey]   = useState<SortKey>('score');
  const [dateIndex,   setDateIndex] = useState<string[]>([]);
  const [selectedDate,setSelected]  = useState<string>('');

  // Load stored date index on mount
  useEffect(() => {
    try {
      const idx = loadIndex();
      setDateIndex(idx);
      if (idx.length > 0) {
        const latest = idx[0];
        setSelected(latest);
        const saved = loadByDate(latest);
        if (saved) setData(saved);
      }
    } catch {
      // Corrupted localStorage — wipe BTST keys and start fresh
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(STORAGE_PREFIX) || k === STORAGE_INDEX) localStorage.removeItem(k);
      }
    }
  }, []);

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/btst-screen', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: BtstScreenData = await res.json();
      // Save today's scan
      saveResult(json);
      // Save embedded 90-day history entries
      if (json.history && json.historyDates) {
        for (const date of json.historyDates) {
          const scan = json.history[date];
          if (!scan) continue;
          const full: BtstScreenData = {
            results: scan.results,
            total: scan.total,
            scanned: json.scanned,
            niftyChange: scan.niftyChange,
            fetchedAt: date + 'T15:25:00.000Z',
            elapsedMs: 0,
          };
          try { localStorage.setItem(STORAGE_PREFIX + date, JSON.stringify(full)); } catch { /* full */ }
        }
        // Rebuild index from all stored keys
        const allKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(STORAGE_PREFIX)) allKeys.push(k.slice(STORAGE_PREFIX.length));
        }
        allKeys.sort().reverse();
        const trimmed = allKeys.slice(0, MAX_STORED_DAYS);
        localStorage.setItem(STORAGE_INDEX, JSON.stringify(trimmed));
      }
      setData(json);
      setSelected(todayKey());
      setDateIndex(loadIndex());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleDateChange(date: string) {
    setSelected(date);
    const saved = loadByDate(date);
    setData(saved);
    setError(null);
  }


  const filtered: BtstResult[] = (data?.results ?? [])
    .filter(r => {
      if (fnoOnly && !r.isFnO) return false;
      if (conviction !== 'Any' && CONVICTION_ORDER[r.conviction] < CONVICTION_ORDER[conviction as BtstResult['conviction']]) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'score')       return b.score       - a.score;
      if (sortKey === 'volumeRatio') return b.volumeRatio - a.volumeRatio;
      return b.changePct - a.changePct;
    });

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">BTST Screener</h1>
          <p className="text-slate-400 mt-1">Closing breakout + volume + trend + F&O confirmation</p>
          <p className="text-amber-400 text-sm mt-1">Best run at 3:20–3:25 PM when market is about to close</p>
        </div>

        {/* Run button + date picker + meta */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <button
            onClick={runScan}
            disabled={loading}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Scanning…
              </>
            ) : 'Run Scan'}
          </button>

          {/* Historical date picker */}
          {dateIndex.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-slate-400 text-sm">History:</label>
              <select
                value={selectedDate}
                onChange={e => handleDateChange(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 min-w-[180px]"
              >
                {dateIndex.map(d => (
                  <option key={d} value={d}>
                    {fmtDateLabel(d)}{d === todayKey() ? ' (today)' : ''}
                  </option>
                ))}
              </select>
              <span className="text-slate-500 text-xs">{dateIndex.length} day{dateIndex.length !== 1 ? 's' : ''} stored</span>
              <button
                onClick={() => {
                  for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (k?.startsWith(STORAGE_PREFIX) || k === STORAGE_INDEX) localStorage.removeItem(k);
                  }
                  setDateIndex([]);
                  setSelected('');
                  setData(null);
                }}
                className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                title="Clear all stored history"
              >
                ✕ Clear
              </button>
            </div>
          )}

          {data && (
            <div className="text-slate-400 text-sm">
              Scanned <span className="text-slate-300">{data.scanned}</span> symbols
              {' · '}Nifty <span className={data.niftyChange >= 0 ? 'text-emerald-400' : 'text-red-400'}>{data.niftyChange >= 0 ? '+' : ''}{data.niftyChange.toFixed(2)}%</span>
              {' · '}<span className="text-slate-500">{new Date(data.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Filters */}
        {data && (
          <div className="flex flex-wrap items-center gap-4 mb-6 p-3 bg-slate-800 border border-slate-700 rounded-xl">
            <div className="flex items-center gap-2 text-sm">
              <label className="text-slate-400">Min conviction:</label>
              <select
                value={conviction}
                onChange={e => setConviction(e.target.value as ConvictionFilter)}
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              >
                {(['Any', 'Medium', 'High', 'Very High'] as ConvictionFilter[]).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={fnoOnly}
                onChange={e => setFnoOnly(e.target.checked)}
                className="accent-violet-500"
              />
              F&O only
            </label>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-slate-400">Sort by:</label>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              >
                <option value="score">Score</option>
                <option value="volumeRatio">Volume</option>
                <option value="changePct">Change %</option>
              </select>
            </div>
            <span className="text-slate-500 text-xs ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Results */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((r, i) => (
              <ResultCard key={r.symbol} result={r} rank={i + 1} />
            ))}
          </div>
        ) : data && !loading ? (
          <div className="text-center text-slate-500 py-16">No results match the current filters.</div>
        ) : !data && !loading ? (
          <div className="text-center text-slate-600 py-16">
            <div className="text-5xl mb-4">📊</div>
            <div className="text-lg text-slate-500">Click <span className="text-emerald-400">Run Scan</span> to find today&apos;s BTST setups</div>
          </div>
        ) : null}

        {/* Footer weights */}
        <div className="mt-10 p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-xs text-slate-500 text-center">
          Weights used: Breakout {BTST_WEIGHTS.breakoutQuality} | Candle {BTST_WEIGHTS.candleCloseStr} | Volume {BTST_WEIGHTS.volumeConfirm} | Trend {BTST_WEIGHTS.trendAlignment} | Vol.Exp {BTST_WEIGHTS.volatilityExpansion} | RS {BTST_WEIGHTS.relativeStrength} | F&O {BTST_WEIGHTS.fnoConfirmation} | Risk {BTST_WEIGHTS.riskQuality} | Liq {BTST_WEIGHTS.liquidity}
        </div>
      </div>
    </div>
  );
}
