'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Search, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Target, ShieldAlert, Zap, BarChart2, Activity, LayoutGrid,
  Clock, Layers,
} from 'lucide-react';
import type { PhantomFlowResult, FVG, OrderBlock, EqualLevel, VolumeNode } from '@/lib/phantom-flow-engine';

// ── Quick symbol chips ────────────────────────────────────────────────────────
const QUICK_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'HDFCBANK', 'TCS', 'INFY', 'ICICIBANK', 'AXISBANK'];

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ── Market hours (IST 9:15–15:30, Mon–Fri) ───────────────────────────────────
function isMarketOpen(): boolean {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const utc     = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist     = new Date(utc + 5.5 * 3_600_000);
  const day     = ist.getDay(); // 0=Sun,6=Sat
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins <= 930; // 9:15=555, 15:30=930
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function trendColor(t: string) {
  if (t === 'Bullish')  return 'text-emerald-600';
  if (t === 'Bearish')  return 'text-red-500';
  return 'text-amber-600';
}
function trendBg(t: string) {
  if (t === 'Bullish')  return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
  if (t === 'Bearish')  return 'bg-red-500/10 text-red-700 border-red-500/30';
  return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
}
function zoneBg(z: string) {
  if (z === 'Premium')  return 'bg-red-500/10 text-red-700 border-red-400/30';
  if (z === 'Discount') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
  return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
}
function rsiColor(rsi: number) {
  if (rsi > 70) return 'text-red-600 bg-red-50 border-red-300';
  if (rsi < 30) return 'text-emerald-600 bg-emerald-50 border-emerald-300';
  if (rsi > 55) return 'text-sky-600 bg-sky-50 border-sky-300';
  return 'text-muted-foreground bg-muted border-border';
}
function scoreColor(s: number) {
  if (s >= 70) return 'bg-emerald-500';
  if (s >= 50) return 'bg-sky-500';
  if (s >= 30) return 'bg-amber-400';
  return 'bg-slate-400';
}
function scoreText(s: number) {
  if (s >= 70) return 'text-emerald-600';
  if (s >= 50) return 'text-sky-600';
  if (s >= 30) return 'text-amber-500';
  return 'text-slate-400';
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  title, icon, open, onToggle, children,
}: {
  id?: string; title: string; icon: ReactNode;
  open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border px-4 py-4">{children}</div>}
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, label }: { score: number; label?: string }) {
  return (
    <div className="space-y-1">
      {label && <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span className="font-semibold">{score}/100</span></div>}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', scoreColor(score))} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

// ── Condition row ─────────────────────────────────────────────────────────────
function CondRow({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {met
        ? <CheckCircle2 className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
        : <XCircle      className="size-3.5 text-red-400 mt-0.5 shrink-0" />}
      <span className={met ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 bg-muted rounded-xl" />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-14 bg-muted rounded-xl" />
      ))}
    </div>
  );
}

// ── Weekly structure badge ────────────────────────────────────────────────────
interface WeeklyResult {
  trend:           'Bullish' | 'Bearish' | 'Consolidating';
  zone:            'Premium' | 'Equilibrium' | 'Discount';
  confluenceScore: number;
  recentEvent:     string | null;
  poc:             number;
  vah:             number;
  val:             number;
}

