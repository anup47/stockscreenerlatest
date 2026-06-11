'use client';

import { useState, useEffect } from 'react';
import { STBT_WEIGHTS, type StbtResult } from '@/lib/stbt-engine';
import type { StbtScreenData } from '@/lib/stbt-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Play, BarChart2, Clock, Filter, X, TrendingUp, TrendingDown,
  ChevronDown, AlertCircle, RotateCcw
} from 'lucide-react';

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_PREFIX  = 'stbt-scan-';
const STORAGE_INDEX   = 'stbt-scan-index';
const MAX_STORED_DAYS = 90;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function saveResult(data: StbtScreenData): void {
  const key   = STORAGE_PREFIX + todayKey();
  const index = loadIndex();
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (!index.includes(todayKey())) {
      const updated = [todayKey(), ...index].slice(0, MAX_STORED_DAYS);
      localStorage.setItem(STORAGE_INDEX, JSON.stringify(updated));
    }
  } catch { /* storage full */ }
}

function loadIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_INDEX) ?? '[]') as string[];
  } catch { return []; }
}

function loadByDate(date: string): StbtScreenData | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + date);
    return raw ? (JSON.parse(raw) as StbtScreenData) : null;
  } catch { return null; }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ConvictionFilter = 'Any' | 'Medium' | 'High' | 'Very High';
type SortKey         = 'score' | 'volumeRatio' | 'changePct';

const CONVICTION_ORDER: Record<StbtResult['conviction'], number> = {
  'Very High': 4, 'High': 3, 'Medium': 2, 'Low': 1,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null, dec = 2): string {
  return (n ?? 0).toFixed(dec);
}

function fmtCr(v: number | undefined | null): string {
  return `₹${((v ?? 0) / 1e7).toFixed(1)} Cr`;
}

function fmtDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ConvictionBadge({ conviction }: { conviction: StbtResult['conviction'] }) {
  const styles: Record<StbtResult['conviction'], string> = {
    'Very High': 'bg-rose-500/15 text-rose-700 border-rose-500/30',
    'High':      'bg-orange-500/15 text-orange-700 border-orange-500/30',
    'Medium':    'bg-amber-500/15 text-amber-700 border-amber-500/30',
    'Low':       'bg-slate-500/15 text-slate-600 border-slate-400/30',
  };
  return (
    <Badge variant="outline" className={cn('text-xs font-semibold', styles[conviction])}>
      {conviction}
    </Badge>
  );
}

