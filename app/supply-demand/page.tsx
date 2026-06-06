'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  TrendingUp, TrendingDown, RefreshCw, ChevronDown, ChevronUp,
  Search, Clock, AlertCircle, Zap, Shield, Upload, ArrowUp,
  ArrowDown, Minus, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SupplyDemandSnapshot } from '@/lib/supply-demand-types';
import type { SupplyDemandTracker, TrackedStory, StoryStatus, StoryUpdate } from '@/lib/supply-demand-tracker';
import { todayIST } from '@/lib/supply-demand-tracker';

// ── localStorage ──────────────────────────────────────────────────────────────
const SNAPSHOT_KEY = 'sd-snapshot';
const DATE_KEY     = 'sd-date';

function canRefreshNow(): boolean {
  const istMins = (Math.floor(Date.now() / 60000) + 330) % 1440;
  return istMins >= 780;
}
function minutesUntil1PM(): number {
  const istMins = (Math.floor(Date.now() / 60000) + 330) % 1440;
  return istMins >= 780 ? 0 : 780 - istMins;
}
function formatCountdown(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function getISTTimeString(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}
function daysSince(dateStr: string): number {
  const ms = new Date(todayIST()).getTime() - new Date(dateStr).getTime();
  return Math.floor(ms / 86400000);
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<StoryStatus, { label: string; color: string; icon: React.ReactNode }> = {
  new:        { label: 'New',        color: 'bg-violet-500/10 text-violet-600 border-violet-500/20',  icon: <Zap className="h-2.5 w-2.5" /> },
  escalating: { label: 'Escalating', color: 'bg-red-500/10 text-red-600 border-red-500/20',           icon: <ArrowUp className="h-2.5 w-2.5" /> },
  easing:     { label: 'Easing',     color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: <ArrowDown className="h-2.5 w-2.5" /> },
  stable:     { label: 'Stable',     color: 'bg-slate-500/10 text-slate-500 border-slate-400/20',     icon: <Minus className="h-2.5 w-2.5" /> },
  resolved:   { label: 'Resolved',   color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',        icon: <Shield className="h-2.5 w-2.5" /> },
};

const CATEGORY_COLOR: Record<string, string> = {
  shortage:  'bg-red-500/10 text-red-600 border-red-500/20',
  oversupply:'bg-blue-500/10 text-blue-600 border-blue-500/20',
  emerging:  'bg-violet-500/10 text-violet-600 border-violet-500/20',
  balanced:  'bg-slate-500/10 text-slate-500 border-slate-400/20',
};

function ConfidenceDelta({ updates }: { updates: StoryUpdate[] }) {
  if (updates.length < 2) return null;
  const delta = updates[0].confidence - updates[1].confidence;
  if (delta === 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold',
      delta > 0 ? 'text-red-500' : 'text-emerald-600'
    )}>
      {delta > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {Math.abs(delta)}
    </span>
  );
}

// ── Update timeline ───────────────────────────────────────────────────────────
function UpdateTimeline({ updates }: { updates: StoryUpdate[] }) {
  return (
    <div className="mt-3 space-y-3 border-l-2 border-border/60 pl-4">
      {updates.map((u, i) => (
        <div key={u.date + i} className="relative">
          <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full border-2 border-background bg-border" />
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold text-foreground">{u.date}</span>
            <span className={cn('inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
              CATEGORY_COLOR[u.category] ?? CATEGORY_COLOR.balanced
            )}>
              {u.category}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Confidence: <span className="font-semibold text-foreground">{u.confidence}%</span>
              {i < updates.length - 1 && (
                <span className={cn('ml-1', updates[i].confidence > updates[i + 1].confidence ? 'text-red-500' : 'text-emerald-600')}>
                  ({updates[i].confidence > updates[i + 1].confidence ? '+' : ''}{updates[i].confidence - updates[i + 1].confidence})
                </span>
              )}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{u.description}</p>
          {u.sources.length > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{u.sources.join(' · ')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Story card ────────────────────────────────────────────────────────────────
function StoryCard({ story }: { story: TrackedStory }) {
  const [expanded, setExpanded] = useState(false);
  const latest = story.updates[0];
  const statusCfg = STATUS_CONFIG[story.status];
  const age = daysSince(story.firstSeen);

  return (
    <Card className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3 pt-4 px-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base text-foreground leading-tight">{story.commodity}</h3>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {/* Status */}
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', statusCfg.color)}>
                {statusCfg.icon}{statusCfg.label}
              </span>
              {/* Category */}
              <span className={cn('inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border', CATEGORY_COLOR[latest?.category ?? 'balanced'])}>
                {latest?.category}
              </span>
              {/* Pricing power */}
              <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full border',
                latest?.pricingPower === 'rising' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                latest?.pricingPower === 'collapsing' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                'bg-slate-500/10 text-slate-500 border-slate-400/20'
              )}>
                {latest?.pricingPower === 'rising' ? <TrendingUp className="h-2.5 w-2.5" /> : latest?.pricingPower === 'collapsing' ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                {latest?.pricingPower}
              </span>
              {/* Time horizon */}
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md border border-border/60">
                <Clock className="h-2.5 w-2.5" />{story.timeHorizon}
              </span>
            </div>
          </div>

          {/* Confidence */}
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-lg font-bold text-foreground">{latest?.confidence ?? 0}%</span>
              <ConfidenceDelta updates={story.updates} />
            </div>
            <p className="text-[10px] text-muted-foreground">confidence</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all',
              (latest?.confidence ?? 0) >= 70 ? 'bg-emerald-500' :
              (latest?.confidence ?? 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
            )}
            style={{ width: `${latest?.confidence ?? 0}%` }}
          />
        </div>

        {/* Update meta */}
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Activity className="h-2.5 w-2.5" />
            {story.updates.length} update{story.updates.length !== 1 ? 's' : ''}
            {age > 0 ? ` over ${age} day${age !== 1 ? 's' : ''}` : ' today'}
          </span>
          <span>First seen: <span className="text-foreground font-medium">{story.firstSeen}</span></span>
          <span>Updated: <span className="text-foreground font-medium">{story.lastUpdated}</span></span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Latest description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{latest?.description}</p>

        {/* Historical analog */}
        {story.historicalAnalog && (
          <blockquote className="border-l-2 border-amber-400/60 pl-3 text-xs italic text-muted-foreground leading-relaxed">
            {story.historicalAnalog}
          </blockquote>
        )}

        {/* Beneficiaries + Risks */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Beneficiaries</span>
            </div>
            <div className="space-y-1.5">
              {story.beneficiaries.map(s => (
                <div key={s.symbol} className="rounded-md border border-emerald-500/15 bg-emerald-500/5 px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                      s.impact === 'high' ? 'bg-red-500' : s.impact === 'medium' ? 'bg-amber-400' : 'bg-slate-400'
                    )} />
                    <span className="text-[11px] font-bold text-emerald-700">{s.symbol}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{s.rationale}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingDown className="h-3 w-3 text-red-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">At Risk</span>
            </div>
            <div className="space-y-1.5">
              {story.adverselyAffected.map(s => (
                <div key={s.symbol} className="rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                      s.impact === 'high' ? 'bg-red-500' : s.impact === 'medium' ? 'bg-amber-400' : 'bg-slate-400'
                    )} />
                    <span className="text-[11px] font-bold text-red-700">{s.symbol}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{s.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Update history toggle */}
        {story.updates.length > 1 && (
          <>
            <button
              onClick={() => setExpanded(p => !p)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide' : 'Show'} update history ({story.updates.length} entries)
            </button>
            {expanded && <UpdateTimeline updates={story.updates} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-1.5 flex-1">
          <div className="h-4 bg-muted rounded w-2/5" />
          <div className="flex gap-1.5"><div className="h-4 bg-muted rounded-full w-16" /><div className="h-4 bg-muted rounded-full w-14" /></div>
        </div>
        <div className="h-7 bg-muted rounded w-12" />
      </div>
      <div className="h-1 bg-muted rounded-full w-full" />
      <div className="space-y-1.5"><div className="h-3 bg-muted rounded w-full" /><div className="h-3 bg-muted rounded w-4/5" /></div>
      <div className="grid grid-cols-2 gap-2"><div className="h-16 bg-muted rounded" /><div className="h-16 bg-muted rounded" /></div>
    </div>
  );
}

// ── Filter types ──────────────────────────────────────────────────────────────
type FilterKey = 'all' | 'shortage' | 'oversupply' | 'emerging' | 'escalating' | 'new';

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SupplyDemandPage() {
  const [tracker,    setTracker]   = useState<SupplyDemandTracker | null>(null);
  const [loading,    setLoading]   = useState(false);
  const [hydrating,  setHydrating] = useState(true);
  const [error,      setError]     = useState<string | null>(null);
  const [filter,     setFilter]    = useState<FilterKey>('all');
  const [search,     setSearch]    = useState('');
  const [forceMode,  setForceMode] = useState(false);
  const [countdown,  setCountdown] = useState(minutesUntil1PM());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown ticker
  useEffect(() => {
    if (canRefreshNow()) return;
    timerRef.current = setInterval(() => {
      const m = minutesUntil1PM();
      setCountdown(m);
      if (m === 0 && timerRef.current) clearInterval(timerRef.current);
    }, 30000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Load tracker on mount
  useEffect(() => {
    (async () => {
      setHydrating(true);
      try {
        const res = await fetch('/api/supply-demand/tracker', { cache: 'no-store' });
        if (res.ok) {
          const data: SupplyDemandTracker = await res.json();
          if (data.stories.length > 0) { setTracker(data); setHydrating(false); return; }
        }
      } catch { /* fall through */ }

      // Fallback: try blob snapshot and fake-load it as a tracker
      try {
        const snap = await fetch('/api/supply-demand/snapshot', { cache: 'no-store' });
        if (snap.ok) {
          const data: SupplyDemandSnapshot = await snap.json();
          if (Array.isArray(data.themes) && data.themes.length > 0) {
            // Wrap as minimal tracker for display
            const today = todayIST();
            setTracker({
              stories: data.themes.map((t, i) => ({
                id: t.id ?? `theme-${i}`,
                commodity: t.commodity,
                timeHorizon: t.timeHorizon,
                beneficiaries: t.beneficiaries,
                adverselyAffected: t.adverselyAffected,
                historicalAnalog: t.historicalAnalog,
                firstSeen: today,
                lastUpdated: today,
                status: 'new' as const,
                updates: [{
                  date: today,
                  description: t.description,
                  confidence: t.confidence,
                  category: t.category,
                  pricingPower: t.pricingPower,
                  sources: t.sources,
                }],
              })),
              lastRun: data.generatedAt,
              totalRuns: 1,
            });
          }
        }
      } catch { /* nothing available */ }

      setHydrating(false);
    })();
  }, []);

  const canRun = forceMode || canRefreshNow();

  const runAnalysis = useCallback(async () => {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/supply-demand', { cache: 'no-store' });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `API returned ${res.status}`);
      }
      const data: SupplyDemandSnapshot = await res.json();
      // Save snapshot to localStorage
      try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
        localStorage.setItem(DATE_KEY, todayIST());
      } catch { /* full */ }
      // Reload tracker
      const tr = await fetch('/api/supply-demand/tracker', { cache: 'no-store' });
      if (tr.ok) setTracker(await tr.json());
      setForceMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [canRun, forceMode]);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed: SupplyDemandSnapshot = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(parsed.themes) || parsed.themes.length === 0) {
          setError('Invalid snapshot file.'); return;
        }
        try {
          localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(parsed));
          localStorage.setItem(DATE_KEY, todayIST());
        } catch { /* full */ }
        // Reload tracker after file load
        const tr = await fetch('/api/supply-demand/tracker', { cache: 'no-store' });
        if (tr.ok) setTracker(await tr.json());
        setError(null);
      } catch { setError('Could not parse file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // Filter + search
  const filteredStories = (tracker?.stories ?? []).filter(s => {
    const latest = s.updates[0];
    if (filter === 'shortage'   && latest?.category !== 'shortage')   return false;
    if (filter === 'oversupply' && latest?.category !== 'oversupply') return false;
    if (filter === 'emerging'   && latest?.category !== 'emerging')   return false;
    if (filter === 'escalating' && s.status !== 'escalating')          return false;
    if (filter === 'new'        && s.status !== 'new')                  return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.commodity.toLowerCase().includes(q) ||
        s.beneficiaries.some(b => b.symbol.toLowerCase().includes(q) || b.company.toLowerCase().includes(q)) ||
        s.adverselyAffected.some(b => b.symbol.toLowerCase().includes(q) || b.company.toLowerCase().includes(q)) ||
        latest?.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stories = tracker?.stories ?? [];
  const counts = {
    shortage:   stories.filter(s => s.updates[0]?.category === 'shortage').length,
    oversupply: stories.filter(s => s.updates[0]?.category === 'oversupply').length,
    emerging:   stories.filter(s => s.updates[0]?.category === 'emerging').length,
    escalating: stories.filter(s => s.status === 'escalating').length,
    new:        stories.filter(s => s.status === 'new').length,
  };

  const filterTabs: { label: string; key: FilterKey; count?: number; color?: string }[] = [
    { label: 'All',        key: 'all',        count: stories.length },
    { label: 'Shortage',   key: 'shortage',   count: counts.shortage,   color: 'text-red-600' },
    { label: 'Oversupply', key: 'oversupply', count: counts.oversupply, color: 'text-blue-600' },
    { label: 'Emerging',   key: 'emerging',   count: counts.emerging,   color: 'text-violet-600' },
    { label: 'Escalating', key: 'escalating', count: counts.escalating, color: 'text-red-500' },
    { label: 'New',        key: 'new',        count: counts.new,        color: 'text-violet-600' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Supply-Demand Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Persistent tracker of global supply/demand developments and their impact on Indian equities
            </p>
            {tracker && tracker.lastRun && (
              <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-muted-foreground">
                <span>{tracker.stories.length} stories tracked</span>
                <span>·</span>
                <span>{tracker.totalRuns} analysis run{tracker.totalRuns !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>Last run: <span className="text-foreground font-medium">{getISTTimeString(tracker.lastRun)} IST</span></span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {/* Cloud run — only useful when GROQ_API_KEY is configured on Vercel */}
              <Button
                onClick={runAnalysis}
                disabled={loading || !canRun}
                size="sm"
                variant="outline"
                className="h-8 text-xs font-medium gap-1.5"
                title="Runs analysis via Groq cloud API. Requires GROQ_API_KEY in Vercel env vars."
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                {loading ? 'Analysing...' : 'Run via Cloud'}
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileLoad} />
              <Button variant="outline" size="sm" className="h-8 text-xs font-medium gap-1.5"
                onClick={() => fileInputRef.current?.click()} disabled={loading}>
                <Upload className="h-3.5 w-3.5" />
                Load file
              </Button>
            </div>
            {/* Local Ollama instruction */}
            <p className="text-[10px] text-muted-foreground text-right">
              Local Ollama:{' '}
              <code className="font-mono bg-muted px-1 rounded">node scripts/run-supply-demand.mjs --upload</code>
            </p>

            {!canRefreshNow() && !forceMode && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
                <Clock className="h-3 w-3" />
                <span>Available after 1:00 PM IST ({formatCountdown(countdown)} remaining)</span>
              </div>
            )}
            {!canRefreshNow() && (
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={forceMode} onChange={e => setForceMode(e.target.checked)}
                  className="h-3 w-3 accent-emerald-600" />
                Override time gate
              </label>
            )}
            {tracker && canRefreshNow() && !forceMode && !loading && (
              <button onClick={() => { setForceMode(true); setTimeout(runAnalysis, 0); }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                Force refresh
              </button>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (() => {
          const isNoProvider = error.toLowerCase().includes('no llm provider') || error.toLowerCase().includes('groq_api_key');
          const hasPriorData  = (tracker?.stories.length ?? 0) > 0;
          // Soft amber notice when cloud key is missing but tracker already has data
          if (isNoProvider && hasPriorData) return (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Cloud analysis unavailable (no GROQ_API_KEY). To update, run locally:{' '}
                <code className="font-mono bg-amber-500/10 px-1 rounded">node scripts/run-supply-demand.mjs --upload</code>
              </span>
            </div>
          );
          return (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Error: </span>{error}
                {isNoProvider && (
                  <p className="mt-1 text-[11px] text-red-500/80">
                    Add <code className="font-mono bg-red-500/10 px-1 rounded">GROQ_API_KEY</code> to Vercel env vars (free at console.groq.com),
                    or run locally: <code className="font-mono bg-red-500/10 px-1 rounded">node scripts/run-supply-demand.mjs --upload</code>
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Summary tiles ── */}
        {tracker && tracker.stories.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {([
              { label: 'Shortage',   val: counts.shortage,   color: 'text-red-600',     f: 'shortage' as FilterKey },
              { label: 'Oversupply', val: counts.oversupply, color: 'text-blue-600',    f: 'oversupply' as FilterKey },
              { label: 'Emerging',   val: counts.emerging,   color: 'text-violet-600',  f: 'emerging' as FilterKey },
              { label: 'Escalating', val: counts.escalating, color: 'text-red-500',     f: 'escalating' as FilterKey },
              { label: 'New',        val: counts.new,        color: 'text-violet-600',  f: 'new' as FilterKey },
              { label: 'Total',      val: stories.length,    color: 'text-foreground',  f: 'all' as FilterKey },
            ]).map(tile => (
              <button key={tile.label}
                onClick={() => setFilter(p => p === tile.f ? 'all' : tile.f)}
                className={cn('rounded-lg border border-border bg-card px-3 py-2 text-left transition-all hover:bg-muted/40',
                  filter === tile.f && 'ring-1 ring-emerald-500/50 border-emerald-500/30'
                )}>
                <div className={cn('text-xl font-bold tabular-nums', tile.color)}>{tile.val}</div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5">{tile.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── Filter tabs + search ── */}
        {tracker && tracker.stories.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {filterTabs.map(tab => (
                <button key={tab.key} onClick={() => setFilter(tab.key)}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all whitespace-nowrap border',
                    filter === tab.key
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}>
                  <span className={filter === tab.key ? '' : (tab.color ?? '')}>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={cn('text-[10px] rounded-full px-1.5 py-0.5 font-semibold tabular-nums',
                      filter === tab.key ? 'bg-emerald-500/20 text-emerald-700' : 'bg-muted text-muted-foreground'
                    )}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative flex-1 sm:max-w-xs ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="Search commodity, ticker..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 h-8 text-[12px] rounded-md border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
            </div>
          </div>
        )}

        {/* ── Skeletons ── */}
        {(loading || hydrating) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !hydrating && (!tracker || tracker.stories.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center border border-border">
              <Activity className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">No stories tracked yet</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {canRefreshNow()
                  ? 'Click Update Analysis to start tracking supply-demand developments.'
                  : `Available after 1:00 PM IST. ${formatCountdown(countdown)} remaining.`}
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 max-w-md text-left">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Three ways to populate the tracker</p>
                <p className="mt-0.5 text-amber-600/80">
                  <strong>1. Cloud:</strong> Add <code className="font-mono bg-amber-500/10 px-1 rounded">GROQ_API_KEY</code> to Vercel, then click Update Analysis.
                </p>
                <p className="mt-1 text-amber-600/80">
                  <strong>2. Local + upload:</strong> <code className="font-mono bg-amber-500/10 px-1 rounded">node scripts/run-supply-demand.mjs --upload</code>
                </p>
                <p className="mt-1 text-amber-600/80">
                  <strong>3. Load file:</strong> Run script without <code className="font-mono bg-amber-500/10 px-1 rounded">--upload</code>, then click Load file.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── No search results ── */}
        {!loading && !hydrating && tracker && tracker.stories.length > 0 && filteredStories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 space-y-2 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No stories match your filter.</p>
            <button onClick={() => { setFilter('all'); setSearch(''); }}
              className="text-xs text-emerald-600 hover:underline">Clear filters</button>
          </div>
        )}

        {/* ── Story grid ── */}
        {!loading && !hydrating && filteredStories.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStories.map(story => <StoryCard key={story.id} story={story} />)}
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground/60 pt-2 pb-4">
          AI-generated analysis. Not investment advice. Verify with primary sources before acting.
        </p>
      </div>
    </div>
  );
}