function WeeklyPanel({ w }: { w: WeeklyResult }) {
  const aligned =
    (w.trend === 'Bullish' && w.zone === 'Discount') ||
    (w.trend === 'Bearish' && w.zone === 'Premium');

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600 flex items-center gap-1.5">
        <Layers className="size-3.5" /> Weekly (1W) Structure Context
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold', trendBg(w.trend))}>
          {w.trend === 'Bullish' ? <TrendingUp className="size-3" /> : w.trend === 'Bearish' ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
          {w.trend}
        </span>
        <span className={cn('inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold', zoneBg(w.zone))}>
          {w.zone}
        </span>
        <span className={cn('px-2.5 py-1 rounded-lg border text-xs font-semibold', scoreText(w.confluenceScore), 'border-border bg-background')}>
          Score {w.confluenceScore}/100
        </span>
        {aligned && (
          <span className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-xs font-bold border border-violet-700">
            ✓ MTF Aligned
          </span>
        )}
        {!aligned && (
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-300">
            ⚠ MTF Conflict
          </span>
        )}
      </div>
      {w.recentEvent && (
        <p className="text-xs text-violet-700">Weekly event: <span className="font-semibold">{w.recentEvent}</span></p>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Weekly POC: <span className="font-mono font-semibold text-foreground">₹{fmt(w.poc)}</span></span>
        <span>VAH: <span className="font-mono font-semibold text-red-600">₹{fmt(w.vah)}</span></span>
        <span>VAL: <span className="font-mono font-semibold text-emerald-600">₹{fmt(w.val)}</span></span>
      </div>
    </div>
  );
}

// ── Volume Profile bar chart ──────────────────────────────────────────────────
function VolumeProfileChart({ nodes, poc, currentPrice }: { nodes: VolumeNode[]; poc: number; currentPrice: number }) {
  if (nodes.length === 0) return <p className="text-xs text-muted-foreground italic">No volume data</p>;

  const maxPct = Math.max(...nodes.map(n => n.pct));
  // Show in price order (low → high), flip so high is at top
  const sorted = [...nodes].reverse();

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
        <span>Volume Distribution (last 120 bars)</span>
        <span>POC: <span className="font-mono font-bold text-violet-600">₹{fmt(poc)}</span></span>
      </div>
      <div className="space-y-0.5 max-h-72 overflow-y-auto">
        {sorted.map((node, i) => {
          const isNearPrice = currentPrice >= node.priceFrom && currentPrice <= node.priceTo;
          const isPOC       = node.priceFrom <= poc && poc <= node.priceTo;
          const barW = maxPct > 0 ? (node.pct / maxPct) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-1.5 group">
              <span className="text-[9px] text-muted-foreground font-mono w-16 text-right shrink-0">
                {fmt(node.priceFrom, 0)}
              </span>
              <div className="flex-1 relative h-4 rounded-sm overflow-hidden bg-muted/30">
                <div
                  className={cn(
                    'h-full rounded-sm transition-all',
                    isPOC      ? 'bg-violet-500' :
                    node.isHVN ? 'bg-sky-400/80' :
                    node.isLVN ? 'bg-slate-200'  : 'bg-sky-300/50',
                  )}
                  style={{ width: `${barW}%` }}
                />
                {(isPOC || isNearPrice) && (
                  <div className={cn(
                    'absolute inset-y-0 left-0 right-0 flex items-center pl-1 text-[9px] font-bold pointer-events-none',
                    isPOC ? 'text-white' : 'text-foreground',
                  )}>
                    {isPOC && 'POC'}
                    {isNearPrice && !isPOC && '◄ CMP'}
                  </div>
                )}
              </div>
              <span className="text-[9px] text-muted-foreground w-8 shrink-0">
                {node.pct.toFixed(1)}%
              </span>
              {node.isHVN && <span className="text-[9px] text-sky-600 font-bold shrink-0">HVN</span>}
              {node.isLVN && <span className="text-[9px] text-slate-400 shrink-0">LVN</span>}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[10px] text-muted-foreground pt-1 flex-wrap">
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-violet-500 inline-block" /> POC</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-sky-400/80 inline-block" /> HVN</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-slate-200 inline-block" /> LVN</span>
      </div>
    </div>
  );
}

// ── Batch scan types ──────────────────────────────────────────────────────────
interface BatchItem {
  symbol:          string;
  company:         string;
  currentPrice:    number;
  bias:            'Bullish' | 'Bearish' | 'Neutral';
  trend:           'Bullish' | 'Bearish' | 'Consolidating';
  confluenceScore: number;
  zone:            'Premium' | 'Equilibrium' | 'Discount';
  rsi:             number;
  recentEvent:     string | null;
  poc:             number;
}

// ── Batch leaderboard ─────────────────────────────────────────────────────────
function BatchLeaderboard({
  items,
  onSelect,
}: {
  items: BatchItem[];
  onSelect: (sym: string) => void;
}) {
  const [filter, setFilter] = useState<'All' | 'Bullish' | 'Bearish'>('All');
  const visible = items.filter(it => filter === 'All' || it.bias === filter);

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(['All', 'Bullish', 'Bearish'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
              filter === f
                ? f === 'Bullish' ? 'bg-emerald-600 text-white border-emerald-600'
                  : f === 'Bearish' ? 'bg-red-600 text-white border-red-600'
                  : 'bg-violet-600 text-white border-violet-600'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >{f} {f !== 'All' && `(${items.filter(it => it.bias === f).length})`}</button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Symbol</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground hidden sm:table-cell">Bias</th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Score</th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground hidden md:table-cell">RSI</th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground hidden md:table-cell">Zone</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground hidden sm:table-cell">POC</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground hidden lg:table-cell">Event</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((it, i) => (
              <tr
                key={it.symbol}
                className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onSelect(it.symbol)}
              >
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="font-bold text-violet-700">{it.symbol}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{it.company}</div>
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-bold border',
                    it.bias === 'Bullish' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                    it.bias === 'Bearish' ? 'bg-red-50 text-red-700 border-red-300' :
                    'bg-muted text-muted-foreground border-border',
                  )}>{it.bias}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={cn('font-bold tabular-nums', scoreText(it.confluenceScore))}>
                    {it.confluenceScore}
                  </span>
                  <div className="h-1 w-full bg-muted rounded-full mt-0.5 overflow-hidden">
                    <div className={cn('h-full rounded-full', scoreColor(it.confluenceScore))} style={{ width: `${it.confluenceScore}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2 text-center hidden md:table-cell">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    it.rsi > 70 ? 'text-red-600 bg-red-50' :
                    it.rsi < 30 ? 'text-emerald-600 bg-emerald-50' : 'text-muted-foreground',
                  )}>{it.rsi.toFixed(1)}</span>
                </td>
                <td className="px-3 py-2 text-center hidden md:table-cell">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    it.zone === 'Discount' ? 'text-emerald-700 bg-emerald-50' :
                    it.zone === 'Premium'  ? 'text-red-700 bg-red-50' :
                    'text-amber-700 bg-amber-50',
                  )}>{it.zone}</span>
                </td>
                <td className="px-3 py-2 text-right hidden sm:table-cell font-mono text-muted-foreground">
                  {it.poc > 0 ? `₹${fmt(it.poc, 0)}` : '—'}
                </td>
                <td className="px-3 py-2 hidden lg:table-cell">
                  {it.recentEvent
                    ? <span className="text-[10px] text-violet-600 font-semibold">{it.recentEvent}</span>
                    : <span className="text-[10px] text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground italic">No {filter} setups found</p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PhantomFlowPage() {
  const [symbol, setSymbol]         = useState('NIFTY');
  const [tf, setTf]                 = useState<'1d' | '1wk'>('1d');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<PhantomFlowResult | null>(null);
  const [weeklyResult, setWeekly]   = useState<WeeklyResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [open, setOpen]             = useState<Set<string>>(new Set(['mkt', 'liq', 'obs', 'mom', 'setup', 'vp']));
  const [batchMode, setBatchMode]   = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchAt, setBatchAt]       = useState<string | null>(null);
  const [autoRefreshOn, setAutoRefreshOn] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const symbolRef = useRef(symbol);
  const tfRef     = useRef(tf);

  const toggle = (id: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const analyze = useCallback(async (sym = symbolRef.current, timeframe = tfRef.current) => {
    if (!sym.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setWeekly(null);
    try {
      const res  = await fetch(`/api/phantom-flow?symbol=${encodeURIComponent(sym.trim())}&tf=${timeframe}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Analysis failed'); return; }
      setResult(json.result as PhantomFlowResult);
      if (json.weeklyResult) setWeekly(json.weeklyResult as WeeklyResult);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep refs in sync so the interval callback always sees the latest values
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { tfRef.current = tf; }, [tf]);

  // Auto-refresh every 60s during market hours
  useEffect(() => {
    if (!autoRefreshOn) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    const tick = () => {
      if (isMarketOpen() && !batchMode && symbolRef.current.trim()) {
        analyze(symbolRef.current, tfRef.current);
      }
    };
    timerRef.current = setInterval(tick, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefreshOn, analyze, batchMode]);

  const runBatchScan = async () => {
    setBatchLoading(true);
    setBatchMode(true);
    try {
      const res  = await fetch('/api/phantom-flow?mode=batch', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error('Batch scan failed');
      setBatchItems(json.items as BatchItem[]);
      setBatchAt(json.scannedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch scan error');
    } finally {
      setBatchLoading(false);
    }
  };

  const r = result;

  return (
    <div className="px-4 py-5 space-y-5 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="size-5 text-violet-600" />
              Phantom Flow
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Smart Money Concepts — market structure, liquidity, order blocks & trade setup
            </p>
          </div>

          {/* Auto-refresh status */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefreshOn(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                autoRefreshOn
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-muted text-muted-foreground border-border',
              )}
              title="Toggle 60s auto-refresh during market hours"
            >
              <Clock className="size-3" />
              {autoRefreshOn ? 'Auto ✓' : 'Auto off'}
            </button>
            {lastRefreshed && (
              <span className="text-[10px] text-muted-foreground">
                {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            {isMarketOpen() && autoRefreshOn && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> Live
              </span>
            )}
          </div>
        </div>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => { setSymbol(s); setBatchMode(false); analyze(s, tf); }}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                symbol.toUpperCase() === s && !batchMode
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
              )}
            >{s}</button>
          ))}
        </div>

        {/* Input + controls row */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { setBatchMode(false); analyze(); } }}
              placeholder="e.g. RELIANCE, TCS, NIFTY"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          {/* Timeframe toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
            {(['1d', '1wk'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTf(t); setBatchMode(false); if (result) analyze(symbol, t); }}
                className={cn(
                  'px-3 py-2 transition-colors',
                  tf === t ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >{t === '1d' ? '1D' : '1W'}</button>
            ))}
          </div>

          <Button
            onClick={() => { setBatchMode(false); analyze(); }}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          >
            {loading ? <RefreshCw className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>

          {/* Batch scan button */}
          <Button
            onClick={runBatchScan}
            disabled={batchLoading}
            variant="outline"
            className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
          >
            {batchLoading ? <RefreshCw className="size-3.5 animate-spin" /> : <LayoutGrid className="size-3.5" />}
            {batchLoading ? 'Scanning…' : 'Batch Scan'}
          </Button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Batch Mode ── */}
      {batchMode && !batchLoading && batchItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <LayoutGrid className="size-4 text-violet-600" />
                Batch Scan — {batchItems.length} stocks ranked by confluence
              </h2>
              {batchAt && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Scanned at {new Date(batchAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <button
              onClick={() => setBatchMode(false)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Back to single analysis
            </button>
          </div>
          <BatchLeaderboard
            items={batchItems}
            onSelect={(sym) => { setSymbol(sym); setBatchMode(false); analyze(sym, tf); }}
          />
        </div>
      )}

      {batchLoading && <Skeleton />}

      {/* ── Single symbol loading ── */}
      {loading && !batchMode && <Skeleton />}

      {/* ── Results ── */}
      {r && !loading && !batchMode && (
        <div className="space-y-4">

          {/* ── Summary Card ── */}
          <div className={cn(
            'rounded-xl border-2 p-4 space-y-3',
            r.summary.bias === 'Bullish' ? 'border-emerald-400 bg-emerald-50/60' :
            r.summary.bias === 'Bearish' ? 'border-red-400 bg-red-50/60' :
            'border-amber-300 bg-amber-50/60',
          )}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {r.summary.bias === 'Bullish'
                  ? <TrendingUp   className="size-6 text-emerald-600" />
                  : r.summary.bias === 'Bearish'
                  ? <TrendingDown className="size-6 text-red-500" />
                  : <Minus        className="size-6 text-amber-600" />}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Phantom Flow Summary</p>
                  <p className={cn('text-2xl font-black tracking-tight', trendColor(r.summary.bias))}>
                    {r.summary.bias.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">Confluence</span>
                <span className={cn('text-xl font-bold', scoreText(r.tradeSetup.confluenceScore))}>
                  {r.tradeSetup.confluenceScore}/100
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">{r.symbol} · {r.barsAnalyzed}d</span>
                <span className="text-xl font-bold tabular-nums">₹{fmt(r.currentPrice, 2)}</span>
              </div>
            </div>

            {/* Key zones */}
            <div className="flex flex-wrap gap-1.5">
              {r.summary.keyZones.map(z => (
                <span key={z} className="px-2 py-0.5 rounded-md bg-background/80 border border-border text-xs text-foreground font-mono">{z}</span>
              ))}
            </div>

            {/* Volume POC */}
            {r.volumeProfile.poc > 0 && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="px-2 py-0.5 rounded-md bg-violet-100 border border-violet-300 text-violet-700 font-mono font-semibold">
                  POC ₹{fmt(r.volumeProfile.poc)}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-background/80 border border-border text-xs font-mono">
                  VAH ₹{fmt(r.volumeProfile.vah)} / VAL ₹{fmt(r.volumeProfile.val)}
                </span>
              </div>
            )}

            {/* Trade idea */}
            {r.summary.tradeIdea && (
              <div className="flex items-start gap-2 rounded-lg bg-background/70 border border-border px-3 py-2">
                <Target className="size-3.5 mt-0.5 text-violet-600 shrink-0" />
                <p className="text-xs font-medium">{r.summary.tradeIdea}</p>
              </div>
            )}
            {!r.summary.tradeIdea && (
              <p className="text-xs text-muted-foreground italic">No high-probability setup detected at current levels.</p>
            )}

            {/* Warnings */}
            {r.summary.warnings.length > 0 && (
              <div className="space-y-1">
                {r.summary.warnings.map(w => (
                  <div key={w} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="size-3 mt-0.5 shrink-0" />{w}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/60 pt-1">
              For educational and structural analysis only. Not financial advice.
            </p>
          </div>

          {/* ── Weekly MTF panel (only on 1D view) ── */}
          {weeklyResult && tf === '1d' && <WeeklyPanel w={weeklyResult} />}

          {/* ── Section 1: Market Structure ── */}
          <Section id="mkt" title="1. Market Structure" icon={<BarChart2 className="size-4" />} open={open.has('mkt')} onToggle={() => toggle('mkt')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold', trendBg(r.marketStructure.trend))}>
                    {r.marketStructure.trend === 'Bullish' ? <TrendingUp className="size-3.5" /> :
                     r.marketStructure.trend === 'Bearish' ? <TrendingDown className="size-3.5" /> :
                     <Minus className="size-3.5" />}
                    {r.marketStructure.trend}
                  </span>
                  <span className={cn('inline-flex items-center px-2.5 py-1.5 rounded-lg border text-xs font-semibold', zoneBg(r.marketStructure.zone))}>
                    {r.marketStructure.zone} Zone
                  </span>
                  {r.marketStructure.recentEvent && (
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold',
                      r.marketStructure.recentEvent.type === 'CHoCH'
                        ? 'bg-violet-500/10 text-violet-700 border-violet-500/30'
                        : 'bg-sky-500/10 text-sky-700 border-sky-500/30',
                    )}>
                      {r.marketStructure.recentEvent.type} — {r.marketStructure.recentEvent.direction}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Swing High</p>
                    <p className="text-sm font-bold tabular-nums text-red-600">{r.marketStructure.swingHigh ? `₹${fmt(r.marketStructure.swingHigh.price)}` : '—'}</p>
                    {r.marketStructure.swingHigh && <p className="text-[10px] text-muted-foreground">{fmtDate(r.marketStructure.swingHigh.date)}</p>}
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Swing Low</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-600">{r.marketStructure.swingLow ? `₹${fmt(r.marketStructure.swingLow.price)}` : '—'}</p>
                    {r.marketStructure.swingLow && <p className="text-[10px] text-muted-foreground">{fmtDate(r.marketStructure.swingLow.date)}</p>}
                  </div>
                </div>

                {r.marketStructure.recentEvent && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Structure Event</p>
                    <p className="text-sm font-semibold">{r.marketStructure.recentEvent.type} · {r.marketStructure.recentEvent.direction} · ₹{fmt(r.marketStructure.recentEvent.price)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(r.marketStructure.recentEvent.date)}</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Position in Range</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Swing Low<br /><span className="font-mono text-foreground">₹{fmt(r.marketStructure.rangeLow)}</span></span>
                    <span className="text-center">Equilibrium<br /><span className="font-mono text-foreground">₹{fmt(r.marketStructure.equilibrium)}</span></span>
                    <span className="text-right">Swing High<br /><span className="font-mono text-foreground">₹{fmt(r.marketStructure.rangeHigh)}</span></span>
                  </div>

                  <div className="relative h-6 w-full rounded-full bg-muted overflow-hidden">
                    <div className="absolute inset-0 flex">
                      <div className="w-[40%] bg-emerald-100 opacity-60 rounded-l-full" />
                      <div className="w-[20%] bg-amber-100 opacity-60" />
                      <div className="w-[40%] bg-red-100 opacity-60 rounded-r-full" />
                    </div>
                    <div className="absolute inset-0 flex items-center text-[9px] font-bold pointer-events-none">
                      <span className="w-[40%] text-center text-emerald-700">DISCOUNT</span>
                      <span className="w-[20%] text-center text-amber-700">EQ</span>
                      <span className="w-[40%] text-center text-red-700">PREMIUM</span>
                    </div>
                    <div
                      className="absolute top-0 bottom-0 w-1.5 bg-foreground rounded-full shadow"
                      style={{ left: `calc(${r.marketStructure.pctInRange}% - 3px)` }}
                    />
                  </div>

                  <div className="text-center">
                    <span className={cn('text-sm font-bold', trendColor(r.marketStructure.zone === 'Premium' ? 'Bearish' : r.marketStructure.zone === 'Discount' ? 'Bullish' : 'Consolidating'))}>
                      {r.marketStructure.pctInRange.toFixed(1)}% — {r.marketStructure.zone}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Section 2: Liquidity Analysis ── */}
          <Section id="liq" title="2. Liquidity Analysis" icon={<Activity className="size-4" />} open={open.has('liq')} onToggle={() => toggle('liq')}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-red-200 overflow-hidden">
                  <div className="px-3 py-2 bg-red-50 border-b border-red-200">
                    <p className="text-xs font-semibold text-red-700">Equal Highs (Buy-Side Liquidity)</p>
                  </div>
                  {r.liquidity.equalHighs.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground italic">None detected</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Price</th>
                        <th className="px-3 py-1.5 text-center font-semibold text-muted-foreground">Hits</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-muted-foreground">Status</th>
                      </tr></thead>
                      <tbody>
                        {r.liquidity.equalHighs.map((l: EqualLevel, i: number) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono font-semibold">₹{fmt(l.price)}</td>
                            <td className="px-3 py-1.5 text-center">{l.count}</td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold border',
                                l.status === 'Swept' ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-red-50 text-red-700 border-red-300',
                              )}>{l.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="rounded-lg border border-emerald-200 overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-700">Equal Lows (Sell-Side Liquidity)</p>
                  </div>
                  {r.liquidity.equalLows.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground italic">None detected</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Price</th>
                        <th className="px-3 py-1.5 text-center font-semibold text-muted-foreground">Hits</th>
                        <th className="px-3 py-1.5 text-right font-semibold text-muted-foreground">Status</th>
                      </tr></thead>
                      <tbody>
                        {r.liquidity.equalLows.map((l: EqualLevel, i: number) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono font-semibold">₹{fmt(l.price)}</td>
                            <td className="px-3 py-1.5 text-center">{l.count}</td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold border',
                                l.status === 'Swept' ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300',
                              )}>{l.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fair Value Gaps (Imbalances)</p>
                {r.liquidity.fvgs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No FVGs detected in last 60 bars</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {r.liquidity.fvgs.map((f: FVG, i: number) => (
                      <div key={i} className={cn(
                        'rounded-lg border px-3 py-2 flex items-center justify-between gap-2',
                        f.type === 'Bullish'
                          ? (f.mitigated ? 'border-border bg-muted/30' : 'border-emerald-300 bg-emerald-50/60')
                          : (f.mitigated ? 'border-border bg-muted/30' : 'border-red-300 bg-red-50/60'),
                      )}>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border',
                              f.type === 'Bullish' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-red-100 text-red-700 border-red-300',
                            )}>{f.type}</span>
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                              f.mitigated ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-violet-100 text-violet-700 border-violet-300',
                            )}>{f.mitigated ? 'Mitigated' : 'Active'}</span>
                          </div>
                          <p className="text-xs font-mono font-semibold">₹{fmt(f.bottom)} – ₹{fmt(f.top)}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtDate(f.date)} · {f.sizePct.toFixed(2)}% gap</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {r.liquidity.stopHuntZones.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Stop-Hunt Zones</p>
                  <div className="space-y-1.5">
                    {r.liquidity.stopHuntZones.map((z, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <ShieldAlert className="size-3.5 mt-0.5 text-amber-600 shrink-0" />
                        <div>
                          <span className="text-xs font-semibold text-amber-700">{z.direction} · ₹{fmt(z.price)}</span>
                          <p className="text-[10px] text-amber-600">{z.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Section 3: Order Blocks ── */}
          <Section id="obs" title="3. Order Blocks" icon={<Target className="size-4" />} open={open.has('obs')} onToggle={() => toggle('obs')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border-l-4 border-l-emerald-500 border border-border overflow-hidden">
                <div className="px-3 py-2 bg-emerald-50/60 border-b border-border">
                  <p className="text-xs font-semibold text-emerald-700">Bullish Order Blocks (Demand Zones)</p>
                </div>
                {r.orderBlocks.bullish.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground italic">None detected</p>
                ) : (
                  <div className="divide-y divide-border">
                    {r.orderBlocks.bullish.map((ob: OrderBlock, i: number) => (
                      <div key={i} className={cn('px-3 py-2', ob.mitigated && 'opacity-50')}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold">₹{fmt(ob.low)} – ₹{fmt(ob.high)}</span>
                          <div className="flex gap-1">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold',
                              ob.strength === 'Strong' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-muted text-muted-foreground border-border',
                            )}>{ob.strength}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold',
                              ob.mitigated ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-violet-100 text-violet-700 border-violet-300',
                            )}>{ob.mitigated ? 'Mitigated' : 'Active'}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(ob.date)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border-l-4 border-l-red-500 border border-border overflow-hidden">
                <div className="px-3 py-2 bg-red-50/60 border-b border-border">
                  <p className="text-xs font-semibold text-red-700">Bearish Order Blocks (Supply Zones)</p>
                </div>
                {r.orderBlocks.bearish.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground italic">None detected</p>
                ) : (
                  <div className="divide-y divide-border">
                    {r.orderBlocks.bearish.map((ob: OrderBlock, i: number) => (
                      <div key={i} className={cn('px-3 py-2', ob.mitigated && 'opacity-50')}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold">₹{fmt(ob.low)} – ₹{fmt(ob.high)}</span>
                          <div className="flex gap-1">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold',
                              ob.strength === 'Strong' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-muted text-muted-foreground border-border',
                            )}>{ob.strength}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold',
                              ob.mitigated ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-violet-100 text-violet-700 border-violet-300',
                            )}>{ob.mitigated ? 'Mitigated' : 'Active'}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(ob.date)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* ── Section 4: Trend + Momentum ── */}
          <Section id="mom" title="4. Trend + Momentum" icon={<TrendingUp className="size-4" />} open={open.has('mom')} onToggle={() => toggle('mom')}>
            <div className="space-y-4">
              <ScoreBar score={r.momentum.trendStrength} label={`Trend Strength — ${r.momentum.trendLabel}`} />

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Reversal Probability</span>
                  <span className="font-semibold">{r.momentum.reversalProbability}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full',
                      r.momentum.reversalProbability >= 70 ? 'bg-red-500' :
                      r.momentum.reversalProbability >= 45 ? 'bg-amber-400' : 'bg-sky-400',
                    )}
                    style={{ width: `${r.momentum.reversalProbability}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold', rsiColor(r.momentum.rsi))}>
                  RSI {r.momentum.rsi.toFixed(1)}
                  {r.momentum.rsi > 70 && ' (Overbought)'}
                  {r.momentum.rsi < 30 && ' (Oversold)'}
                </div>
                <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold',
                  r.momentum.emaAlignment === 'Bullish' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                  r.momentum.emaAlignment === 'Bearish' ? 'bg-red-50 text-red-700 border-red-300' :
                  'bg-muted text-muted-foreground border-border',
                )}>EMA {r.momentum.emaAlignment}</div>
                {r.momentum.momentumShift !== 'None' && (
                  <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold',
                    r.momentum.momentumShift === 'Bullish' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-50 text-red-700 border-red-300',
                  )}>Momentum Shift → {r.momentum.momentumShift}</div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'EMA 20', val: r.momentum.ema20 },
                  { label: 'EMA 50', val: r.momentum.ema50 },
                  { label: 'EMA 200', val: r.momentum.ema200 },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <p className={cn('text-sm font-bold tabular-nums',
                      r.currentPrice > val ? 'text-emerald-600' : 'text-red-500',
                    )}>₹{fmt(val, 2)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.currentPrice > val ? '▲ Price above' : '▼ Price below'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Section 5: Trade Setup Engine ── */}
          <Section id="setup" title="5. Trade Setup Engine" icon={<Zap className="size-4" />} open={open.has('setup')} onToggle={() => toggle('setup')}>
            <div className="space-y-4">
              <div className="space-y-2">
                <ScoreBar score={r.tradeSetup.confluenceScore} label="Overall Confluence Score" />
                <div className="flex flex-wrap gap-1.5">
                  {r.tradeSetup.confluenceFactors.map(f => (
                    <span key={f.label} className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                      f.contributing
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-muted text-muted-foreground border-border opacity-60',
                    )}>
                      {f.contributing ? '✓' : '○'} {f.label} ({f.weight})
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className={cn('rounded-xl border-2 p-4 space-y-3',
                  r.tradeSetup.longSetup.valid ? 'border-emerald-400 bg-emerald-50/50' : 'border-border bg-muted/20',
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className={cn('size-4', r.tradeSetup.longSetup.valid ? 'text-emerald-600' : 'text-muted-foreground')} />
                      <span className="text-sm font-bold">Long Setup</span>
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold border',
                      r.tradeSetup.longSetup.valid
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-400'
                        : 'bg-muted text-muted-foreground border-border',
                    )}>{r.tradeSetup.longSetup.valid ? 'VALID' : 'INVALID'}</span>
                  </div>
                  <div className="space-y-1">
                    {r.tradeSetup.longSetup.conditions.map(c => <CondRow key={c.label} {...c} />)}
                  </div>
                  {r.tradeSetup.longSetup.valid && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {[
                        { label: 'Entry',    val: r.tradeSetup.longSetup.entry,    cls: 'text-foreground' },
                        { label: 'Stop',     val: r.tradeSetup.longSetup.stopLoss, cls: 'text-red-600' },
                        { label: 'Target 1', val: r.tradeSetup.longSetup.target1,  cls: 'text-emerald-600' },
                        { label: 'Target 2', val: r.tradeSetup.longSetup.target2,  cls: 'text-emerald-700' },
                      ].map(({ label, val, cls }) => (
                        <div key={label} className="rounded-lg bg-background/80 border border-border px-2.5 py-1.5">
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className={cn('text-xs font-bold tabular-nums', cls)}>{val ? `₹${fmt(val)}` : '—'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.tradeSetup.longSetup.rr1 && (
                    <p className="text-xs text-muted-foreground">
                      R:R → T1: <span className="font-bold text-foreground">{r.tradeSetup.longSetup.rr1}:1</span>
                      {r.tradeSetup.longSetup.rr2 && <> · T2: <span className="font-bold text-foreground">{r.tradeSetup.longSetup.rr2}:1</span></>}
                    </p>
                  )}
                  <div className="flex items-start gap-1.5 text-[10px] text-red-600">
                    <XCircle className="size-3 mt-0.5 shrink-0" />
                    <span>Invalidation: {r.tradeSetup.longSetup.invalidation}</span>
                  </div>
                </div>

                <div className={cn('rounded-xl border-2 p-4 space-y-3',
                  r.tradeSetup.shortSetup.valid ? 'border-red-400 bg-red-50/50' : 'border-border bg-muted/20',
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingDown className={cn('size-4', r.tradeSetup.shortSetup.valid ? 'text-red-500' : 'text-muted-foreground')} />
                      <span className="text-sm font-bold">Short Setup</span>
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold border',
                      r.tradeSetup.shortSetup.valid
                        ? 'bg-red-100 text-red-700 border-red-400'
                        : 'bg-muted text-muted-foreground border-border',
                    )}>{r.tradeSetup.shortSetup.valid ? 'VALID' : 'INVALID'}</span>
                  </div>
                  <div className="space-y-1">
                    {r.tradeSetup.shortSetup.conditions.map(c => <CondRow key={c.label} {...c} />)}
                  </div>
                  {r.tradeSetup.shortSetup.valid && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {[
                        { label: 'Entry',    val: r.tradeSetup.shortSetup.entry,    cls: 'text-foreground' },
                        { label: 'Stop',     val: r.tradeSetup.shortSetup.stopLoss, cls: 'text-red-600' },
                        { label: 'Target 1', val: r.tradeSetup.shortSetup.target1,  cls: 'text-emerald-600' },
                        { label: 'Target 2', val: r.tradeSetup.shortSetup.target2,  cls: 'text-emerald-700' },
                      ].map(({ label, val, cls }) => (
                        <div key={label} className="rounded-lg bg-background/80 border border-border px-2.5 py-1.5">
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className={cn('text-xs font-bold tabular-nums', cls)}>{val ? `₹${fmt(val)}` : '—'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.tradeSetup.shortSetup.rr1 && (
                    <p className="text-xs text-muted-foreground">
                      R:R → T1: <span className="font-bold text-foreground">{r.tradeSetup.shortSetup.rr1}:1</span>
                      {r.tradeSetup.shortSetup.rr2 && <> · T2: <span className="font-bold text-foreground">{r.tradeSetup.shortSetup.rr2}:1</span></>}
                    </p>
                  )}
                  <div className="flex items-start gap-1.5 text-[10px] text-red-600">
                    <XCircle className="size-3 mt-0.5 shrink-0" />
                    <span>Invalidation: {r.tradeSetup.shortSetup.invalidation}</span>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Section 6: Volume Profile ── */}
          <Section id="vp" title="6. Volume Profile" icon={<BarChart2 className="size-4" />} open={open.has('vp')} onToggle={() => toggle('vp')}>
            <div className="space-y-3">
              {/* Summary row */}
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-center">
                  <p className="text-[10px] text-violet-600 uppercase tracking-wide font-semibold">POC</p>
                  <p className="text-sm font-bold font-mono text-violet-700">₹{fmt(r.volumeProfile.poc)}</p>
                  <p className="text-[10px] text-muted-foreground">Point of Control</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-center">
                  <p className="text-[10px] text-red-600 uppercase tracking-wide font-semibold">VAH</p>
                  <p className="text-sm font-bold font-mono text-red-700">₹{fmt(r.volumeProfile.vah)}</p>
                  <p className="text-[10px] text-muted-foreground">Value Area High</p>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
                  <p className="text-[10px] text-emerald-600 uppercase tracking-wide font-semibold">VAL</p>
                  <p className="text-sm font-bold font-mono text-emerald-700">₹{fmt(r.volumeProfile.val)}</p>
                  <p className="text-[10px] text-muted-foreground">Value Area Low</p>
                </div>
                <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">CMP vs POC</p>
                  <p className={cn('text-sm font-bold font-mono',
                    r.currentPrice > r.volumeProfile.poc ? 'text-emerald-600' : 'text-red-600',
                  )}>
                    {r.volumeProfile.poc > 0
                      ? `${r.currentPrice > r.volumeProfile.poc ? '+' : ''}${(((r.currentPrice - r.volumeProfile.poc) / r.volumeProfile.poc) * 100).toFixed(1)}%`
                      : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.currentPrice > r.volumeProfile.poc ? 'Above POC' : 'Below POC'}
                  </p>
                </div>
              </div>

              {/* Volume distribution chart */}
              <VolumeProfileChart
                nodes={r.volumeProfile.nodes}
                poc={r.volumeProfile.poc}
                currentPrice={r.currentPrice}
              />
            </div>
          </Section>

          {/* Disclaimer */}
          <p className="text-[10px] text-center text-muted-foreground/60 pb-2">
            Phantom Flow is a structural analysis tool. All analysis is for educational purposes only and does not constitute financial advice.
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !result && !error && !batchMode && (
        <div className="text-center py-16 space-y-3">
          <Activity className="size-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Select a symbol above and click <strong>Analyze</strong>, or use <strong>Batch Scan</strong> to rank all stocks.</p>
        </div>
      )}
    </div>
  );
}
