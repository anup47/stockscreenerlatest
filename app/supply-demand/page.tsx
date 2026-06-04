'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  RefreshCw,
  BarChart2,
  Zap,
  Shield,
  Info,
} from 'lucide-react';
import type { SupplyDemandSnapshot, SupplyDemandTheme, Category } from '@/lib/supply-demand-types';

const SNAPSHOT_KEY = 'sd-snapshot';
const DATE_KEY = 'sd-date';

function todayISO(): string {
  const now = new Date();
  const istMs = now.getTime() + 330 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function canRefreshNow(): boolean {
  const nowUtcMinutes = Math.floor(Date.now() / 60_000) % 1440;
  const istMinutes = (nowUtcMinutes + 330) % 1440;
  return istMinutes >= 780;
}

function formatISTTime(iso: string): string {
  const d = new Date(iso);
  const istMs = d.getTime() + 330 * 60 * 1000;
  const ist = new Date(istMs);
  return ist.toISOString().replace('T', ' ').slice(0, 16) + ' IST';
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  shortage: 'Shortage',
  oversupply: 'Oversupply',
  emerging: 'Emerging',
  balanced: 'Balanced',
};

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  shortage: 'bg-red-500/15 text-red-700 border-red-500/30',
  oversupply: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  emerging: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
  balanced: 'bg-slate-500/15 text-slate-600 border-slate-400/30',
};

function PricingPowerIcon({ value }: { value: string }) {
  if (value === 'rising') return <Zap className="w-3 h-3 text-emerald-600" />;
  if (value === 'falling') return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Shield className="w-3 h-3 text-slate-400" />;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const cls =
    confidence >= 70
      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
      : confidence >= 50
      ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
      : 'bg-red-500/15 text-red-700 border-red-500/30';
  return (
    <Badge variant="outline" className={cn('text-xs font-semibold tabular-nums', cls)}>
      {confidence}%
    </Badge>
  );
}