function ScoreBar({ score }: { score: number }) {
  const colour =
    score >= 80 ? 'bg-rose-500' :
    score >= 65 ? 'bg-orange-500' :
    score >= 50 ? 'bg-amber-400' : 'bg-slate-400';
  return (
    <div className="w-full bg-slate-200/60 rounded-full h-1.5 overflow-hidden">
      <div
        className={cn('h-1.5 rounded-full transition-all', colour)}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function ScoreBreakdown({ pts }: { pts: StbtResult['pts'] }) {
  const rows: Array<[string, number, number]> = [
    ['Breakdown Quality', pts.breakdown,  STBT_WEIGHTS.breakdownQuality],
    ['Candle Weakness',   pts.candle,     STBT_WEIGHTS.candleCloseWeak],
    ['Volume Confirm',    pts.volume,     STBT_WEIGHTS.volumeConfirm],
    ['Trend Alignment',   pts.trend,      STBT_WEIGHTS.trendAlignment],
    ['Volatility Exp.',   pts.volatility, STBT_WEIGHTS.volatilityExpansion],
    ['Relative Weakness', pts.rw,         STBT_WEIGHTS.relativeWeakness],
    ['F&O Confirmation',  pts.fno,        STBT_WEIGHTS.fnoConfirmation],
    ['Risk Quality',      pts.risk,       STBT_WEIGHTS.riskQuality],
    ['Liquidity',         pts.liquidity,  STBT_WEIGHTS.liquidity],
  ];
  return (
    <table className="w-full text-xs mt-2 border-collapse">
      <thead>
        <tr className="text-muted-foreground border-b border-border">
          <th className="text-left py-1.5 pr-3 font-medium">Component</th>
          <th className="text-right py-1.5 pr-2 font-medium">Score</th>
          <th className="text-right py-1.5 font-medium">Max</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, val, max]) => (
          <tr key={label} className="border-b border-border/50">
            <td className="py-1 pr-3 text-foreground">{label}</td>
            <td className={cn('text-right py-1 pr-2 font-semibold',
              val === max ? 'text-rose-600' : val === 0 ? 'text-slate-400' : 'text-amber-600'
            )}>
              {val}
            </td>
            <td className="text-right py-1 text-muted-foreground">{max}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultCard({ result, rank }: { result: StbtResult; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3">
        {/* Rank + symbol + badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-bold text-base w-6 text-center shrink-0">
              {rank}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-foreground font-bold text-lg tracking-wide">{result.symbol}</span>
                {result.isFnO && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 border border-violet-500/30 font-semibold">
                    F&O
                  </span>
                )}
                <ConvictionBadge conviction={result.conviction} />
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">{result.company}</p>
            </div>
          </div>
          {/* Score */}
          <div className="text-right shrink-0">
            <p className="text-muted-foreground text-xs mb-0.5">Score</p>
            <p className="text-foreground font-bold text-2xl leading-none">{result.score}</p>
          </div>
        </div>
        {/* Score bar */}
        <ScoreBar score={result.score} />
      </CardHeader>

      <CardContent className="px-4 pb-4 flex flex-col gap-3">
        {/* Key metrics grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {([
            ['Close',      `₹${fmt(result.close, 1)}`,                null],
            ['Breakdown',  `₹${fmt(result.breakdownLevel, 1)}`,        null],
            ['Vol Ratio',  `${fmt(result.volumeRatio, 1)}x`,           null],
            ['Change',     `${result.changePct >= 0 ? '+' : ''}${fmt(result.changePct, 2)}%`,
              result.changePct < 0 ? 'text-rose-600' : 'text-emerald-600'],
          ] as [string, string, string | null][]).map(([label, value, colour]) => (
            <div key={label} className="bg-muted/60 rounded-lg p-2 text-center">
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className={cn('text-sm font-semibold mt-0.5', colour ?? 'text-foreground')}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* EMA chips — for STBT, below MA is bullish setup (show green), above is bad (show red) */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '20 EMA',  below: result.close < result.ema20 },
            { label: '50 EMA',  below: result.close < result.ema50 },
            { label: '200 DMA', below: result.close < result.sma200 },
          ].map(({ label, below }) => (
            <span
              key={label}
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border',
                below
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
                  : 'border-slate-400/30 bg-slate-500/10 text-slate-600'
              )}
            >
              {below
                ? <TrendingDown className="size-3" />
                : <TrendingUp className="size-3" />}
              {label}
            </span>
          ))}
          {result.isFnO && result.fnoSignal !== 'None' && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium border',
              result.fnoSignal === 'Short Buildup' || result.fnoSignal === 'Long Unwinding'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
                : 'border-slate-400/30 bg-slate-500/10 text-slate-600'
            )}>
              {result.fnoSignal}
            </span>
          )}
        </div>

        {/* Sell Zone / Cover Stop / Stop% */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-rose-500/8 border border-rose-500/20 rounded-lg p-2 text-center">
            <p className="text-muted-foreground text-xs">Sell Zone</p>
            <p className="text-rose-700 text-sm font-semibold mt-0.5">{result.entryZone}</p>
          </div>
          <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2 text-center">
            <p className="text-muted-foreground text-xs">Cover Stop</p>
            <p className="text-emerald-700 text-sm font-semibold mt-0.5">₹{fmt(result.stopLoss, 1)}</p>
          </div>
          <div className={cn(
            'rounded-lg p-2 text-center border',
            result.stopPct <= 2
              ? 'bg-emerald-500/8 border-emerald-500/20'
              : result.stopPct <= 3
              ? 'bg-amber-500/8 border-amber-500/20'
              : 'bg-red-500/8 border-red-500/20'
          )}>
            <p className="text-muted-foreground text-xs">Stop %</p>
            <p className={cn(
              'text-sm font-semibold mt-0.5',
              result.stopPct <= 2 ? 'text-emerald-700' : result.stopPct <= 3 ? 'text-amber-700' : 'text-red-600'
            )}>
              {fmt(result.stopPct, 1)}%
            </p>
          </div>
        </div>

        {/* Traded value + ATR */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Traded: <span className="text-foreground font-medium">{fmtCr(result.tradedValue)}</span></span>
          <span>ATR: <span className="text-foreground font-medium">{fmt(result.atrPct, 2)}%</span></span>
        </div>

        {/* Explanation */}
        <p className="text-muted-foreground text-xs italic leading-relaxed">{result.explanation}</p>

        {/* Score breakdown toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-fit"
        >
          <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Hide' : 'Show'} score breakdown
        </button>
        {expanded && <ScoreBreakdown pts={result.pts} />}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StbtPage() {
  const [loading,      setLoading]   = useState(false);
  const [data,         setData]      = useState<StbtScreenData | null>(null);
  const [error,        setError]     = useState<string | null>(null);
  const [conviction,   setConviction]= useState<ConvictionFilter>('Any');
  const [fnoOnly,      setFnoOnly]   = useState(false);
  const [sortKey,      setSortKey]   = useState<SortKey>('score');
  const [dateIndex,    setDateIndex] = useState<string[]>([]);
  const [selectedDate, setSelected]  = useState<string>('');

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
      const res = await fetch('/api/stbt-screen', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StbtScreenData = await res.json();
      saveResult(json);
      if (json.history && json.historyDates) {
        for (const date of json.historyDates) {
          const scan = json.history[date];
          if (!scan) continue;
          const full: StbtScreenData = {
            results: scan.results, total: scan.total, scanned: json.scanned,
            niftyChange: scan.niftyChange, fetchedAt: date + 'T15:25:00.000Z', elapsedMs: 0,
          };
          try { localStorage.setItem(STORAGE_PREFIX + date, JSON.stringify(full)); } catch { /* full */ }
        }
        const allKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(STORAGE_PREFIX)) allKeys.push(k.slice(STORAGE_PREFIX.length));
        }
        allKeys.sort().reverse();
        localStorage.setItem(STORAGE_INDEX, JSON.stringify(allKeys.slice(0, MAX_STORED_DAYS)));
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
    setData(loadByDate(date));
    setError(null);
  }

  function clearHistory() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX) || k === STORAGE_INDEX) localStorage.removeItem(k);
    }
    setDateIndex([]);
    setSelected('');
    setData(null);
  }

  const filtered: StbtResult[] = (data?.results ?? [])
    .filter(r => {
      if (fnoOnly && !r.isFnO) return false;
      if (conviction !== 'Any' && CONVICTION_ORDER[r.conviction] < CONVICTION_ORDER[conviction as StbtResult['conviction']]) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'score')       return b.score       - a.score;
      if (sortKey === 'volumeRatio') return b.volumeRatio - a.volumeRatio;
      return a.changePct - b.changePct; // most negative first for STBT
    });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="size-6 text-rose-600" strokeWidth={2} />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">STBT Screener</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Closing breakdown · volume · trend alignment · F&O confirmation
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1">
            <Clock className="size-3" />
            Best run at 3:20–3:25 PM before market close
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <Button
            onClick={runScan}
            disabled={loading}
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold gap-2 cursor-pointer"
            size="lg"
          >
            {loading
              ? <><RotateCcw className="size-4 animate-spin" />Scanning…</>
              : <><Play className="size-4" />Run Scan</>}
          </Button>

          {dateIndex.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Clock className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={selectedDate}
                  onChange={e => handleDateChange(e.target.value)}
                  className="pl-8 pr-8 py-2 h-9 text-sm bg-background border border-input rounded-lg text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring cursor-pointer min-w-[190px]"
                >
                  {dateIndex.map(d => (
                    <option key={d} value={d}>
                      {fmtDateLabel(d)}{d === todayKey() ? ' (today)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 size-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <span className="text-muted-foreground text-xs">{dateIndex.length} days</span>
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                title="Clear all stored history"
              >
                <X className="size-3.5" />Clear
              </button>
            </div>
          )}

          {data && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto flex-wrap justify-end">
              <span>
                Scanned <span className="text-foreground font-medium">{data.scanned}</span>
              </span>
              <span className="text-border">·</span>
              <span>
                Nifty{' '}
                <span className={cn('font-medium', (data.niftyChange ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {(data.niftyChange ?? 0) >= 0 ? '+' : ''}{(data.niftyChange ?? 0).toFixed(2)}%
                </span>
              </span>
              <span className="text-border">·</span>
              <span className="text-xs">
                {new Date(data.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-red-500/8 border border-red-500/25 rounded-xl text-red-600 text-sm">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Filters ── */}
        {data && (
          <div className="flex flex-wrap items-center gap-3 mb-5 px-3.5 py-2.5 bg-muted/40 border border-border rounded-xl">
            <Filter className="size-3.5 text-muted-foreground shrink-0" />

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Min conviction</label>
              <select
                value={conviction}
                onChange={e => setConviction(e.target.value as ConvictionFilter)}
                className="text-sm bg-background border border-input rounded-md px-2.5 py-1 h-7 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 cursor-pointer"
              >
                {(['Any', 'Medium', 'High', 'Very High'] as ConvictionFilter[]).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Sort by</label>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="text-sm bg-background border border-input rounded-md px-2.5 py-1 h-7 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 cursor-pointer"
              >
                <option value="score">Score</option>
                <option value="volumeRatio">Volume</option>
                <option value="changePct">Change %</option>
              </select>
            </div>

            <button
              onClick={() => setFnoOnly(f => !f)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2.5 py-1 h-7 rounded-md border font-medium transition-colors cursor-pointer',
                fnoOnly
                  ? 'bg-violet-500/15 border-violet-500/30 text-violet-700'
                  : 'bg-background border-input text-muted-foreground hover:text-foreground'
              )}
            >
              F&O only
            </button>

            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* ── Results ── */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((r, i) => (
              <ResultCard key={r.symbol} result={r} rank={i + 1} />
            ))}
          </div>
        ) : data && !loading ? (
          <div className="text-center text-muted-foreground py-20">
            <Filter className="size-10 mx-auto mb-3 opacity-30" />
            <p>No results match the current filters.</p>
          </div>
        ) : !data && !loading ? (
          <div className="text-center py-24">
            <BarChart2 className="size-14 mx-auto mb-4 text-muted-foreground/30" strokeWidth={1.5} />
            <p className="text-muted-foreground">
              Click{' '}
              <button onClick={runScan} className="text-rose-600 font-semibold hover:underline cursor-pointer">
                Run Scan
              </button>{' '}
              to find today&apos;s STBT setups
            </p>
          </div>
        ) : null}

        {/* ── Footer weights ── */}
        <div className="mt-10 p-3 bg-muted/30 border border-border rounded-xl text-xs text-muted-foreground text-center leading-relaxed">
          Weights — Breakdown {STBT_WEIGHTS.breakdownQuality} · Candle {STBT_WEIGHTS.candleCloseWeak} · Volume {STBT_WEIGHTS.volumeConfirm} · Trend {STBT_WEIGHTS.trendAlignment} · VolExp {STBT_WEIGHTS.volatilityExpansion} · RW {STBT_WEIGHTS.relativeWeakness} · F&O {STBT_WEIGHTS.fnoConfirmation} · Risk {STBT_WEIGHTS.riskQuality} · Liq {STBT_WEIGHTS.liquidity}
        </div>
      </div>
    </div>
  );
}
