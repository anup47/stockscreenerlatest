'use client';

import { useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Search, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Target, ShieldAlert, Zap, BarChart2, Activity,
} from 'lucide-react';
import type { PhantomFlowResult, FVG, OrderBlock, EqualLevel } from '@/lib/phantom-flow-engine';

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

// ── Color helpers ─────────────────────────────────────────────────────────────
function trendColor(t: string) {
  if (t === 'Bullish')     return 'text-emerald-600';
  if (t === 'Bearish')     return 'text-red-500';
  return 'text-amber-600';
}
function trendBg(t: string) {
  if (t === 'Bullish')     return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
  if (t === 'Bearish')     return 'bg-red-500/10 text-red-700 border-red-500/30';
  return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
}
function zoneBg(z: string) {
  if (z === 'Premium')     return 'bg-red-500/10 text-red-700 border-red-400/30';
  if (z === 'Discount')    return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PhantomFlowPage() {
  const [symbol, setSymbol]   = useState('NIFTY');
  const [tf, setTf]           = useState<'1d' | '1wk'>('1d');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<PhantomFlowResult | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [open, setOpen]       = useState<Set<string>>(new Set(['mkt', 'liq', 'obs', 'mom', 'setup']));
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const analyze = useCallback(async (sym = symbol, timeframe = tf) => {
    if (!sym.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res  = await fetch(`/api/phantom-flow?symbol=${encodeURIComponent(sym.trim())}&tf=${timeframe}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error ?? 'Analysis failed'); return; }
      setResult(json.result as PhantomFlowResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [symbol, tf]);

  const r = result;

  return (
    <div className="px-4 py-5 space-y-5 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="size-5 text-violet-600" />
            Phantom Flow
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Smart Money Concepts — market structure, liquidity, order blocks & trade setup
          </p>
        </div>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => { setSymbol(s); analyze(s, tf); }}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                symbol.toUpperCase() === s
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
              )}
            >{s}</button>
          ))}
        </div>

        {/* Input row */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              placeholder="e.g. RELIANCE, TCS, NIFTY"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          {/* Timeframe toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
            {(['1d', '1wk'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTf(t); if (result) analyze(symbol, t); }}
                className={cn(
                  'px-3 py-2 transition-colors',
                  tf === t ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >{t === '1d' ? '1D' : '1W'}</button>
            ))}
          </div>

          <Button
            onClick={() => analyze()}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          >
            {loading ? <RefreshCw className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            {loading ? 'Analyzing…' : 'Analyze'}
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

      {/* ── Loading ── */}
      {loading && <Skeleton />}

      {/* ── Results ── */}
      {r && !loading && (
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
                <span className={cn('text-xl font-bold', scoreColor(r.tradeSetup.confluenceScore).replace('bg-', 'text-').replace('-500', '-600').replace('-400', '-500'))}>
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

          {/* ── Section 1: Market Structure ── */}
          <Section id="mkt" title="1. Market Structure" icon={<BarChart2 className="size-4" />} open={open.has('mkt')} onToggle={() => toggle('mkt')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: trend + structure events */}
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

              {/* Right: Premium/Discount meter */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Position in Range</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Swing Low<br /><span className="font-mono text-foreground">₹{fmt(r.marketStructure.rangeLow)}</span></span>
                    <span className="text-center">Equilibrium<br /><span className="font-mono text-foreground">₹{fmt(r.marketStructure.equilibrium)}</span></span>
                    <span className="text-right">Swing High<br /><span className="font-mono text-foreground">₹{fmt(r.marketStructure.rangeHigh)}</span></span>
                  </div>

                  {/* Range bar */}
                  <div className="relative h-6 w-full rounded-full bg-muted overflow-hidden">
                    {/* Zones */}
                    <div className="absolute inset-0 flex">
                      <div className="w-[40%] bg-emerald-100 opacity-60 rounded-l-full" />
                      <div className="w-[20%] bg-amber-100 opacity-60" />
                      <div className="w-[40%] bg-red-100 opacity-60 rounded-r-full" />
                    </div>
                    {/* Zone labels */}
                    <div className="absolute inset-0 flex items-center text-[9px] font-bold pointer-events-none">
                      <span className="w-[40%] text-center text-emerald-700">DISCOUNT</span>
                      <span className="w-[20%] text-center text-amber-700">EQ</span>
                      <span className="w-[40%] text-center text-red-700">PREMIUM</span>
                    </div>
                    {/* Current price marker */}
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

              {/* Equal Highs + Lows */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Equal Highs */}
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

                {/* Equal Lows */}
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

              {/* FVGs */}
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

              {/* Stop Hunt Zones */}
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
              {/* Bullish OBs */}
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

              {/* Bearish OBs */}
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

              {/* Trend strength meter */}
              <ScoreBar score={r.momentum.trendStrength} label={`Trend Strength — ${r.momentum.trendLabel}`} />

              {/* Reversal probability */}
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

              {/* Chips row */}
              <div className="flex flex-wrap gap-2">
                {/* RSI */}
                <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold', rsiColor(r.momentum.rsi))}>
                  RSI {r.momentum.rsi.toFixed(1)}
                  {r.momentum.rsi > 70 && ' (Overbought)'}
                  {r.momentum.rsi < 30 && ' (Oversold)'}
                </div>

                {/* EMA alignment */}
                <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold',
                  r.momentum.emaAlignment === 'Bullish' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                  r.momentum.emaAlignment === 'Bearish' ? 'bg-red-50 text-red-700 border-red-300' :
                  'bg-muted text-muted-foreground border-border',
                )}>EMA {r.momentum.emaAlignment}</div>

                {/* Momentum shift */}
                {r.momentum.momentumShift !== 'None' && (
                  <div className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold',
                    r.momentum.momentumShift === 'Bullish' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-50 text-red-700 border-red-300',
                  )}>Momentum Shift → {r.momentum.momentumShift}</div>
                )}
              </div>

              {/* EMA levels */}
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

              {/* Confluence score */}
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

              {/* Long / Short side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Long Setup */}
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

                {/* Short Setup */}
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

          {/* Disclaimer */}
          <p className="text-[10px] text-center text-muted-foreground/60 pb-2">
            Phantom Flow is a structural analysis tool. All analysis is for educational purposes only and does not constitute financial advice.
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !result && !error && (
        <div className="text-center py-16 space-y-3">
          <Activity className="size-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Select a symbol above and click <strong>Analyze</strong> to run the Phantom Flow engine.</p>
        </div>
      )}
    </div>
  );
}
