'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, RefreshCw, Download, ChevronUp, ChevronDown,
  ChevronsUpDown, Globe, BarChart2, AlertCircle, Info, X,
} from 'lucide-react';
import type { LeadersResponse, EtfResult, Timeframe } from '@/lib/etf-engine';

// ── Cache (localStorage per timeframe+region+type) ────────────────────────────
const CACHE_KEY = (tf: string, r: string, t: string) => `gl-${tf}-${r}-${t}`;
const CACHE_TTL: Record<string, number> = { '1D': 30, '1W': 60, '1M': 120, '3M': 240, '6M': 480, '1Y': 960 }; // minutes

function saveCache(key: string, data: LeadersResponse) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function loadCache(key: string, ttlMin: number): LeadersResponse | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: LeadersResponse; ts: number };
    if (Date.now() - ts > ttlMin * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function fmtPrice(n: number): string {
  return n >= 100 ? n.toFixed(2) : n.toFixed(3);
}

// ── Types ─────────────────────────────────────────────────────────────────────
type SortField = 'rank' | 'returnPct' | 'prev1dPct' | 'pct52w' | 'confidence';
type SortDir   = 'asc' | 'desc';

const CONFIDENCE_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

const REGION_LABELS: Record<string, string> = {
  all: 'All Regions', us: 'US', europe: 'Europe', asia: 'Asia',
  em: 'Emerging Markets', global: 'Global', india: 'India', china: 'China', japan: 'Japan',
};

// ── Sub-components ────────────────────────────────────────────────────────────
function ReturnCell({ val, size = 'default' }: { val: number; size?: 'sm' | 'default' }) {
  const cls = val >= 0 ? 'text-emerald-600' : 'text-red-500';
  return (
    <span className={cn('font-semibold tabular-nums', cls, size === 'sm' ? 'text-xs' : 'text-sm')}>
      {fmtPct(val)}
    </span>
  );
}

function ConfBadge({ c }: { c: 'High' | 'Medium' | 'Low' }) {
  const styles: Record<string, string> = {
    High:   'bg-emerald-500/12 text-emerald-700 border-emerald-500/25',
    Medium: 'bg-amber-500/12 text-amber-700 border-amber-500/25',
    Low:    'bg-slate-400/12 text-slate-500 border-slate-400/25',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold px-1.5 py-0', styles[c])}>
      {c}
    </Badge>
  );
}

function RegionBadge({ region }: { region: string }) {
  const colours: Record<string, string> = {
    us: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
    europe: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
    asia: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
    em: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    global: 'bg-slate-500/10 text-slate-600 border-slate-400/20',
    india:  'bg-orange-500/10 text-orange-700 border-orange-500/20',
    china:  'bg-red-500/10 text-red-700 border-red-500/20',
    japan:  'bg-red-400/10 text-red-600 border-red-400/20',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', colours[region] ?? colours.global)}>
      {REGION_LABELS[region] ?? region}
    </Badge>
  );
}

// Expandable "Why" cell
function WhyCell({ result }: { result: EtfResult }) {
  const [open, setOpen] = useState(false);
  const hasDetail = result.primaryDrivers.length > 0 || result.secondaryDrivers.length > 0;

  return (
    <div className="min-w-0 max-w-xs">
      <p className={cn('text-xs text-muted-foreground leading-tight', !open && 'line-clamp-2')}>
        {result.reasonSummary}
      </p>
      {hasDetail && (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-foreground mt-0.5 cursor-pointer"
        >
          {open ? <><ChevronUp className="size-3" />Less</> : <><ChevronDown className="size-3" />More</>}
        </button>
      )}
      {open && hasDetail && (
        <div className="mt-1.5 space-y-1">
          {result.primaryDrivers.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-foreground/70">Primary: </span>
              {result.primaryDrivers.map((d, i) => (
                <span key={i} className="text-[10px] text-emerald-700 mr-1">{d}{i < result.primaryDrivers.length - 1 ? ' ·' : ''}</span>
              ))}
            </div>
          )}
          {result.secondaryDrivers.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold text-foreground/70">Secondary: </span>
              <span className="text-[10px] text-muted-foreground">{result.secondaryDrivers.join(' · ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sortable column header
function SortTh({
  field, label, currentField, currentDir, onSort,
}: {
  field: SortField; label: string; currentField: SortField; currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = field === currentField;
  return (
    <th
      onClick={() => onSort(field)}
      className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active
          ? currentDir === 'asc'
            ? <ChevronUp className="size-3 text-foreground" />
            : <ChevronDown className="size-3 text-foreground" />
          : <ChevronsUpDown className="size-3 opacity-30" />}
      </span>
    </th>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(rows: EtfResult[], filename: string) {
  const headers = ['Rank', 'Symbol', 'Name', 'Region', 'Country', 'Theme', 'Return%', '1D%', '52W%ile', 'Confidence', 'Why'];
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.rank, r.symbol, `"${r.name}"`, r.region, r.country, `"${r.theme}"`,
      r.returnPct.toFixed(2), r.prev1dPct.toFixed(2), r.pct52w,
      r.confidence, `"${r.reasonSummary.replace(/"/g, "'")}"`,
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── ETF Table ─────────────────────────────────────────────────────────────────
function EtfTable({ rows, timeframe }: { rows: EtfResult[]; timeframe: Timeframe }) {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDir,   setSortDir]   = useState<SortDir>('asc');

  function handleSort(f: SortField) {
    if (f === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir(f === 'rank' ? 'asc' : 'desc'); }
  }

  const sorted = [...rows].sort((a, b) => {
    let diff = 0;
    if (sortField === 'rank')        diff = a.rank        - b.rank;
    else if (sortField === 'returnPct')  diff = a.returnPct  - b.returnPct;
    else if (sortField === 'prev1dPct')  diff = a.prev1dPct  - b.prev1dPct;
    else if (sortField === 'pct52w')     diff = a.pct52w     - b.pct52w;
    else if (sortField === 'confidence') diff = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
    return sortDir === 'asc' ? diff : -diff;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <SortTh field="rank"       label="#"       currentField={sortField} currentDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Symbol</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Name</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Region</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Theme</th>
            <SortTh field="returnPct"  label={timeframe} currentField={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortTh field="prev1dPct"  label="1D"      currentField={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortTh field="pct52w"     label="52W%"    currentField={sortField} currentDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Why</th>
            <SortTh field="confidence" label="Conf"    currentField={sortField} currentDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.symbol}
              className={cn(
                'border-b border-border/50 hover:bg-muted/30 transition-colors',
                i % 2 === 0 ? '' : 'bg-muted/10',
              )}
            >
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums w-8">{r.rank}</td>
              <td className="px-3 py-2">
                <span className="font-bold text-sm font-mono text-foreground">{r.symbol}</span>
              </td>
              <td className="px-3 py-2 max-w-[180px]">
                <span className="text-xs text-foreground truncate block" title={r.name}>{r.name}</span>
                {r.country !== 'USA' && r.country !== 'Multi' && r.country !== 'Global' && (
                  <span className="text-[10px] text-muted-foreground">{r.country}</span>
                )}
              </td>
              <td className="px-3 py-2"><RegionBadge region={r.region} /></td>
              <td className="px-3 py-2">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{r.theme}</span>
              </td>
              <td className="px-3 py-2 text-right"><ReturnCell val={r.returnPct} /></td>
              <td className="px-3 py-2 text-right"><ReturnCell val={r.prev1dPct} size="sm" /></td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-16 bg-muted/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={cn('h-1.5 rounded-full', r.pct52w >= 75 ? 'bg-emerald-500' : r.pct52w <= 25 ? 'bg-red-400' : 'bg-amber-400')}
                      style={{ width: `${r.pct52w}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{r.pct52w}</span>
                </div>
              </td>
              <td className="px-3 py-2"><WhyCell result={r} /></td>
              <td className="px-3 py-2"><ConfBadge c={r.confidence} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="py-3 gap-1">
      <CardContent className="px-4 py-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn('text-sm font-bold text-foreground truncate', color)}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y'];

export default function GlobalLeadersPage() {
  const [data,        setData]        = useState<LeadersResponse | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [timeframe,   setTimeframe]   = useState<Timeframe>('1W');
  const [region,      setRegion]      = useState('all');
  const [type,        setType]        = useState('all');
  const [activeTable, setActiveTable] = useState<'leaders' | 'laggards'>('leaders');
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (tf: Timeframe, reg: string, t: string, force = false) => {
    const cacheKey = CACHE_KEY(tf, reg, t);
    if (!force) {
      const cached = loadCache(cacheKey, CACHE_TTL[tf] ?? 60);
      if (cached) { setData(cached); return; }
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const url = `/api/global-leaders?timeframe=${tf}&region=${reg}&type=${t}&limit=30`;
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: LeadersResponse = await res.json();
      setData(json);
      saveCache(cacheKey, json);
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount and when filters change
  useEffect(() => {
    fetchData(timeframe, region, type);
    return () => { abortRef.current?.abort(); };
  }, [timeframe, region, type, fetchData]);

  const summary = data?.summary;
  const rows    = activeTable === 'leaders' ? data?.leaders : data?.laggards;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="size-5 text-emerald-600" strokeWidth={2} />
              <h1 className="text-xl font-bold text-foreground tracking-tight">Global ETF / Index Leaders</h1>
            </div>
            <p className="text-sm text-muted-foreground">Top 30 leaders &amp; laggards across global ETFs with deterministic driver analysis</p>
            {data && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Updated {new Date(data.metadata.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                {' · '}{data.metadata.filtered} ETFs analysed{' · '}{data.metadata.elapsedMs}ms
              </p>
            )}
          </div>
          <Button
            onClick={() => fetchData(timeframe, region, type, true)}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 cursor-pointer"
          >
            {loading
              ? <><RefreshCw className="size-4 animate-spin" />Loading…</>
              : <><RefreshCw className="size-4" />Refresh</>}
          </Button>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-wrap items-center gap-3 mb-5 px-3.5 py-2.5 bg-muted/30 border border-border rounded-xl sticky top-0 z-10 backdrop-blur-sm">
          {/* Timeframe */}
          <div className="flex gap-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  'px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer',
                  tf === timeframe
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-border" />

          {/* Region */}
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 h-7 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 cursor-pointer"
          >
            {Object.entries(REGION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>

          {/* Type */}
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="text-xs bg-background border border-input rounded-md px-2.5 py-1.5 h-7 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="etf">ETF</option>
          </select>

          {data && summary?.marketSnapshot && (
            <p className="ml-auto text-xs text-muted-foreground hidden md:block max-w-xs truncate" title={summary.marketSnapshot}>
              {summary.marketSnapshot}
            </p>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 p-3.5 bg-red-500/8 border border-red-500/25 rounded-xl text-red-600 text-sm">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto cursor-pointer"><X className="size-4" /></button>
          </div>
        )}

        {/* ── Summary cards ── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
            <SummaryCard
              label="Strongest ETF"
              value={summary.strongestEtf?.symbol ?? '—'}
              sub={summary.strongestEtf ? fmtPct(summary.strongestEtf.returnPct) : undefined}
              color="text-emerald-600"
            />
            <SummaryCard
              label="Weakest ETF"
              value={summary.weakestEtf?.symbol ?? '—'}
              sub={summary.weakestEtf ? fmtPct(summary.weakestEtf.returnPct) : undefined}
              color="text-red-500"
            />
            <SummaryCard
              label="Best Region"
              value={REGION_LABELS[summary.strongestRegion ?? ''] ?? summary.strongestRegion ?? '—'}
            />
            <SummaryCard
              label="Worst Region"
              value={REGION_LABELS[summary.weakestRegion ?? ''] ?? summary.weakestRegion ?? '—'}
            />
            <SummaryCard
              label="Best Theme"
              value={summary.strongestTheme ?? '—'}
            />
            <SummaryCard
              label="Worst Theme"
              value={summary.weakestTheme ?? '—'}
            />
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && !data && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && !data && (
          <div className="text-center py-20">
            <Globe className="size-12 mx-auto mb-3 text-muted-foreground/30" strokeWidth={1.5} />
            <p className="text-muted-foreground">Loading global ETF data…</p>
          </div>
        )}

        {/* ── Main tables ── */}
        {data && (
          <Card className="py-0 gap-0">
            {/* Tab toggle + export */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
              <div className="flex gap-1">
                {(['leaders', 'laggards'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTable(tab)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer',
                      tab === activeTable ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {tab === 'leaders'
                      ? <><TrendingUp className="size-3" />Top 30 Leaders</>
                      : <><TrendingDown className="size-3" />Top 30 Laggards</>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => rows && exportCSV(rows, `etf-${activeTable}-${timeframe}-${new Date().toISOString().slice(0, 10)}.csv`)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Export current table to CSV"
              >
                <Download className="size-3.5" />CSV
              </button>
            </div>

            {rows && rows.length > 0 ? (
              <EtfTable rows={rows} timeframe={timeframe} />
            ) : (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No results for current filters.
              </div>
            )}
          </Card>
        )}

        {/* ── Warnings ── */}
        {data && data.warnings.length > 0 && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground/60">
            <Info className="size-3.5 mt-0.5 shrink-0" />
            {data.warnings.length} symbol(s) returned no data and were excluded.
          </div>
        )}

        {/* ── Footer ── */}
        <p className="text-center text-xs text-muted-foreground/50 mt-8">
          Data via Yahoo Finance · Explanations are rule-based (deterministic) · Not investment advice
        </p>
      </div>
    </div>
  );
}
