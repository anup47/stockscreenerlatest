'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Zap, Clock } from 'lucide-react';
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
  weight:        string;
  price:         string;  // Dhan LTP (live)
  prevClose:     string;  // captured 3:15 PM close (from /api/price-at-315)
  dhanPrevClose: string;  // Dhan official prevClose from quote API — reference baseline for Chg%
}

interface Props {
  indexName:        string;
  storageKey:       string;
  defaultPrevLevel: number;
  constituents:     Constituent[];
}

type LiveStatus = 'closed' | 'fetching' | 'live' | 'error';
type PriceMode  = 'live' | 'close';

function nowIst(): { mins: number; ms: number; day: number; ist: Date } {
  const ms  = Date.now() + (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(ms);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const day  = ist.getUTCDay();
  return { mins, ms, day, ist };
}

function isMarketOpen(): boolean {
  const { mins, day } = nowIst();
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 40;
}

function istTimeStr(): string {
  const { ist } = nowIst();
  return [ist.getUTCHours(), ist.getUTCMinutes(), ist.getUTCSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
}

function msUntilNext315(): number {
  const { ms: nowMs, ist, day } = nowIst();
  const msInDay = (ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds()) * 1000
    + ist.getUTCMilliseconds();
  const istMidnightUtc = nowMs - msInDay;
  const target315today = istMidnightUtc + (15 * 60 + 15) * 60 * 1000;
  if (day !== 0 && day !== 6 && target315today - nowMs > 2000) return target315today - nowMs;
  let daysAhead = 1;
  for (let i = 1; i <= 7; i++) {
    const next = (day + i) % 7;
    if (next !== 0 && next !== 6) { daysAhead = i; break; }
  }
  return target315today + daysAhead * 24 * 3600 * 1000 - nowMs;
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

export default function IndexTracker({
  indexName, storageKey, defaultPrevLevel, constituents,
}: Props) {
  const initRow = useCallback((c: Constituent): RowData => ({
    weight:        String(c.defaultWeight),
    price:         '',
    prevClose:     c.defaultPrevClose !== undefined ? String(c.defaultPrevClose) : '',
    dhanPrevClose: c.defaultPrevClose !== undefined ? String(c.defaultPrevClose) : '',
  }), []);

  const [rowData, setRowData]   = useState<Record<string, RowData>>(() => {
    const d: Record<string, RowData> = {};
    constituents.forEach(c => { d[c.symbol] = {
      weight: String(c.defaultWeight), price: '',
      prevClose: c.defaultPrevClose !== undefined ? String(c.defaultPrevClose) : '',
      dhanPrevClose: c.defaultPrevClose !== undefined ? String(c.defaultPrevClose) : '',
    }; });
    return d;
  });
  const [prevLevelStr, setPrevStr]         = useState(String(defaultPrevLevel));
  const [priceMode, setPriceMode]          = useState<PriceMode>('live');
  const [hydrated, setHydrated]            = useState(false);
  const [liveStatus, setStatus]            = useState<LiveStatus>('closed');
  const [lastTime, setLastTime]            = useState('');
  const [captureStatus, setCaptureStatus]  = useState<'idle' | 'fetching' | 'done' | 'error'>('idle');
  const [captureSource, setCaptureSource]  = useState('');
  const [lastCapture, setLastCapture]      = useState('');

  const dhan            = useDhanCredentials();
  const symbolsRef      = useRef(constituents.map(c => c.symbol).join(','));
  const captureTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dhanRef         = useRef({ isConfigured: dhan.isConfigured, headers: dhan.headers });
  const captureCloseRef = useRef<(silent?: boolean) => Promise<void>>(() => Promise.resolve());
  const fetchLiveRef    = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    dhanRef.current = { isConfigured: dhan.isConfigured, headers: dhan.headers };
  }, [dhan.isConfigured, dhan.headers]);

  const LS_KEY     = `${storageKey}_v10_rowdata`;
  const LS_LEVEL   = `${storageKey}_v10_prev_level`;
  const LS_CAPTURE = `${storageKey}_v10_last_capture`;
  const LS_MODE    = `${storageKey}_v10_price_mode`;

  // Hydrate — with v9 → v10 migration
  useEffect(() => {
    const saved10    = localStorage.getItem(LS_KEY);
    const savedLevel = localStorage.getItem(LS_LEVEL) ?? localStorage.getItem(`${storageKey}_v9_prev_level`);
    const savedCap   = localStorage.getItem(LS_CAPTURE) ?? localStorage.getItem(`${storageKey}_v9_last_capture`);
    const savedMode  = localStorage.getItem(LS_MODE);

    if (saved10) {
      try {
        const parsed = JSON.parse(saved10) as Record<string, RowData>;
        const merged: Record<string, RowData> = {};
        constituents.forEach(c => { merged[c.symbol] = parsed[c.symbol] ?? initRow(c); });
        setRowData(merged);
      } catch { /* ignore */ }
    } else {
      // Migrate from v9 (preserves captured prevClose values)
      const saved9 = localStorage.getItem(`${storageKey}_v9_rowdata`);
      if (saved9) {
        try {
          const parsed9 = JSON.parse(saved9) as Record<string, { weight: string; price: string; prevClose: string }>;
          const migrated: Record<string, RowData> = {};
          constituents.forEach(c => {
            const old = parsed9[c.symbol];
            migrated[c.symbol] = old
              ? { weight: old.weight, price: old.price, prevClose: old.prevClose, dhanPrevClose: old.prevClose }
              : initRow(c);
          });
          setRowData(migrated);
        } catch { /* ignore */ }
      }
    }

    if (savedLevel) setPrevStr(savedLevel);
    if (savedCap)   setLastCapture(savedCap);
    if (savedMode === 'close') setPriceMode('close');
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist
  useEffect(() => { if (hydrated) localStorage.setItem(LS_KEY,   JSON.stringify(rowData)); }, [rowData,      LS_KEY,   hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(LS_LEVEL, prevLevelStr);            }, [prevLevelStr, LS_LEVEL, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(LS_MODE,  priceMode);               }, [priceMode,   LS_MODE,  hydrated]);

  // Auto-capture at 3:15 PM IST
  useEffect(() => {
    if (!hydrated) return;
    function scheduleCapture() {
      const ms = msUntilNext315();
      captureTimer.current = setTimeout(async () => {
        await captureCloseRef.current(true);
        const t = istTimeStr();
        setLastCapture(t);
        localStorage.setItem(`${storageKey}_v10_last_capture`, t);
        scheduleCapture();
      }, ms);
    }
    scheduleCapture();
    return () => { if (captureTimer.current) clearTimeout(captureTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, storageKey]);

  // Live LTP polling — always updates dhanPrevClose (available even when market closed)
  useEffect(() => {
    if (!hydrated || !dhan.isHydrated) return;
    let active = true;

    async function fetchLive() {
      const open = isMarketOpen();
      if (!dhan.isConfigured) { setStatus('closed'); return; }
      if (open) setStatus('fetching');
      try {
        const res = await fetch(
          `/api/dhan/equity-prices?symbols=${encodeURIComponent(symbolsRef.current)}`,
          { headers: dhan.headers },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data    = await res.json() as DhanResp;
        // prevClose is non-zero even when market is closed — always capture it as reference baseline
        const entries = Object.entries(data.quotes ?? {}).filter(([, q]) => q.prevClose > 0);
        if (entries.length > 0 && active) {
          setRowData(prev => {
            const next = { ...prev };
            entries.forEach(([sym, q]) => {
              if (next[sym]) {
                const upd: Partial<RowData> = { dhanPrevClose: String(q.prevClose) };
                if (q.ltp > 0) upd.price = String(q.ltp);
                next[sym] = { ...next[sym], ...upd };
              }
            });
            return next;
          });
          setLastTime(istTimeStr());
          const hasLtp = entries.some(([, q]) => q.ltp > 0);
          setStatus(open && hasLtp ? 'live' : 'closed');
        } else if (active) {
          setStatus('closed');
        }
      } catch { if (active) setStatus('error'); }
    }

    fetchLiveRef.current = fetchLive;
    fetchLive();
    const timer = setInterval(() => {
      if (isMarketOpen()) fetchLive();
      else setStatus('closed');
    }, 5_000);
    return () => { active = false; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, dhan.isHydrated, dhan.isConfigured, dhan.accessToken]);

  const update = (symbol: string, field: keyof RowData, value: string) =>
    setRowData(prev => ({ ...prev, [symbol]: { ...prev[symbol], [field]: value } }));

  // Capture close prices from Dhan (3:15 PM candle after 3:15, prevClose before)
  const captureClose = useCallback(async (silent = false) => {
    if (!dhan.isConfigured) {
      if (!silent) { setCaptureStatus('error'); setCaptureSource('Dhan not configured'); }
      return;
    }
    if (!silent) setCaptureStatus('fetching');
    try {
      const res = await fetch(
        `/api/price-at-315?symbols=${encodeURIComponent(symbolsRef.current)}`,
        { headers: dhan.headers },
      );
      if (res.ok) {
        const data  = await res.json() as { prices: Record<string, number>; date?: string; source?: string };
        const valid = Object.entries(data.prices ?? {}).filter(([, p]) => p > 0);
        if (valid.length > 0) {
          setRowData(prev => {
            const next = { ...prev };
            valid.forEach(([sym, price]) => {
              if (next[sym]) next[sym] = { ...next[sym], prevClose: String(price) };
            });
            return next;
          });
          if (!silent) {
            const label = data.source === 'dhan-intraday-315'
              ? `Dhan 3:15 PM candle ${data.date ?? ''} (${valid.length} stocks)`
              : `Dhan prev close ${data.date ?? ''} (${valid.length} stocks)`;
            setCaptureStatus('done');
            setCaptureSource(label);
          }
          return;
        }
      }
    } catch { /* nothing */ }
    if (!silent) { setCaptureStatus('error'); setCaptureSource('Dhan returned no data'); }
  }, [dhan.isConfigured, dhan.headers]);

  useEffect(() => { captureCloseRef.current = captureClose; }, [captureClose]);

  const resetAll = () => {
    const d: Record<string, RowData> = {};
    constituents.forEach(c => { d[c.symbol] = initRow(c); });
    setRowData(d);
    setPrevStr(String(defaultPrevLevel));
    setPriceMode('live');
    setLastCapture('');
    setCaptureStatus('idle');
    setCaptureSource('');
    localStorage.removeItem(LS_CAPTURE);
  };

  // Derived calculations
  const prevLevel = toNum(prevLevelStr) ?? defaultPrevLevel;

  const rows = constituents.map(c => {
    const rd     = rowData[c.symbol] ?? initRow(c);
    const w      = toNum(rd.weight) ?? c.defaultWeight;
    // Active price: LTP in live mode, captured close in close mode
    const price  = priceMode === 'live' ? toNum(rd.price) : toNum(rd.prevClose);
    // Reference baseline: Dhan's official prevClose (previous session close) — same in both modes
    const prevCl = toNum(rd.dhanPrevClose);
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

  const { mins: curMins, day: curDay } = nowIst();
  const marketClosed315Today = curMins >= 15 * 60 + 15 && curDay !== 0 && curDay !== 6;

  if (!hydrated) return null;

  return (
    <div className="min-h-screen bg-background">

      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">

          {/* Title + index readout */}
          <div className="flex items-end gap-8">
            <div>
              <h1 className="text-lg font-bold">{indexName}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {priceMode === 'live'
                  ? 'Live mode: LTP vs Dhan prev session close → intraday Chg%'
                  : 'Close mode: 3:15 PM close vs Dhan prev session close → day-over-day Chg%'}
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
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Prev Level:</span>
            <input
              type="number" value={prevLevelStr}
              onChange={e => setPrevStr(e.target.value)}
              className="w-28 h-7 px-2 text-xs border border-border rounded bg-background tabular-nums
                         focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />

            {/* Mode toggle: Live Prices / Close Prices */}
            <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
              <button
                onClick={() => {
                  setPriceMode('live');
                  void fetchLiveRef.current();
                }}
                className={cn(
                  'flex items-center gap-1.5 h-7 px-3 text-xs rounded-md font-medium transition-all',
                  priceMode === 'live'
                    ? 'bg-background shadow-sm text-emerald-700 ring-1 ring-emerald-200'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Zap className="size-3" />
                Live Prices
              </button>
              <button
                onClick={() => {
                  setPriceMode('close');
                  setCaptureStatus('idle');
                  setCaptureSource('');
                  void captureClose(false);
                }}
                disabled={captureStatus === 'fetching'}
                className={cn(
                  'flex items-center gap-1.5 h-7 px-3 text-xs rounded-md font-medium transition-all',
                  priceMode === 'close'
                    ? 'bg-background shadow-sm text-violet-700 ring-1 ring-violet-200'
                    : 'text-muted-foreground hover:text-foreground',
                  captureStatus === 'fetching' && 'cursor-not-allowed',
                )}
              >
                <Clock className={cn('size-3', captureStatus === 'fetching' && 'animate-spin')} />
                Close Prices
              </button>
            </div>

            <button onClick={resetAll}
              className="flex items-center gap-1.5 h-7 px-3 text-xs rounded border border-border
                         text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="size-3" /> Reset All
            </button>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            {liveStatus === 'live' && (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-600 font-medium">LIVE · Dhan LTP · {lastTime} IST · 5s</span>
              </>
            )}
            {liveStatus === 'fetching' && <><span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /><span className="text-amber-600">Fetching...</span></>}
            {liveStatus === 'error'    && <><span className="h-2 w-2 rounded-full bg-red-400" /><span className="text-red-500">Feed error -- retrying</span></>}
            {liveStatus === 'closed'   && <><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /><span>Market closed</span></>}
          </span>

          <span>·</span>

          <span className="flex items-center gap-1.5">
            {captureStatus === 'fetching' && <span className="text-violet-600 animate-pulse">Fetching close prices...</span>}
            {captureStatus === 'done' && captureSource && <span className="text-violet-700 font-medium">Close: {captureSource}</span>}
            {captureStatus === 'error' && captureSource && <span className="text-red-600">{captureSource}</span>}
            {captureStatus === 'idle' && (
              lastCapture
                ? <span className="text-violet-600 font-medium">Close auto-captured {lastCapture} IST</span>
                : marketClosed315Today
                ? <span className="text-amber-600">3:15 PM passed -- click Close Prices</span>
                : <span className="text-muted-foreground/70">Close auto-captures at 3:15 PM IST</span>
            )}
          </span>

          <span>·</span>
          <span>{filledRows.length} / {constituents.length} priced</span>

          <span>·</span>
          <span>
            Weight:&nbsp;
            <span className={cn('font-semibold', weightOk ? 'text-emerald-600' : 'text-amber-600')}>
              {totalWeight.toFixed(2)}%
            </span>
          </span>
        </div>
      </div>

      {/* Table */}
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

                  {/* Primary price column — switches between LTP and Close */}
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground">
                    {priceMode === 'live' ? (
                      <>LTP&nbsp;<span className={cn('font-normal px-1 rounded text-[10px]',
                        liveStatus === 'live'     ? 'bg-emerald-100 text-emerald-700' :
                        liveStatus === 'fetching' ? 'bg-amber-100 text-amber-700' :
                        'text-muted-foreground/40')}>
                        {liveStatus === 'live' ? 'live' : liveStatus === 'fetching' ? 'updating' : 'manual'}
                      </span></>
                    ) : (
                      <>Close&nbsp;<span className="font-normal px-1 rounded text-[10px] bg-violet-100 text-violet-700">3:15 PM</span></>
                    )}
                  </th>

                  {/* Reference baseline: Dhan prevClose — previous session official close */}
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground">
                    Ref Close&nbsp;<span className="font-normal text-[10px] text-muted-foreground/50">dhan</span>
                  </th>

                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Chg %</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Contrib %</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Idx Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.symbol} className={cn('border-b border-border/40', i % 2 === 1 && 'bg-muted/15')}>
                    <td className="px-3 py-1 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1 font-medium whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-1 font-mono text-muted-foreground">{r.symbol}</td>
                    <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">{r.sector}</td>

                    <td className="px-2 py-1 text-right">
                      <input type="number" min="0" step="0.01" value={r.rd.weight}
                        onChange={e => update(r.symbol, 'weight', e.target.value)}
                        className={cn(INPUT_CLS, 'w-20')} />
                    </td>

                    {/* Primary price cell */}
                    <td className="px-2 py-1 text-right">
                      {priceMode === 'live' ? (
                        liveStatus === 'live' && r.rd.price !== '' ? (
                          <div className="inline-flex items-center justify-end gap-1 w-24">
                            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            </span>
                            <span className="tabular-nums font-semibold text-emerald-700">
                              {parseFloat(r.rd.price).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <input type="number" min="0" step="0.05" value={r.rd.price}
                            onChange={e => update(r.symbol, 'price', e.target.value)}
                            placeholder="—"
                            className={cn(INPUT_CLS, 'w-24')} />
                        )
                      ) : (
                        /* Close mode */
                        r.rd.prevClose !== '' ? (
                          <span className="tabular-nums font-semibold text-violet-700 block text-right pr-1">
                            {parseFloat(r.rd.prevClose).toFixed(2)}
                          </span>
                        ) : (
                          <input type="number" min="0" step="0.05" value={r.rd.prevClose}
                            onChange={e => update(r.symbol, 'prevClose', e.target.value)}
                            placeholder="—"
                            className={cn(INPUT_CLS, 'w-24')} />
                        )
                      )}
                    </td>

                    {/* Reference close: editable, auto-populated by live poll */}
                    <td className="px-2 py-1 text-right">
                      <input type="number" min="0" step="0.05" value={r.rd.dhanPrevClose}
                        onChange={e => update(r.symbol, 'dhanPrevClose', e.target.value)}
                        placeholder="—"
                        className={cn(INPUT_CLS, 'w-24',
                          r.rd.dhanPrevClose !== '' && 'border-blue-200/50')} />
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
          {priceMode === 'live'
            ? 'Live: LTP (Dhan, 5s) vs Ref Close (Dhan prev session) → intraday Chg%'
            : 'Close: 3:15 PM price vs Ref Close (Dhan prev session) → day-over-day Chg%'}
          &nbsp;·&nbsp;Ref Close column auto-populated from Dhan quote API
        </p>
      </div>
    </div>
  );
}
