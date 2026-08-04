'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Edit2, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import { cn } from '@/lib/utils';

export interface Constituent {
  symbol: string;
  name: string;
  sector: string;
  defaultWeight: number;
}

interface QuoteData {
  ltp: number;
  prevClose: number;
  change: number;
  changePct: number;
}

interface Props {
  indexName: string;
  storageKey: string;
  defaultPrevLevel: number;
  constituents: Constituent[];
}

function fmt2(n: number) { return n.toFixed(2); }
function fmtIdx(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function signed(n: number, digits = 2) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

export default function IndexTracker({ indexName, storageKey, defaultPrevLevel, constituents }: Props) {
  const dhan = useDhanCredentials();

  const defaultWeights = useCallback(() => {
    const d: Record<string, number> = {};
    constituents.forEach(c => { d[c.symbol] = c.defaultWeight; });
    return d;
  }, [constituents]);

  const [weights, setWeights]       = useState<Record<string, number>>(defaultWeights);
  const [prevLevel, setPrevLevel]   = useState(defaultPrevLevel);
  const [prevLevelStr, setPrevStr]  = useState(String(defaultPrevLevel));
  const [quotes, setQuotes]         = useState<Record<string, QuoteData>>({});
  const [loading, setLoading]       = useState(false);
  const [fetchedAt, setFetchedAt]   = useState<string | null>(null);
  const [editMode, setEditMode]     = useState(false);
  const [hydrated, setHydrated]     = useState(false);
  const [sortBy, setSortBy]         = useState<'weight' | 'contribution' | 'change'>('weight');

  // Hydrate from localStorage
  useEffect(() => {
    const w = localStorage.getItem(`${storageKey}_weights`);
    const l = localStorage.getItem(`${storageKey}_prev_level`);
    if (w) {
      try { setWeights(JSON.parse(w)); } catch { /* ignore */ }
    }
    if (l) {
      const n = parseFloat(l);
      if (!isNaN(n) && n > 0) { setPrevLevel(n); setPrevStr(l); }
    }
    setHydrated(true);
  }, [storageKey]);

  const fetchPrices = useCallback(async () => {
    if (!dhan.isConfigured) return;
    setLoading(true);
    try {
      const syms = constituents.map(c => c.symbol).join(',');
      const res = await fetch(`/api/dhan/equity-prices?symbols=${encodeURIComponent(syms)}`, {
        headers: dhan.headers,
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json() as { quotes: Record<string, QuoteData>; fetchedAt?: string };
      setQuotes(json.quotes ?? {});
      setFetchedAt(json.fetchedAt ?? null);
    } finally {
      setLoading(false);
    }
  }, [dhan.isConfigured, dhan.headers, constituents]);

  useEffect(() => {
    if (!hydrated || !dhan.isHydrated) return;
    fetchPrices();
    const id = setInterval(fetchPrices, 30_000);
    return () => clearInterval(id);
  }, [hydrated, dhan.isHydrated, fetchPrices]);

  const updateWeight = (symbol: string, val: string) => {
    const n = parseFloat(val);
    const updated = { ...weights, [symbol]: isNaN(n) ? 0 : Math.max(0, n) };
    setWeights(updated);
    localStorage.setItem(`${storageKey}_weights`, JSON.stringify(updated));
  };

  const resetWeights = () => {
    const d = defaultWeights();
    setWeights(d);
    localStorage.setItem(`${storageKey}_weights`, JSON.stringify(d));
  };

  const updatePrevLevel = (val: string) => {
    setPrevStr(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      setPrevLevel(n);
      localStorage.setItem(`${storageKey}_prev_level`, val);
    }
  };

  // Build rows
  const baseRows = constituents.map(c => {
    const w        = weights[c.symbol] ?? c.defaultWeight;
    const q        = quotes[c.symbol] ?? null;
    const chPct    = q?.changePct ?? 0;
    const contribPct = (w / 100) * chPct;            // % contribution to index return
    const pts      = prevLevel * contribPct / 100;    // index points
    return { ...c, w, q, chPct, contribPct, pts };
  });

  const rows = [...baseRows].sort((a, b) => {
    if (sortBy === 'contribution') return Math.abs(b.contribPct) - Math.abs(a.contribPct);
    if (sortBy === 'change')       return Math.abs(b.chPct)      - Math.abs(a.chPct);
    return b.w - a.w; // default: weight desc
  });

  const totalWeight   = baseRows.reduce((s, r) => s + r.w, 0);
  const totalContrib  = baseRows.filter(r => r.q).reduce((s, r) => s + r.contribPct, 0);
  const currentIndex  = prevLevel * (1 + totalContrib / 100);
  const indexChg      = currentIndex - prevLevel;
  const indexChgPct   = prevLevel > 0 ? (indexChg / prevLevel) * 100 : 0;
  const pricesLoaded  = Object.keys(quotes).length > 0;
  const priceCount    = baseRows.filter(r => r.q).length;
  const weightOk      = Math.abs(totalWeight - 100) <= 1;

  const SortBtn = ({ id, label }: { id: typeof sortBy; label: string }) => (
    <button
      onClick={() => setSortBy(id)}
      className={cn(
        'h-6 px-2 text-xs rounded border transition-colors',
        sortBy === id
          ? 'bg-slate-700 text-white border-slate-700'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Title + index readout */}
          <div className="flex items-end gap-8">
            <div>
              <h1 className="text-lg font-bold text-foreground">{indexName}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estimated · weights × live prices
              </p>
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums leading-none">
                {pricesLoaded ? fmtIdx(currentIndex) : '—'}
              </div>
              {pricesLoaded && (
                <div className={cn('text-sm font-semibold tabular-nums mt-0.5',
                  indexChg >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {signed(indexChg)} ({signed(indexChgPct)}%)
                </div>
              )}
              {!weightOk && pricesLoaded && (
                <p className="text-xs text-amber-600 mt-0.5">⚠ Weights ≠ 100%; adjust for accurate index</p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Prev Close:</span>
            <input
              type="number"
              value={prevLevelStr}
              onChange={e => updatePrevLevel(e.target.value)}
              className="w-28 h-7 px-2 text-xs border border-border rounded bg-background tabular-nums
                         focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              onClick={() => { setEditMode(v => !v); }}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 text-xs rounded border transition-colors',
                editMode
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {editMode ? <><Check className="size-3" /> Done</> : <><Edit2 className="size-3" /> Edit Weights</>}
            </button>
            {editMode && (
              <button
                onClick={resetWeights}
                className="flex items-center gap-1.5 h-7 px-3 text-xs rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="size-3" /> Reset
              </button>
            )}
            <button
              onClick={fetchPrices}
              disabled={loading || !dhan.isConfigured}
              className="flex items-center gap-1.5 h-7 px-3 text-xs rounded border border-border
                         text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span>
              Weight total:&nbsp;
              <span className={cn('font-semibold', weightOk ? 'text-emerald-600' : 'text-amber-600')}>
                {totalWeight.toFixed(2)}%
              </span>
            </span>
            <span>·</span>
            <span>{priceCount} / {constituents.length} prices</span>
            <span>·</span>
            <div className="flex items-center gap-1">
              <span>Sort:</span>
              <SortBtn id="weight"       label="Weight" />
              <SortBtn id="contribution" label="Contribution" />
              <SortBtn id="change"       label="Change %" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!dhan.isConfigured && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle className="size-3.5" />
                Configure Dhan API in Settings for live prices
              </span>
            )}
            {fetchedAt && (
              <span>Updated {new Date(fetchedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="p-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-8">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Company</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Symbol</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Sector</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Weight&nbsp;%</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Price</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Prev&nbsp;Close</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Change&nbsp;%</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Contribution&nbsp;%</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Index&nbsp;Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.symbol}
                    className={cn(
                      'border-b border-border/40 hover:bg-muted/30 transition-colors',
                      i % 2 === 1 && 'bg-muted/15',
                    )}
                  >
                    <td className="px-3 py-1.5 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.symbol}</td>
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.sector}</td>

                    {/* Weight — editable in edit mode */}
                    <td className="px-3 py-1.5 text-right">
                      {editMode ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.w}
                          onChange={e => updateWeight(r.symbol, e.target.value)}
                          className="w-20 h-6 px-1.5 text-right text-xs border border-emerald-500 rounded
                                     bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      ) : (
                        <span className="tabular-nums">{r.w.toFixed(2)}%</span>
                      )}
                    </td>

                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.q ? fmt2(r.q.ltp) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.q ? fmt2(r.q.prevClose) : '—'}
                    </td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums font-medium',
                      !r.q ? 'text-muted-foreground' : r.chPct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {r.q ? `${signed(r.chPct)}%` : '—'}
                    </td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums',
                      !r.q ? 'text-muted-foreground' : r.contribPct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {r.q ? `${signed(r.contribPct, 4)}%` : '—'}
                    </td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums font-semibold',
                      !r.q ? 'text-muted-foreground' : r.pts >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {r.q ? signed(r.pts) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50">
                  <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground">TOTAL</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums text-xs font-semibold',
                    weightOk ? 'text-foreground' : 'text-amber-600')}>
                    {totalWeight.toFixed(2)}%
                  </td>
                  <td colSpan={3} />
                  <td className={cn('px-3 py-2 text-right tabular-nums text-xs font-bold',
                    totalContrib >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                    {pricesLoaded ? `${signed(totalContrib, 4)}%` : '—'}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums font-bold',
                    indexChg >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                    {pricesLoaded ? signed(indexChg) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Formula: Estimated Index = Prev Close × (1 + Σ(wᵢ × Δᵢ) / 10000) · where wᵢ is weight in % and Δᵢ is today&apos;s change in %
        </p>
      </div>
    </div>
  );
}
