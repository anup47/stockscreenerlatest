'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Clock, Circle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';

interface ResearchRow {
  id: number;
  company: string;
  symbol: string;
  sector: string;
  stance: 'ACCUMULATE' | 'WATCH' | 'AVOID';
  researchCmp: number | null;
  target: number | null;
  horizon: string | null;
  currency?: 'INR' | 'USD';
  note?: string;
  livePrice: number | null;
  changePct: number | null;
  expectedReturn: number | null;
  vsCmp: number | null;
}

interface ApiResponse {
  rows: ResearchRow[];
  fetchedAt: string;
  source?: 'dhan' | 'yahoo';
}

function isMarketOpen(): boolean {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins <= 930; // 9:15–15:30
}

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const STANCE_STYLE: Record<string, string> = {
  ACCUMULATE: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  WATCH:      'bg-amber-100 text-amber-700 border border-amber-200',
  AVOID:      'bg-red-100 text-red-700 border border-red-200',
};

const HORIZON_STYLE: Record<string, string> = {
  '12M': 'bg-blue-50 text-blue-600',
  '18M': 'bg-purple-50 text-purple-600',
  '24M': 'bg-orange-50 text-orange-600',
  '3Y':  'bg-gray-100 text-gray-600',
};

function ReturnBadge({ val }: { val: number | null }) {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>;
  const abs = Math.abs(val);
  let cls = '';
  if (val >= 40)       cls = 'text-emerald-700 font-bold';
  else if (val >= 20)  cls = 'text-emerald-600 font-semibold';
  else if (val >= 10)  cls = 'text-green-600';
  else if (val >= 0)   cls = 'text-gray-600';
  else if (val >= -15) cls = 'text-orange-600';
  else                 cls = 'text-red-600 font-semibold';
  return (
    <span className={cn('tabular-nums text-sm', cls)}>
      {val > 0 ? '+' : ''}{val.toFixed(1)}%
      {abs >= 20 && (
        <span className="ml-1 text-[10px] opacity-60">
          {val >= 40 ? '🔥' : val >= 20 ? '⬆' : ''}
        </span>
      )}
    </span>
  );
}

function DayChg({ val }: { val: number | null }) {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>;
  const Icon = val > 0.05 ? TrendingUp : val < -0.05 ? TrendingDown : Minus;
  const cls = val > 0.05 ? 'text-emerald-600' : val < -0.05 ? 'text-red-500' : 'text-gray-400';
  return (
    <span className={cn('flex items-center gap-0.5 text-xs tabular-nums', cls)}>
      <Icon className="size-3" />
      {fmtPct(val)}
    </span>
  );
}

type SortKey = 'expectedReturn' | 'company' | 'sector' | 'livePrice' | 'target' | 'vsCmp' | 'changePct';

const SECTORS = [
  'All', 'Pharma', 'Consumer Health', 'Consumer', 'Real Estate', 'Recycling',
  'Industrials', 'Auto Components', 'Chemicals', 'Metals', 'Materials',
  'Defence', 'Financials', 'Fintech', 'Healthcare', 'Media', 'Energy', 'Hotels',
];

