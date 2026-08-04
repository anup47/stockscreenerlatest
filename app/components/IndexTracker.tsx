'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, X, Clock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';

export interface Constituent {
  symbol:            string;
  name:              string;
  sector:            string;
  defaultWeight:     number;
  defaultPrice?:     number;
  defaultPrevClose?: number;
}

interface RowData {
  weight:    string;
  price:     string;
  prevClose: string;
}

interface Props {
  indexName:        string;
  storageKey:       string;
  defaultPrevLevel: number;
  constituents:     Constituent[];
}

type LiveStatus = 'closed' | 'fetching' | 'live' | 'error';
type PcStatus   = 'idle' | 'fetching' | 'done' | 'error';

// IST = UTC + 5h 30m; market open Mon-Fri 09:15 – 15:40
function isMarketOpen(): boolean {
  const istMs = Date.now() + (5 * 60 + 30) * 60 * 1000;
  const ist   = new Date(istMs);
  const day   = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins  = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 40;
}

function istTimeStr(): string {
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  return [ist.getUTCHours(), ist.getUTCMinutes(), ist.getUTCSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
}

function toNum(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function fmtIdx(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const INPUT_CLS =
  'h-6 px-1.5 text-right text-xs border border-border rounded bg-background tabular-nums ' +
  'focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 ' +
  'placeholder:text-muted-foreground/30';

interface DhanQuote { ltp: number; prevClose: number; change: number; changePct: number; }
interface DhanResp  { quotes: Record<string, DhanQuote>; }
interface YFResp    { prices: Record<string, { price: number }>; }

export default function IndexTracker({
  indexName, storageKey, defaultPrevLevel, constituents,
}: Props) {
  const initRow = (c: Constituent): RowData => ({
    weight:    String(c.defaultWeight),
    price:     '',
    prevClose: c.defaultPrevClose !== undefined ? String(c.defaultPrevClose) : '',
  });

  const [rowData, setRowData]     = useState<Record<string, RowData>>(() => {
    const d: Record<string, RowData> = {};
    constituents.forEach(c => { d[c.symbol] = initRow(c); });
    return d;
  });
  const [prevLevelStr, setPrevStr] = useState(String(defaultPrevLevel));
  const [hydrated, setHydrated]    = useState(false);
  const [liveStatus, setStatus]    = useState<LiveStatus>('closed');
  const [lastTime, setLastTime]    = useState('');
  const [pcStatus, setPcStatus]    = useState<PcStatus>('idle');

  const dhan            = useDhanCredentials();
  const symbolsRef      = useRef(constituents.map(c => c.symbol).join(','));
  const hasFetchedPC    = useRef(false);

  // ── localStorage keys (v8 — clears wrong hardcoded defaults) ─────
  const LS_KEY   = `${storageKey}_v8_rowdata`;
  const LS_LEVEL = `${storageKey}_v8_prev_level`;

  // ── Hydrate from localStorage ─────────────────────────────────────
  useEffect(() => {
    const saved      = localStorage.getItem(LS_KEY);
    const savedLevel = localStorage.getItem(LS_LEVEL);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, RowData>;
        const merged: Record<string, RowData> = {};
        constituents.forEach(c => { merged[c.symbol] = parsed[c.symbol] ?? initRow(c); });
        setRowData(merged);
      } catch { /* ignore corrupt */ }
    }
    if (savedLevel) setPrevStr(savedLevel);
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // ── Persist to localStorage ───────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_KEY, JSON.stringify(rowData));
  }, [rowData, LS_KEY, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_LEVEL, prevLevelStr);
  }, [prevLevelStr, LS_LEVEL, hydrated]);

  // ── Fetch prevClose from Dhan and populate Prev Close column ──────
  const fetchPrevClose = useCallback(async () => {
    if (!dhan.isConfigured) return;
    setPcStatus('fetching');
    try {
      const res = await fetch(
        `/api/dhan/equity-prices?symbols=${encodeURIComponent(symbolsRef.current)}`,
        { headers: dhan.headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as DhanResp;
      const entries = Object.entries(data.quotes ?? {});
      if (entries.length === 0) { setPcStatus('error'); return; }
      setRowData(prev => {
        const next = { ...prev };
        entries.forEach(([sym, q]) => {
          if (next[sym] && q.prevClose > 0)
            next[sym] = { ...next[sym], prevClose: String(q.prevClose) };
        });
        return next;
      });
      setPcStatus('done');
    } catch {
      setPcStatus('error');
    }
  }, [dhan.isConfigured, dhan.headers]);

  // Auto-fetch prevClose once after both hydration + Dhan credentials ready
  useEffect(() => {
    if (!hydrated || !dhan.isHydrated || !dhan.isConfigured) return;
    if (hasFetchedPC.current) return;
    hasFetchedPC.current = true;
    fetchPrevClose();
  }, [hydrated, dhan.isHydrated, dhan.isConfigured, fetchPrevClose]);

  // ── Live price polling (every 15 s during market hours) ──────────
  useEffect(() => {
    if (!hydrated || !dhan.isHydrated) return;

    async function fetchLive() {
      if (!isMarketOpen()) { setStatus('closed'); return; }
      setStatus('fetching');

      try {
        if (dhan.isConfigured) {
          // ── Dhan path ─────────────────────────────────────────────
          const res = await fetch(
            `/api/dhan/equity-prices?symbols=${encodeURIComponent(symbolsRef.current)}`,
            { headers: dhan.headers },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as DhanResp;
          const entries = Object.entries(data.quotes ?? {});
          if (entries.length === 0) { setStatus('error'); return; }
          setRowData(prev => {
            const next = { ...prev };
            entries.forEach(([sym, q]) => {
              if (next[sym] && q.ltp > 0)
                next[sym] = { ...next[sym], price: String(q.ltp) };
            });
            return next;
          });
        } else {
          // ── Yahoo Finance fallback (no Dhan credentials) ──────────
          const res = await fetch(
            `/api/live-prices?symbols=${encodeURIComponent(symbolsRef.current)}`,
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as YFResp;
          const entries = Object.entries(data.prices ?? {});
          if (entries.length === 0) { setStatus('error'); return; }
          setRowData(prev => {
            const next = { ...prev };
            entries.forEach(([sym, q]) => {
              if (next[sym]) next[sym] = { ...next[sym], price: String(q.price) };
            });
            return next;
          });
        }
        setLastTime(istTimeStr());
        setStatus('live');
      } catch {
        setStatus('error');
      }
    }

    fetchLive();
    const timer = setInterval(fetchLive, 15_000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, dhan.isHydrated, dhan.isConfigured, dhan.accessToken]);

  // ── Mutation helpers ──────────────────────────────────────────────
  const update = (symbol: string, field: keyof RowData, value: string) =>
    setRowData(prev => ({ ...prev, [symbol]: { ...prev[symbol], [field]: value } }));

  const setAsClose = () =>
    setRowData(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(sym => {
        if (next[sym].price !== '')
          next[sym] = { ...next[sym], prevClose: next[sym].price, price: '' };
      });
      return next;
    });

  const clearPrice = () =>
    setRowData(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(sym => { next[sym] = { ...next[sym], price: '' }; });
      return next;
    });

  const resetAll = () => {
    setRowData(() => {
      const d: Record<string, RowData> = {};
      constituents.forEach(c => { d[c.symbol] = initRow(c); });
      return d;
    });
    setPrevStr(String(defaultPrevLevel));
    hasFetchedPC.current = false;
  };

  // ── Derived calculations ──────────────────────────────────────────
  const prevLevel = toNum(prevLevelStr) ?? defaultPrevLevel;

  const rows = constituents.map(c => {
    const rd     = rowData[c.symbol] ?? initRow(c);
    const w      = toNum(rd.weight) ?? c.defaultWeight;
    const price  = toNum(rd.price);
    const prevCl = toNum(rd.prevClose);
    let changePct: number | null = null;
    let contribPct: number | null = null;
    let pts: number | null = null;
    if (price !== null && prevCl !== null && prevCl !== 0) {
      changePct  = (price - prevCl) / prevCl * 100;
      contribPct = (w / 100) * changePct;
      pts        = prevLevel * contribPct / 100;
    }
    return { ...c, rd, w, price, prevCl, changePct, contribPct, pts };
  });

  const totalWeight  = rows.reduce((s, r) => s + r.w, 0);
  const filledRows   = rows.filter(r => r.changePct !== null);
  const totalContrib = filledRows.reduce((s, r) => s + (r.contribPct ?? 0), 0);
  const hasData      = filledRows.length > 0;
  const currentIndex = hasData ? prevLevel * (1 + totalContrib / 100) : null;
  const indexChg     = currentIndex !== null ? currentIndex - prevLevel : null;
  const indexChgPct  = currentIndex !== null && prevLevel > 0 ? (indexChg! / prevLevel) * 100 : null;
  const weightOk     = Math.abs(totalWeight - 100) <= 1;

  if (!hydrated) return null;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">

          {/* Title + index readout */}
          <div className="flex items-end gap-8">
            <div>
              <h1 className="text-lg font-bold">{indexName}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {dhan.isConfigured
                  ? 'Prices via Dhan API · auto-update 09:15-15:40 IST'
                  : 'Prices via Yahoo Finance (configure Dhan in Settings for accuracy)'}
              </p>
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums leading-none">
                {currentIndex !== null ? fmtIdx(currentIndex) : '—'}
              </div>
              {currentIndex !== null && indexChg !== null && indexChgPct !== null && (
                <div className={cn('text-sm font-semibold tabular-nums mt-0.5',
                  indexChg >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {signed(indexChg)} ({signed(indexChgPct)}%)
                </div>
              )}
              {currentIndex !== null && !weightOk && (
                <p className="text-xs text-amber-600 mt-0.5">Weights {totalWeight.toFixed(1)}% (not 100%)</p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Prev Index Level:</span>
            <input
              type="number" value={prevLevelStr}
              onChange={e => setPrevStr(e.target.value)}
              className="w-28 h-7 px-2 text-xs border border-border rounded bg-background tabular-nums
                         focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />

            {/* Sync Prev Close from Dhan */}
            {dhan.isConfigured && (
              <button
                onClick={() => fetchPrevClose()}
                disabled={pcStatus === 'fetching'}
                title="Fetch yesterday's official closing prices from Dhan and set as Prev Close"
                className={cn(
                  'flex items-center gap-1.5 h-7 px-3 text-xs rounded border font-medium transition-colors',
                  pcStatus === 'fetching'
                    ? 'border-blue-300 text-blue-400 cursor-not-allowed'
                    : pcStatus === 'done'
                    ? 'border-blue-500 text-blue-600 hover:bg-blue-50'
                    : pcStatus === 'error'
                    ? 'border-red-400 text-red-500 hover:bg-red-50'
                    : 'border-blue-400 text-blue-600 hover:bg-blue-50',
                )}
              >
                <RefreshCw className={cn('size-3', pcStatus === 'fetching' && 'animate-spin')} />
                {pcStatus === 'fetching' ? 'Syncing...' : pcStatus === 'done' ? 'Synced' : 'Sync Prev Close'}
              </button>
            )}

            {/* Set Close (end-of-day: copies Price → Prev Close) */}
            <button
              onClick={setAsClose}
              title="Copy today's live price → Prev Close, clear Price (use at 3:40 PM each day)"
              className="flex items-center gap-1.5 h-7 px-3 text-xs rounded border border-emerald-600
                         text-emerald-700 hover:bg-emerald-50 transition-colors font-medium"
            >
              <Clock className="size-3" /> Set Close
            </button>
            <button
              onClick={clearPrice}
              title="Clear Price column only"
              className="flex items-center gap-1.5 h-7 px-3 text-xs rounded border border-border
                         text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3" /> Clear Price
            </button>
            <button
              onClick={resetAll}
              title="Reset everything back to hardcoded defaults"
              className="flex items-center gap-1.5 h-7 px-3 text-xs rounded border border-border
                         text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="size-3" /> Reset All
            </button>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">

          {/* Live feed indicator */}
          <span className="flex items-center gap-1.5">
            {liveStatus === 'live' && (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-600 font-medium">LIVE</span>
                {lastTime && <span>· {lastTime} IST</span>}
              </>
            )}
            {liveStatus === 'fetching' && (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-600">Fetching...</span>
              </>
            )}
            {liveStatus === 'error' && (
              <>
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-red-500">Feed error -- retrying</span>
              </>
            )}
            {liveStatus === 'closed' && (
              <>
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                <span>Market closed</span>
              </>
            )}
          </span>

          <span>·</span>

          {/* Prev close sync status */}
          {dhan.isConfigured && pcStatus !== 'idle' && (
            <>
              <span className="flex items-center gap-1">
                {pcStatus === 'done'     && <span className="text-blue-600">Prev Close synced from Dhan</span>}
                {pcStatus === 'fetching' && <span className="text-amber-600">Syncing Prev Close...</span>}
                {pcStatus === 'error'    && <span className="text-red-500">Prev Close sync failed -- use Sync button</span>}
              </span>
              <span>·</span>
            </>
          )}

          <span>
            Weight:&nbsp;
            <span className={cn('font-semibold', weightOk ? 'text-emerald-600' : 'text-amber-600')}>
              {totalWeight.toFixed(2)}%
            </span>
          </span>
          <span>·</span>
          <span>{filledRows.length} / {constituents.length} stocks with price</span>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
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
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground">Wt %</th>
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground">
                    Price&nbsp;
                    <span className={cn('font-normal px-1 rounded',
                      liveStatus === 'live' ? 'bg-emerald-100 text-emerald-700' : 'text-muted-foreground/50')}>
                      {liveStatus === 'live' ? (dhan.isConfigured ? 'dhan' : 'live') : 'enter'}
                    </span>
                  </th>
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground">
                    Prev Close&nbsp;
                    <span className={cn('font-normal px-1 rounded',
                      pcStatus === 'done' ? 'bg-blue-100 text-blue-600' : 'text-muted-foreground/50')}>
                      {pcStatus === 'done' ? 'dhan' : 'enter'}
                    </span>
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Chg %</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Contrib %</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Idx Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.symbol} className={cn(
                    'border-b border-border/40',
                    i % 2 === 1 && 'bg-muted/15',
                  )}>
                    <td className="px-3 py-1 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1 font-medium whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-1 font-mono text-muted-foreground">{r.symbol}</td>
                    <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">{r.sector}</td>

                    <td className="px-2 py-1 text-right">
                      <input type="number" min="0" step="0.01" value={r.rd.weight}
                        onChange={e => update(r.symbol, 'weight', e.target.value)}
                        className={cn(INPUT_CLS, 'w-20')} />
                    </td>

                    <td className="px-2 py-1 text-right">
                      <input type="number" min="0" step="0.05" value={r.rd.price}
                        onChange={e => update(r.symbol, 'price', e.target.value)}
                        placeholder="—"
                        className={cn(INPUT_CLS, 'w-24',
                          liveStatus === 'live' && r.rd.price !== '' && 'border-emerald-400/60')} />
                    </td>

                    <td className="px-2 py-1 text-right">
                      <input type="number" min="0" step="0.05" value={r.rd.prevClose}
                        onChange={e => update(r.symbol, 'prevClose', e.target.value)}
                        placeholder="—"
                        className={cn(INPUT_CLS, 'w-24',
                          pcStatus === 'done' && r.rd.prevClose !== '' && 'border-blue-300/60')} />
                    </td>

                    <td className={cn('px-3 py-1 text-right tabular-nums font-medium',
                      r.changePct === null ? 'text-muted-foreground/30'
                        : r.changePct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {r.changePct !== null ? `${signed(r.changePct)}%` : '—'}
                    </td>

                    <td className={cn('px-3 py-1 text-right tabular-nums',
                      r.contribPct === null ? 'text-muted-foreground/30'
                        : r.contribPct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {r.contribPct !== null ? `${signed(r.contribPct, 4)}%` : '—'}
                    </td>

                    <td className={cn('px-3 py-1 text-right tabular-nums font-semibold',
                      r.pts === null ? 'text-muted-foreground/30'
                        : r.pts >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {r.pts !== null ? signed(r.pts) : '—'}
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
                    {hasData ? `${signed(totalContrib, 4)}%` : '—'}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums font-bold',
                    (indexChg ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                    {indexChg !== null ? signed(indexChg) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Chg % = (Price - Prev Close) / Prev Close x 100 &nbsp;·&nbsp;
          Contrib % = Weight x Chg% / 100 &nbsp;·&nbsp;
          Idx Pts = Prev Level x Contrib% / 100
        </p>
      </div>
    </div>
  );
}
