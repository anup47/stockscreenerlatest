'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  Clock,
  AlertCircle,
  Zap,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SupplyDemandSnapshot,
  SupplyDemandTheme,
  Category,
  PricingPower,
} from '@/lib/supply-demand-types';

const SNAPSHOT_KEY = 'sd-snapshot';
const DATE_KEY = 'sd-date';

function todayIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  return ist.toISOString().slice(0, 10);
}

function canRefreshNow(): boolean {
  const utcMinutes = Math.floor(Date.now() / 60000) % 1440;
  const istMinutes = (utcMinutes + 330) % 1440;
  return istMinutes >= 780;
}

function getISTTimeString(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return isoString;
  }
}

function minutesUntil1PM(): number {
  const utcMinutes = Math.floor(Date.now() / 60000) % 1440;
  const istMinutes = (utcMinutes + 330) % 1440;
  if (istMinutes >= 780) return 0;
  return 780 - istMinutes;
}

function formatCountdown(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Category helpers ────────────────────────────────────────────────────────

function categoryLabel(cat: Category): string {
  switch (cat) {
    case 'shortage': return 'Shortage';
    case 'oversupply': return 'Oversupply';
    case 'emerging': return 'Emerging';
    case 'balanced': return 'Balanced';
    default: return String(cat);
  }
}

function categoryColor(cat: Category): string {
  switch (cat) {
    case 'shortage': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'oversupply': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'emerging': return 'bg-violet-500/10 text-violet-600 border-violet-500/20';
    case 'balanced': return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  }
}

function pricingPowerIcon(pp: PricingPower): React.ReactElement {
  switch (pp) {
    case 'rising': return <Zap className="h-3 w-3 text-emerald-500" />;
    case 'collapsing': return <TrendingDown className="h-3 w-3 text-red-500" />;
    case 'stable':
    default: return <Shield className="h-3 w-3 text-slate-400" />;
  }
}

function pricingPowerColor(pp: PricingPower): string {
  switch (pp) {
    case 'rising': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'collapsing': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'stable':
    default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  }
}

function confidenceColor(n: number): string {
  if (n >= 70) return 'bg-emerald-500';
  if (n >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function impactDot(level: string): string {
  switch (level) {
    case 'high': return 'bg-red-500';
    case 'medium': return 'bg-amber-400';
    default: return 'bg-slate-400';
  }
}

// ─── ThemeCard ───────────────────────────────────────────────────────────────

function ThemeCard({ theme }: { theme: SupplyDemandTheme }) {
  const [expanded, setExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);

  return (
    <Card className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3 pt-4 px-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base text-foreground leading-tight truncate">
              {theme.commodity}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
                categoryColor(theme.category)
              )}
            >
              {categoryLabel(theme.category)}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
                pricingPowerColor(theme.pricingPower)
              )}
            >
              {pricingPowerIcon(theme.pricingPower)}
              {theme.pricingPower === 'rising'
                ? 'Rising'
                : theme.pricingPower === 'collapsing'
                ? 'Collapsing'
                : 'Stable'}
            </span>
          </div>
        </div>

        {/* Confidence + time horizon */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                Confidence
              </span>
              <span className="text-[11px] font-semibold text-foreground">{theme.confidence}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', confidenceColor(theme.confidence))}
                style={{ width: `${theme.confidence}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border border-border/60">
            <Clock className="h-3 w-3" />
            <span className="font-medium capitalize">{theme.timeHorizon}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
          {theme.description}
        </p>

        {/* Expand / collapse */}
        {expanded && (
          <div className="space-y-3">
            {/* Historical analog */}
            <blockquote className="border-l-2 border-amber-400/60 pl-3 text-xs italic text-muted-foreground leading-relaxed">
              {theme.historicalAnalog}
            </blockquote>
          </div>
        )}

        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Less detail
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> More detail
            </>
          )}
        </button>

        {/* Beneficiaries + Adversely Affected */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Beneficiaries */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                Beneficiaries
              </span>
            </div>
            <div className="space-y-1.5">
              {theme.beneficiaries.map((s) => (
                <div
                  key={s.symbol}
                  className="rounded-md border border-emerald-500/15 bg-emerald-500/5 px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full flex-shrink-0',
                        impactDot(s.impact)
                      )}
                    />
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      {s.symbol}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">
                    {s.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Adversely Affected */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingDown className="h-3 w-3 text-red-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                Risks
              </span>
            </div>
            <div className="space-y-1.5">
              {theme.adverselyAffected.map((s) => (
                <div
                  key={s.symbol}
                  className="rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full flex-shrink-0',
                        impactDot(s.impact)
                      )}
                    />
                    <span className="text-[11px] font-bold text-red-700 dark:text-red-400">
                      {s.symbol}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">
                    {s.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sources */}
        {theme.sources && theme.sources.length > 0 && (
          <div>
            <button
              onClick={() => setShowSources((p) => !p)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showSources ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Sources ({theme.sources.length})
            </button>
            {showSources && (
              <ul className="mt-1.5 space-y-0.5 pl-3">
                {theme.sources.map((src, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground before:content-['•'] before:mr-1.5">
                    {src}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex justify-between items-start gap-2">
        <div className="h-4 bg-muted rounded w-2/5" />
        <div className="flex gap-1.5">
          <div className="h-4 bg-muted rounded-full w-16" />
          <div className="h-4 bg-muted rounded-full w-14" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-1 bg-muted rounded-full w-full" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-5/6" />
        <div className="h-3 bg-muted rounded w-4/6" />
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="space-y-1.5">
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type FilterCategory = 'all' | Category | 'rising' | 'collapsing';

export default function SupplyDemandPage() {
  const [snapshot, setSnapshot] = useState<SupplyDemandSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [forceMode, setForceMode] = useState(false);
  const [countdown, setCountdown] = useState(minutesUntil1PM());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown ticker
  useEffect(() => {
    if (canRefreshNow()) return;
    timerRef.current = setInterval(() => {
      const m = minutesUntil1PM();
      setCountdown(m);
      if (m === 0 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    }, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const storedDate = localStorage.getItem(DATE_KEY);
      const today = todayIST();
      if (storedDate === today) {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (raw) {
          const parsed: SupplyDemandSnapshot = JSON.parse(raw);
          if (Array.isArray(parsed.themes)) {
            setSnapshot(parsed);
            return;
          }
        }
      }
      // stale or missing
      localStorage.removeItem(SNAPSHOT_KEY);
      localStorage.removeItem(DATE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const canRun = forceMode || canRefreshNow();

  const runAnalysis = useCallback(async () => {
    if (!canRun) return;

    const hasTodayData =
      snapshot !== null && localStorage.getItem(DATE_KEY) === todayIST();

    if (hasTodayData && !forceMode) {
      const ok = window.confirm(
        'Analysis for today already exists. Re-run and overwrite?'
      );
      if (!ok) return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/supply-demand', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error || `API returned ${res.status}`
        );
      }
      const data: SupplyDemandSnapshot = await res.json();
      setSnapshot(data);
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
      localStorage.setItem(DATE_KEY, todayIST());
      setForceMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [canRun, forceMode, snapshot]);

  // Derived: category counts
  const counts = {
    shortage: snapshot?.themes.filter((t) => t.category === 'shortage').length ?? 0,
    oversupply: snapshot?.themes.filter((t) => t.category === 'oversupply').length ?? 0,
    emerging: snapshot?.themes.filter((t) => t.category === 'emerging').length ?? 0,
    balanced: snapshot?.themes.filter((t) => t.category === 'balanced').length ?? 0,
    rising: snapshot?.themes.filter((t) => t.pricingPower === 'rising').length ?? 0,
  };

  // Filtered themes
  const filteredThemes = (snapshot?.themes ?? []).filter((t) => {
    if (activeFilter === 'all') {
      // no category filter
    } else if (activeFilter === 'rising' || activeFilter === 'collapsing') {
      if (t.pricingPower !== activeFilter) return false;
    } else {
      if (t.category !== activeFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.commodity.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.beneficiaries.some(
          (s) =>
            s.symbol.toLowerCase().includes(q) ||
            s.company.toLowerCase().includes(q)
        ) ||
        t.adverselyAffected.some(
          (s) =>
            s.symbol.toLowerCase().includes(q) ||
            s.company.toLowerCase().includes(q)
        )
      );
    }
    return true;
  });

  const filterTabs: { label: string; value: FilterCategory; count?: number }[] = [
    { label: 'All', value: 'all', count: snapshot?.themes.length },
    { label: 'Shortage', value: 'shortage', count: counts.shortage },
    { label: 'Oversupply', value: 'oversupply', count: counts.oversupply },
    { label: 'Emerging', value: 'emerging', count: counts.emerging },
    { label: 'Rising Pricing', value: 'rising', count: counts.rising },
  ];

  const filterTabColor = (value: FilterCategory) => {
    switch (value) {
      case 'shortage': return 'text-red-600';
      case 'oversupply': return 'text-blue-600';
      case 'emerging': return 'text-violet-600';
      case 'rising': return 'text-emerald-600';
      default: return 'text-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Supply-Demand Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              AI-generated commodity & sector supply/demand themes for Indian equities
            </p>
            {snapshot && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground">
                  Last refreshed:{' '}
                  <span className="font-medium text-foreground">
                    {getISTTimeString(snapshot.generatedAt)} IST
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ({Math.round(snapshot.elapsedMs / 1000)}s)
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-muted/50 text-muted-foreground border-border/60">
                  <Zap className="h-2.5 w-2.5" />
                  qwen2.5:14b
                </span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                onClick={runAnalysis}
                disabled={loading || !canRun}
                size="sm"
                className="h-8 text-xs font-medium gap-1.5"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                {loading ? 'Analysing…' : 'Run Analysis'}
              </Button>
            </div>

            {/* Time gate notice */}
            {!canRefreshNow() && !forceMode && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
                <Clock className="h-3 w-3" />
                <span>Available after 1:00 PM IST ({formatCountdown(countdown)} remaining)</span>
              </div>
            )}

            {/* Force override */}
            {!canRefreshNow() && (
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceMode}
                  onChange={(e) => setForceMode(e.target.checked)}
                  className="h-3 w-3 accent-emerald-600"
                />
                Override time gate
              </label>
            )}

            {/* Force refresh link */}
            {snapshot && canRefreshNow() && !forceMode && !loading && (
              <button
                onClick={() => {
                  setForceMode(true);
                  setTimeout(() => runAnalysis(), 0);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Force refresh
              </button>
            )}
          </div>
        </div>

        {/* ── Error banner ───────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Error: </span>
              {error}
              {error.toLowerCase().includes('fetch') ||
              error.toLowerCase().includes('refused') ||
              error.toLowerCase().includes('ollama') ? (
                <p className="mt-1 text-[11px] text-red-500/80">
                  Make sure Ollama is running locally:{' '}
                  <code className="font-mono bg-red-500/10 px-1 rounded">
                    ollama serve
                  </code>{' '}
                  and model is pulled:{' '}
                  <code className="font-mono bg-red-500/10 px-1 rounded">
                    ollama pull qwen2.5:14b
                  </code>
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Summary strip ──────────────────────────────────────────────── */}
        {snapshot && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(
              [
                { label: 'Shortage', value: counts.shortage, color: 'text-red-600', filter: 'shortage' as FilterCategory },
                { label: 'Oversupply', value: counts.oversupply, color: 'text-blue-600', filter: 'oversupply' as FilterCategory },
                { label: 'Emerging', value: counts.emerging, color: 'text-violet-600', filter: 'emerging' as FilterCategory },
                { label: 'Balanced', value: counts.balanced, color: 'text-slate-500', filter: 'balanced' as FilterCategory },
                { label: 'Rising Pricing', value: counts.rising, color: 'text-emerald-600', filter: 'rising' as FilterCategory },
              ] as const
            ).map((tile) => (
              <button
                key={tile.label}
                onClick={() =>
                  setActiveFilter((prev) =>
                    prev === tile.filter ? 'all' : tile.filter
                  )
                }
                className={cn(
                  'rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-border/80 hover:bg-muted/40',
                  activeFilter === tile.filter && 'ring-1 ring-emerald-500/50 border-emerald-500/30'
                )}
              >
                <div className={cn('text-xl font-bold tabular-nums', tile.color)}>
                  {tile.value}
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  {tile.label}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Filter tabs + search ────────────────────────────────────────── */}
        {snapshot && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {filterTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveFilter(tab.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all whitespace-nowrap border',
                    activeFilter === tab.value
                      ? cn(
                          'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                        )
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <span className={activeFilter === tab.value ? '' : filterTabColor(tab.value)}>
                    {tab.label}
                  </span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={cn(
                        'text-[10px] rounded-full px-1.5 py-0.5 font-semibold tabular-nums',
                        activeFilter === tab.value
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 sm:max-w-xs ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search commodity, ticker…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 h-8 text-[12px] rounded-md border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30"
              />
            </div>
          </div>
        )}

        {/* ── Loading skeletons ───────────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!loading && !snapshot && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center border border-border">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">No analysis available</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {canRefreshNow()
                  ? 'Click "Run Analysis" to generate today’s supply-demand intelligence.'
                  : `Analysis is available after 1:00 PM IST. ${formatCountdown(countdown)} remaining.`}
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 max-w-md text-left">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Requires local Ollama</p>
                <p className="mt-0.5 text-amber-600/80">
                  Start Ollama with{' '}
                  <code className="font-mono bg-amber-500/10 px-1 rounded">ollama serve</code>{' '}
                  and pull the model:{' '}
                  <code className="font-mono bg-amber-500/10 px-1 rounded">ollama pull qwen2.5:14b</code>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty search result ─────────────────────────────────────────── */}
        {!loading && snapshot && filteredThemes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 space-y-2 text-center">
            <Search className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No themes match your filter.</p>
            <button
              onClick={() => { setActiveFilter('all'); setSearchQuery(''); }}
              className="text-xs text-emerald-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* ── Theme grid ──────────────────────────────────────────────────── */}
        {!loading && filteredThemes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredThemes.map((theme) => (
              <ThemeCard key={theme.id} theme={theme} />
            ))}
          </div>
        )}

        {/* ── Footer disclaimer ───────────────────────────────────────────── */}
        <p className="text-center text-[10px] text-muted-foreground/60 pt-2 pb-4 leading-relaxed">
          AI-generated analysis — not investment advice. All themes are model-inferred; verify
          with primary sources before making any investment decisions.
        </p>

      </div>
    </div>
  );
}