function ThemeCard({ theme }: { theme: SupplyDemandTheme }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="ring-1 ring-foreground/8 hover:ring-foreground/15 transition-shadow gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <span className="font-bold text-base leading-tight">{theme.commodity}</span>
          <ConfidenceBadge confidence={theme.confidence} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Badge
            variant="outline"
            className={cn('text-xs', CATEGORY_BADGE_CLASS[theme.category] ?? CATEGORY_BADGE_CLASS.balanced)}
          >
            {CATEGORY_LABELS[theme.category] ?? theme.category}
          </Badge>
          {theme.pricingPower && (
            <Badge variant="outline" className="text-xs flex items-center gap-0.5 border-muted text-muted-foreground">
              <PricingPowerIcon value={theme.pricingPower} />
              <span className="capitalize">{theme.pricingPower}</span>
            </Badge>
          )}
          {theme.timeHorizon && (
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/70">
              <Clock className="w-3 h-3" />
              {theme.timeHorizon}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2.5">
        <p className="text-sm text-muted-foreground leading-relaxed">{theme.description}</p>

        {theme.historicalAnalog && (
          <p className="text-xs italic text-muted-foreground/70 border-l-2 border-muted pl-2">
            {theme.historicalAnalog}
          </p>
        )}

        {theme.beneficiaries && theme.beneficiaries.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-emerald-700 mb-1">Beneficiaries</p>
            <div className="flex flex-wrap gap-1.5">
              {theme.beneficiaries.map((s) => (
                <span
                  key={s.symbol}
                  className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 rounded-md px-2 py-0.5 text-xs inline-flex items-center gap-1"
                  title={s.rationale}
                >
                  <TrendingUp className="w-2.5 h-2.5" />
                  <span className="font-semibold">{s.symbol}</span>
                  <span className="text-emerald-700/70">· {s.company}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {theme.adverselyAffected && theme.adverselyAffected.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-600 mb-1">Risks</p>
            <div className="flex flex-wrap gap-1.5">
              {theme.adverselyAffected.map((s) => (
                <span
                  key={s.symbol}
                  className="bg-red-500/10 border border-red-500/20 text-red-700 rounded-md px-2 py-0.5 text-xs inline-flex items-center gap-1"
                  title={s.rationale}
                >
                  <TrendingDown className="w-2.5 h-2.5" />
                  <span className="font-semibold">{s.symbol}</span>
                  <span className="text-red-600/70">· {s.company}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {theme.sources && theme.sources.length > 0 && (
          <div>
            {expanded ? (
              <div className="space-y-0.5">
                {theme.sources.map((src, i) => (
                  <p key={i} className="text-xs text-muted-foreground/50 truncate">
                    {src}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 truncate">
                {theme.sources.join(', ')}
              </p>
            )}
            {theme.sources.length > 1 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-muted-foreground/40 hover:text-muted-foreground mt-0.5 underline underline-offset-2"
              >
                {expanded ? 'Hide sources' : 'View details'}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type FilterTab = 'all' | Category;

export default function SupplyDemandPage() {
  const [snapshot, setSnapshot] = useState<SupplyDemandSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [forceMode, setForceMode] = useState(false);

  useEffect(() => {
    try {
      const storedDate = localStorage.getItem(DATE_KEY);
      if (storedDate === todayISO()) {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (raw) {
          const parsed: SupplyDemandSnapshot = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.themes)) {
            setSnapshot(parsed);
          }
        }
      }
    } catch {
      try {
        localStorage.removeItem(SNAPSHOT_KEY);
        localStorage.removeItem(DATE_KEY);
      } catch {}
    }
  }, []);

  const hasTodayData = Boolean(
    snapshot && (() => {
      try {
        return localStorage.getItem(DATE_KEY) === todayISO();
      } catch {
        return false;
      }
    })()
  );

  const canRun = forceMode || canRefreshNow();

  async function runAnalysis() {
    if (!canRun) return;
    if (hasTodayData && !forceMode) {
      const ok = window.confirm("Re-generate today's supply-demand analysis?");
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/supply-demand', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const json: SupplyDemandSnapshot = await res.json();
      try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(json));
        localStorage.setItem(DATE_KEY, todayISO());
      } catch {}
      setSnapshot(json);
      setForceMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const filteredThemes =
    snapshot?.themes.filter((t) => filter === 'all' || t.category === filter) ?? [];

  const categoryCounts = snapshot
    ? ((['shortage', 'oversupply', 'emerging', 'balanced'] as const).reduce(
        (acc, cat) => {
          acc[cat] = snapshot.themes.filter((t) => t.category === cat).length;
          return acc;
        },
        {} as Record<string, number>
      ))
    : {};

  const risingPricingPower = snapshot
    ? snapshot.themes.filter((t) => t.pricingPower === 'rising').length
    : 0;

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'shortage', label: 'Shortage' },
    { key: 'oversupply', label: 'Oversupply' },
    { key: 'emerging', label: 'Emerging' },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-bold tracking-tight">Supply-Demand Intelligence</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-generated commodity supply-demand themes with equity impact mapping
            </p>
            {snapshot && (
              <p className="text-xs text-muted-foreground/60">
                Last refreshed: {formatISTTime(snapshot.generatedAt)}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <Button
              onClick={runAnalysis}
              disabled={loading || (!canRun)}
              title={!canRun ? 'Analysis available after 1:00 PM IST. Enable force override below.' : undefined}
              className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>

            {!canRefreshNow() && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceMode}
                  onChange={(e) => setForceMode(e.target.checked)}
                  className="accent-emerald-600 w-3.5 h-3.5"
                />
                Override time gate
              </label>
            )}

            {snapshot && !forceMode && (
              <button
                onClick={() => setForceMode(true)}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2"
              >
                Force refresh
              </button>
            )}
          </div>
        </div>

        {/* Meta row */}
        {snapshot && (
          <div className="text-xs text-muted-foreground/60 flex gap-4 flex-wrap border-b border-border pb-3">
            <span>Generated: {formatISTTime(snapshot.generatedAt)}</span>
            <span>Themes: {snapshot.themes.length}</span>
            <span>Model: claude-sonnet-4-6</span>
            {risingPricingPower > 0 && (
              <span className="text-emerald-600">Rising pricing power: {risingPricingPower}</span>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <div className="flex justify-between">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-4 w-10 rounded bg-muted" />
                </div>
                <div className="flex gap-2">
                  <div className="h-3 w-16 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-4/5 rounded bg-muted" />
                  <div className="h-3 w-3/5 rounded bg-muted" />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="h-5 w-14 rounded-md bg-muted" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!snapshot && !loading && (
          <div className="rounded-lg border border-border bg-card p-12 text-center space-y-3">
            <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-semibold text-base">No analysis available</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {!canRefreshNow() && !forceMode
                ? 'Analysis available after 1:00 PM IST. Enable force override to generate now.'
                : 'Click Run Analysis to generate today’s supply-demand intelligence.'}
            </p>
            {!canRefreshNow() && !forceMode && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-amber-600">
                <Info className="w-3.5 h-3.5" />
                Markets close at 3:30 PM IST; analysis is most meaningful post-session.
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        {snapshot && !loading && (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['shortage', 'oversupply', 'emerging', 'balanced'] as const).map((cat) => (
                <div
                  key={cat}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-center"
                >
                  <p className="text-xs text-muted-foreground capitalize mb-1">{cat}</p>
                  <p
                    className={cn(
                      'text-2xl font-bold font-mono',
                      cat === 'shortage'
                        ? 'text-red-600'
                        : cat === 'oversupply'
                        ? 'text-blue-600'
                        : cat === 'emerging'
                        ? 'text-violet-600'
                        : 'text-slate-500'
                    )}
                  >
                    {categoryCounts[cat] ?? 0}
                  </p>
                </div>
              ))}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 border-b border-border pb-0">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    filter === tab.key
                      ? 'border-emerald-500 text-emerald-600 bg-emerald-500/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {tab.label}
                  {tab.key !== 'all' && (
                    <span className="ml-1.5 text-xs opacity-60">
                      {categoryCounts[tab.key] ?? 0}
                    </span>
                  )}
                  {tab.key === 'all' && (
                    <span className="ml-1.5 text-xs opacity-60">{snapshot.themes.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Theme cards */}
            {filteredThemes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredThemes.map((theme) => (
                  <ThemeCard key={theme.id ?? theme.commodity} theme={theme} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No themes match the selected filter.
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/40 pt-4 border-t border-border">
          AI-generated analysis for informational purposes only. Not investment advice. Always verify
          with primary sources before making investment decisions.
        </p>
      </div>
    </main>
  );
}