export default function ResearchTargetsPage() {
  const dhan = useDhanCredentials();

  const [data, setData]         = useState<ResearchRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [priceSource, setPriceSource] = useState<'dhan' | 'yahoo' | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);

  const [stanceFilter, setStanceFilter] = useState<'All' | 'ACCUMULATE' | 'WATCH' | 'AVOID'>('All');
  const [horizonFilter, setHorizonFilter] = useState<string>('All');
  const [sectorFilter, setSectorFilter]   = useState<string>('All');
  const [sortKey, setSortKey]   = useState<SortKey>('expectedReturn');
  const [sortAsc, setSortAsc]   = useState(false);
  const [showNoTarget, setShowNoTarget] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/research-targets', {
        cache: 'no-store',
        headers: dhan.isConfigured ? dhan.headers : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json.rows);
      setFetchedAt(json.fetchedAt);
      setPriceSource(json.source ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [dhan.isConfigured, dhan.headers]);

  useEffect(() => {
    if (!dhan.isHydrated) return; // wait for localStorage to load
    load();
    setMarketOpen(isMarketOpen());
    const tick = setInterval(() => setMarketOpen(isMarketOpen()), 60_000);
    // Auto-refresh every 5 min during market hours
    const refresh = setInterval(() => { if (isMarketOpen()) load(); }, 5 * 60_000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [load, dhan.isHydrated]);

  const sorted = useMemo(() => {
    let rows = [...data];

    if (stanceFilter !== 'All')  rows = rows.filter(r => r.stance === stanceFilter);
    if (horizonFilter !== 'All') rows = rows.filter(r => r.horizon === horizonFilter);
    if (sectorFilter !== 'All')  rows = rows.filter(r => r.sector === sectorFilter);
    if (!showNoTarget)           rows = rows.filter(r => r.target != null);

    rows.sort((a, b) => {
      if (sortKey === 'expectedReturn') {
        // Nulls always to bottom
        if (a.expectedReturn == null && b.expectedReturn == null) return a.company.localeCompare(b.company);
        if (a.expectedReturn == null) return 1;
        if (b.expectedReturn == null) return -1;
        return sortAsc ? a.expectedReturn - b.expectedReturn : b.expectedReturn - a.expectedReturn;
      }
      if (sortKey === 'company') return sortAsc
        ? a.company.localeCompare(b.company) : b.company.localeCompare(a.company);
      if (sortKey === 'sector') return sortAsc
        ? a.sector.localeCompare(b.sector) : b.sector.localeCompare(a.sector);
      if (sortKey === 'livePrice') {
        const av = a.livePrice ?? (sortAsc ? Infinity : -Infinity);
        const bv = b.livePrice ?? (sortAsc ? Infinity : -Infinity);
        return sortAsc ? av - bv : bv - av;
      }
      if (sortKey === 'target') {
        const av = a.target ?? (sortAsc ? Infinity : -Infinity);
        const bv = b.target ?? (sortAsc ? Infinity : -Infinity);
        return sortAsc ? av - bv : bv - av;
      }
      if (sortKey === 'vsCmp') {
        const av = a.vsCmp ?? (sortAsc ? Infinity : -Infinity);
        const bv = b.vsCmp ?? (sortAsc ? Infinity : -Infinity);
        return sortAsc ? av - bv : bv - av;
      }
      if (sortKey === 'changePct') {
        const av = a.changePct ?? (sortAsc ? Infinity : -Infinity);
        const bv = b.changePct ?? (sortAsc ? Infinity : -Infinity);
        return sortAsc ? av - bv : bv - av;
      }
      return 0;
    });

    return rows;
  }, [data, stanceFilter, horizonFilter, sectorFilter, sortKey, sortAsc, showNoTarget]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key !== 'expectedReturn'); }
  }

  const SortTh = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      className={cn('px-3 py-2.5 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap', right && 'text-right')}
      onClick={() => toggleSort(k)}
    >
      {label}
      {sortKey === k && <span className="ml-0.5 opacity-60">{sortAsc ? '↑' : '↓'}</span>}
    </th>
  );

  const counts = useMemo(() => ({
    total:      data.length,
    accum:      data.filter(r => r.stance === 'ACCUMULATE').length,
    watch:      data.filter(r => r.stance === 'WATCH').length,
    avoid:      data.filter(r => r.stance === 'AVOID').length,
    withTarget: data.filter(r => r.target != null).length,
    pricesOk:   data.filter(r => r.livePrice != null).length,
  }), [data]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 py-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="size-5 text-emerald-600" />
              Research Target Tracker
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {counts.total} stocks · {counts.withTarget} with price targets · {counts.pricesOk} live prices loaded
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Market status */}
            <div className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border',
              marketOpen
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-50 text-gray-500 border-gray-200',
            )}>
              <Circle className={cn('size-2 fill-current', marketOpen ? 'text-emerald-500' : 'text-gray-400')} />
              {marketOpen ? 'Market Open · auto-refresh 5m' : 'Market Closed'}
            </div>
            {fetchedAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {fmtTime(fetchedAt)} IST
              </div>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Summary chips ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setStanceFilter('All')}
            className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              stanceFilter === 'All' ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted')}>
            All ({counts.total})
          </button>
          <button onClick={() => setStanceFilter(stanceFilter === 'ACCUMULATE' ? 'All' : 'ACCUMULATE')}
            className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              stanceFilter === 'ACCUMULATE' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50')}>
            Accumulate ({counts.accum})
          </button>
          <button onClick={() => setStanceFilter(stanceFilter === 'WATCH' ? 'All' : 'WATCH')}
            className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              stanceFilter === 'WATCH' ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-200 text-amber-700 hover:bg-amber-50')}>
            Watch ({counts.watch})
          </button>
          <button onClick={() => setStanceFilter(stanceFilter === 'AVOID' ? 'All' : 'AVOID')}
            className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              stanceFilter === 'AVOID' ? 'bg-red-500 text-white border-red-500' : 'border-red-200 text-red-700 hover:bg-red-50')}>
            Avoid ({counts.avoid})
          </button>

          <div className="w-px bg-border mx-1" />

          {['All', '12M', '18M', '24M', '3Y'].map(h => (
            <button key={h} onClick={() => setHorizonFilter(h === horizonFilter && h !== 'All' ? 'All' : h)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                horizonFilter === h ? 'bg-blue-600 text-white border-blue-600' : 'border-border hover:bg-muted')}>
              {h}
            </button>
          ))}

          <div className="w-px bg-border mx-1" />

          <button onClick={() => setShowNoTarget(p => !p)}
            className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              !showNoTarget ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted')}>
            {showNoTarget ? 'Hide no-target' : 'Show no-target'}
          </button>
        </div>

        {/* ── Sector filter ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sector:</span>
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map(s => (
              <button key={s} onClick={() => setSectorFilter(s === sectorFilter ? 'All' : s)}
                className={cn('px-2.5 py-0.5 rounded text-xs font-medium border transition-colors',
                  sectorFilter === s ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted text-muted-foreground')}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error} — <button className="underline" onClick={load}>Retry</button>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground text-center w-8">#</th>
                  <SortTh k="company"        label="Company" />
                  <SortTh k="sector"         label="Sector" />
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">Stance</th>
                  <SortTh k="target"         label="Target" right />
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground text-center">Hor.</th>
                  <SortTh k="livePrice"      label="Live CMP" right />
                  <SortTh k="changePct"      label="Day %" right />
                  <SortTh k="expectedReturn" label="Expected Return" right />
                  <SortTh k="vsCmp"          label="vs Report" right />
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.length === 0 && !loading && (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-muted-foreground text-sm">
                      No stocks match the current filters.
                    </td>
                  </tr>
                )}
                {sorted.map((row, i) => {
                  const isUsd    = row.currency === 'USD';
                  const cur      = isUsd ? '$' : 'Rs ';
                  const noTarget = row.target == null;
                  return (
                    <tr key={row.id}
                      className={cn('hover:bg-muted/30 transition-colors',
                        i % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                        noTarget && 'opacity-75',
                      )}>
                      {/* Rank */}
                      <td className="px-3 py-2.5 text-center text-xs text-muted-foreground font-mono">
                        {row.expectedReturn != null ? i + 1 : '—'}
                      </td>

                      {/* Company */}
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground whitespace-nowrap">{row.company}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          {row.symbol}
                          {isUsd && <span className="text-[10px] bg-blue-50 text-blue-500 px-1 rounded">NYSE</span>}
                          <a
                            href={`https://www.nseindia.com/get-quotes/equity?symbol=${row.symbol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground/50 hover:text-muted-foreground"
                          >
                            <ExternalLink className="size-2.5" />
                          </a>
                        </div>
                      </td>

                      {/* Sector */}
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{row.sector}</td>

                      {/* Stance */}
                      <td className="px-3 py-2.5">
                        <span className={cn('px-2 py-0.5 rounded text-[11px] font-semibold', STANCE_STYLE[row.stance])}>
                          {row.stance}
                        </span>
                      </td>

                      {/* Target */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-sm font-medium">
                        {row.target != null
                          ? <>{cur}{fmt(row.target, row.target >= 100 ? 0 : 1)}</>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </td>

                      {/* Horizon */}
                      <td className="px-3 py-2.5 text-center">
                        {row.horizon
                          ? <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-medium', HORIZON_STYLE[row.horizon] ?? 'bg-gray-100 text-gray-600')}>{row.horizon}</span>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </td>

                      {/* Live CMP */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-sm">
                        {row.livePrice != null
                          ? <span className="font-medium">{cur}{fmt(row.livePrice, row.livePrice >= 100 ? 1 : 2)}</span>
                          : <span className="text-muted-foreground text-xs">N/A</span>
                        }
                      </td>

                      {/* Day % */}
                      <td className="px-3 py-2.5 text-right">
                        <DayChg val={row.changePct} />
                      </td>

                      {/* Expected Return — KEY column */}
                      <td className="px-3 py-2.5 text-right">
                        <ReturnBadge val={row.expectedReturn} />
                      </td>

                      {/* vs Research CMP */}
                      <td className="px-3 py-2.5 text-right">
                        {row.vsCmp != null ? (
                          <span className={cn('text-xs tabular-nums',
                            row.vsCmp <= -5 ? 'text-emerald-600 font-medium' :
                            row.vsCmp >= 10 ? 'text-orange-500' : 'text-muted-foreground',
                          )}>
                            {fmtPct(row.vsCmp)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Note */}
                      <td className="px-3 py-2.5 text-[11px] text-muted-foreground max-w-[180px]">
                        <span className="line-clamp-2">{row.note ?? ''}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="mt-4 text-xs text-muted-foreground space-y-1">
          <p>
            Prices via {priceSource === 'dhan' ? <span className="font-medium text-emerald-600">Dhan API</span> : 'Yahoo Finance (configure Dhan in Settings for live prices)'}
            {' '}· sorted by expected return to base-case target · stocks without targets sorted to bottom.
          </p>
          <p><span className="font-medium text-orange-500">vs Report</span> = % move since research was published (green = stock cheaper now, orange = stock has re-rated up).</p>
          <p>Expected Return = (Target - Live CMP) / Live CMP × 100. 18M / 3Y targets not annualised — shown as absolute return over the stated horizon.</p>
        </div>

      </div>
    </div>
  );
}
