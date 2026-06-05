'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import type { OIScreenerRow, SymbolDebug } from '@/lib/oi-screener';
import type { OIBuildupData, OIBuildupRow } from '@/app/api/dhan/oi-buildup/route';

// ── Types ──────────────────────────────────────────────────────────────────────

type BuildupCategory = 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding';

interface SourceEntry {
  symbol:      string;
  category:    BuildupCategory;
  oiChangePct: number;  // futures OI % change
  changePct:   number;  // price % change
  price:       number;  // futures price
}

interface EnrichedRow extends OIScreenerRow {
  source?: SourceEntry;
}

interface ScreenerResponse {
  all: OIScreenerRow[];
  scanned: number;
  scannedAt: string;
  weeklyExpiry: string;
  stockExpiry: string;
  n: number;
  _debug?: { symbols: SymbolDebug[] };
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TOP_PER_CATEGORY = 10;

const CATEGORY_CONFIG: Record<BuildupCategory, {
  label: string; desc: string;
  bg: string; text: string; border: string; dot: string;
  activeBg: string;
}> = {
  'Long Buildup':   { label: 'Long Buildup',  desc: 'Price ↑  OI ↑', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', activeBg: 'bg-emerald-600' },
  'Short Buildup':  { label: 'Short Buildup', desc: 'Price ↓  OI ↑', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',     activeBg: 'bg-red-600' },
  'Short Covering': { label: 'Short Cover',   desc: 'Price ↑  OI ↓', bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500',     activeBg: 'bg-sky-600' },
  'Long Unwinding': { label: 'Long Unwind',   desc: 'Price ↓  OI ↓', bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500',  activeBg: 'bg-orange-600' },
};

const N_OPTIONS = [
  { value: 5,  label: 'N=5 (11 strikes)' },
  { value: 7,  label: 'N=7 (15 strikes)' },
  { value: 10, label: 'N=10 (21 strikes)' },
  { value: 15, label: 'N=15 (31 strikes)' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtOI(n: number) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '−' : '+';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000)    return `${sign}${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)      return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${n >= 0 ? '+' : '−'}${abs.toLocaleString('en-IN')}`;
}

function extractTopStocks(data: OIBuildupData): SourceEntry[] {
  const seen = new Set<string>();
  const result: SourceEntry[] = [];

  const add = (rows: OIBuildupRow[], cat: BuildupCategory) => {
    for (const r of rows.slice(0, TOP_PER_CATEGORY)) {
      if (!seen.has(r.symbol)) {
        seen.add(r.symbol);
        result.push({ symbol: r.symbol, category: cat, oiChangePct: r.oiChangePct, changePct: r.changePct, price: r.price });
      }
    }
  };

  add(data.lb, 'Long Buildup');
  add(data.sb, 'Short Buildup');
  add(data.sc, 'Short Covering');
  add(data.lu, 'Long Unwinding');
  return result;
}

// ── Category badge ─────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category?: BuildupCategory }) {
  if (!category) return <span className="text-[10px] text-slate-400">—</span>;
  const cfg = CATEGORY_CONFIG[category];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Stock card ─────────────────────────────────────────────────────────────────

function StockCard({ row, rank, side }: { row: EnrichedRow; rank: number; side: 'bullish' | 'bearish' }) {
  const isBull       = side === 'bullish';
  const rankBg       = isBull ? 'bg-emerald-600' : 'bg-red-600';
  const oiSignalClr  = isBull ? 'text-emerald-600' : 'text-red-600';
  const pricePct     = row.source?.changePct;
  const priceClr     = pricePct == null ? 'text-slate-400' : pricePct >= 0 ? 'text-emerald-600' : 'text-red-600';
  const futOIPct     = row.source?.oiChangePct;
  const futOIClr     = futOIPct == null ? 'text-slate-400' : futOIPct >= 0 ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full ${rankBg} text-white text-xs font-black`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          {/* Symbol + expiry + badge */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2.5">
            <span className="font-black text-gray-900 font-mono text-base leading-none tracking-tight">{row.symbol}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">{row.expiry}</span>
            <CategoryBadge category={row.source?.category} />
          </div>

          {/* 3 metric tiles */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Options OI</div>
              <div className={`text-sm font-black tabular-nums leading-none ${oiSignalClr}`}>
                {row.netOIChgPct >= 0 ? '+' : ''}{row.netOIChgPct.toFixed(2)}%
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Fut OI Chg</div>
              <div className={`text-sm font-bold tabular-nums leading-none ${futOIClr}`}>
                {futOIPct != null ? `${futOIPct >= 0 ? '+' : ''}${futOIPct.toFixed(2)}%` : '—'}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Price Chg</div>
              <div className={`text-sm font-bold tabular-nums leading-none ${priceClr}`}>
                {pricePct != null ? `${pricePct >= 0 ? '+' : ''}${pricePct.toFixed(2)}%` : '—'}
              </div>
            </div>
          </div>

          {/* CE/PE OI detail */}
          <div className="flex gap-4 text-[11px]">
            <span className="text-slate-400">CE OI Chg <span className="font-semibold font-mono text-rose-600">{fmtOI(row.ceOIChg)}</span></span>
            <span className="text-slate-400">PE OI Chg <span className="font-semibold font-mono text-emerald-600">{fmtOI(row.peOIChg)}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton card ──────────────────────────────────────────────────────────────

function SkeletonCard({ isBull }: { isBull: boolean }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 last:border-0 animate-pulse">
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex-shrink-0 ${isBull ? 'bg-emerald-100' : 'bg-red-100'}`} />
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-4 w-20 bg-slate-100 rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-12 bg-slate-100 rounded-lg" />
            <div className="h-12 bg-slate-100 rounded-lg" />
            <div className="h-12 bg-slate-100 rounded-lg" />
          </div>
          <div className="h-3 w-48 bg-slate-100 rounded" />
        </div>
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

function Panel({ rows, side, loading, topN }: {
  rows: EnrichedRow[]; side: 'bullish' | 'bearish'; loading: boolean; topN: number;
}) {
  const isBull = side === 'bullish';
  return (
    <div className={`bg-white rounded-2xl overflow-hidden border-2 shadow-sm ${isBull ? 'border-emerald-500' : 'border-red-500'}`}>
      <div className={`px-5 py-4 ${isBull ? 'bg-emerald-600' : 'bg-red-600'}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{isBull ? '🟢' : '🔴'}</span>
          <div>
            <p className="text-white font-black text-lg tracking-tight">
              TOP {topN} {isBull ? 'BULLISH' : 'BEARISH'} STOCKS
            </p>
            <p className="text-white/70 text-[10px] font-medium mt-0.5">
              {isBull ? '(PE OI Chg − CE OI Chg) / Total OI  ·  ratio > 0' : '(PE OI Chg − CE OI Chg) / Total OI  ·  ratio < 0'}
            </p>
          </div>
        </div>
      </div>
      <div>
        {loading
          ? Array.from({ length: topN }).map((_, i) => <SkeletonCard key={i} isBull={isBull} />)
          : rows.length === 0
          ? <div className="py-14 text-center text-slate-400 text-sm">No stocks matched this signal yet</div>
          : rows.slice(0, topN).map((row, i) => (
              <StockCard key={row.symbol} row={row} rank={i + 1} side={side} />
            ))}
      </div>
    </div>
  );
}

// ── Source mini-panel ──────────────────────────────────────────────────────────

function SourcePanel({ category, stocks }: { category: BuildupCategory; stocks: SourceEntry[] }) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <div className="px-3 py-2 border-b border-current/10 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.text}`}>{cfg.label}</span>
        <span className={`text-[10px] ${cfg.text} opacity-60`}>— {cfg.desc}</span>
        <span className={`ml-auto text-[10px] font-bold ${cfg.text}`}>{stocks.length}</span>
      </div>
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {stocks.map(s => (
          <span key={s.symbol} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${cfg.text} bg-white/60 border ${cfg.border}`}>
            {s.symbol}
            <span className="opacity-60">{s.oiChangePct >= 0 ? '+' : ''}{s.oiChangePct.toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OIScreenNewPage() {
  const { isConfigured, isHydrated, headers } = useDhanCredentials();

  // Phase 1: OI Buildup → source stock list
  const [sourceStocks,    setSourceStocks]    = useState<SourceEntry[]>([]);
  const [buildupLoading,  setBuildupLoading]  = useState(false);
  const [buildupError,    setBuildupError]    = useState('');

  // Phase 2: Dhan option chain for those stocks
  const [rows,        setRows]        = useState<OIScreenerRow[]>([]);
  const [scanned,     setScanned]     = useState(0);
  const [scannedAt,   setScannedAt]   = useState('');
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError,   setScreenerError]   = useState('');

  // Settings
  const [n,      setN]      = useState(7);
  const [topN,   setTopN]   = useState(5);
  const [showAll, setShowAll] = useState(false);

  // Build a lookup map: symbol → source entry
  const sourceMap = useMemo(() => new Map(sourceStocks.map(s => [s.symbol, s])), [sourceStocks]);

  // Category breakdown for display
  const byCategory = useMemo(() => {
    const m: Partial<Record<BuildupCategory, SourceEntry[]>> = {};
    for (const s of sourceStocks) {
      (m[s.category] ??= []).push(s);
    }
    return m;
  }, [sourceStocks]);

  // Enrich screener rows with source data
  const enrichedRows = useMemo<EnrichedRow[]>(() => {
    if (rows.length === 0) return [];
    return rows.map(r => ({ ...r, source: sourceMap.get(r.symbol) }));
  }, [rows, sourceMap]);

  const bullish = useMemo(() => enrichedRows.filter(r => r.netOIChgPct > 0), [enrichedRows]);
  const bearish = useMemo(() => [...enrichedRows].reverse().filter(r => r.netOIChgPct < 0), [enrichedRows]);

  // ── Phase 1: Fetch OI Buildup ──
  const fetchBuildup = useCallback(async () => {
    setBuildupLoading(true);
    setBuildupError('');
    try {
      const res  = await fetch('/api/dhan/oi-buildup');
      const json = await res.json() as OIBuildupData;
      if (!res.ok || json.error) {
        setBuildupError(json.error ?? `HTTP ${res.status}`);
      } else {
        setSourceStocks(extractTopStocks(json));
      }
    } catch (e) {
      setBuildupError(String(e));
    } finally {
      setBuildupLoading(false);
    }
  }, []);

  // ── Phase 2: Run Dhan screener for source stocks ──
  const runScreen = useCallback(async (stocks: SourceEntry[]) => {
    if (!isConfigured || stocks.length === 0) return;
    setScreenerLoading(true);
    setScreenerError('');
    setRows([]);
    try {
      const symbols = stocks.map(s => s.symbol).join(',');
      const res  = await fetch(`/api/dhan/oi-screener-new?symbols=${encodeURIComponent(symbols)}&n=${n}`, { headers });
      const json = await res.json() as ScreenerResponse;
      if (!res.ok || json.error) {
        setScreenerError(json.error ?? `HTTP ${res.status}`);
      } else {
        setRows(json.all ?? []);
        setScanned(json.scanned ?? 0);
        setScannedAt(json.scannedAt ?? '');
      }
    } catch (e) {
      setScreenerError(String(e));
    } finally {
      setScreenerLoading(false);
    }
  }, [isConfigured, headers, n]);

  // On mount: fetch OI buildup
  useEffect(() => {
    if (isHydrated) fetchBuildup();
  }, [isHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once buildup is ready + credentials exist → auto-run screener
  useEffect(() => {
    if (sourceStocks.length > 0 && isConfigured && !screenerLoading && rows.length === 0) {
      runScreen(sourceStocks);
    }
  }, [sourceStocks, isConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isHydrated) return null;

  const scannedTime = scannedAt
    ? new Date(scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  const statusLine = buildupLoading
    ? 'Loading OI Buildup top stocks…'
    : buildupError
    ? 'OI Buildup fetch failed — see error below'
    : screenerLoading
    ? `Scanning ${sourceStocks.length} stocks with Dhan option chains…`
    : scannedAt
    ? `${scanned} scanned · ${scannedTime} · Top ${TOP_PER_CATEGORY} per buildup category`
    : sourceStocks.length > 0
    ? `${sourceStocks.length} stocks selected · waiting for Dhan credentials`
    : 'Loading…';

  return (
    <main className="px-5 py-5 space-y-5">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">OI Screen — Top 40 F&amp;O</h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">{statusLine}</p>
      </div>

      {/* ── Source stock breakdown ── */}
      {sourceStocks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Stocks selected from OI Buildup — top {TOP_PER_CATEGORY} per category by OI % change
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(CATEGORY_CONFIG) as BuildupCategory[]).map(cat => (
              <SourcePanel key={cat} category={cat} stocks={byCategory[cat] ?? []} />
            ))}
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      {isConfigured && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* N strikes */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ATM Strikes (N per side)</span>
              <select
                value={n}
                onChange={e => setN(Number(e.target.value))}
                disabled={screenerLoading}
                className="px-3 py-2 text-sm font-semibold text-gray-900 bg-white border border-slate-200 rounded-lg shadow-sm disabled:opacity-50 cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors"
              >
                {N_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            {/* Top N */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Top N per panel</span>
              <select
                value={topN}
                onChange={e => setTopN(Number(e.target.value))}
                className="px-3 py-2 text-sm font-semibold text-gray-900 bg-white border border-slate-200 rounded-lg shadow-sm cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors"
              >
                {[5, 10, 15, 20].map(v => <option key={v} value={v}>Top {v}</option>)}
              </select>
            </label>

            <div className="flex flex-col justify-end gap-2">
              <button
                onClick={() => runScreen(sourceStocks)}
                disabled={screenerLoading || sourceStocks.length === 0}
                className="px-5 py-2 font-bold rounded-lg text-sm transition-colors disabled:opacity-60 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {screenerLoading ? 'Scanning…' : '↻ Re-scan'}
              </button>
            </div>

            <div className="flex flex-col justify-end">
              <button
                onClick={fetchBuildup}
                disabled={buildupLoading}
                className="px-5 py-2 font-bold rounded-lg text-sm transition-colors disabled:opacity-60 bg-slate-600 hover:bg-slate-500 text-white"
              >
                {buildupLoading ? 'Loading…' : '↻ Refresh Buildup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pre-market warning ── */}
      {(() => {
        const h = new Date().getUTCHours() * 60 + new Date().getUTCMinutes(); // minutes since UTC midnight
        const ist = (h + 330) % 1440; // IST = UTC+5:30
        const isPreMarket = ist < 9 * 60 + 15 || ist >= 15 * 60 + 30;
        return isPreMarket ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-800 text-sm">
            <span className="font-bold">Market is closed</span> — Dhan's option chain shows intraday OI change only, which is 0 before 9:15 AM IST.
            Options OI Signal will show real values once trading begins. Futures OI % (from OI Buildup) is available at all times.
          </div>
        ) : null;
      })()}

      {/* ── Credentials warning ── */}
      {!isConfigured && isHydrated && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-700 text-sm font-medium">
          Dhan credentials required for option chain scan.{' '}
          <a href="/settings" className="underline">Configure in Settings</a>
        </div>
      )}

      {/* ── Errors ── */}
      {buildupError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-red-700 text-sm font-medium">OI Buildup error: {buildupError}</div>
      )}
      {screenerError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-red-700 text-sm font-medium">{screenerError}</div>
      )}

      {/* ── Panels ── */}
      {(screenerLoading || enrichedRows.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel rows={bullish} side="bullish" loading={screenerLoading} topN={topN} />
          <Panel rows={bearish} side="bearish" loading={screenerLoading} topN={topN} />
        </div>
      )}

      {/* ── Full table ── */}
      {enrichedRows.length > 0 && !screenerLoading && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowAll(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              All {scanned} Scanned Stocks — Ranked by Options OI Signal
            </p>
            <span className="text-slate-400 text-sm">{showAll ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showAll && (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left   text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                    <th className="px-4 py-3 text-left   text-[10px] font-bold text-slate-400 uppercase tracking-widest">Symbol</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Source</th>
                    <th className="px-4 py-3 text-right  text-[10px] font-bold text-rose-500   uppercase tracking-widest">CE OI Chg</th>
                    <th className="px-4 py-3 text-right  text-[10px] font-bold text-emerald-600 uppercase tracking-widest">PE OI Chg</th>
                    <th className="px-4 py-3 text-right  text-[10px] font-bold text-slate-400 uppercase tracking-widest">Options OI</th>
                    <th className="px-4 py-3 text-right  text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fut OI Chg%</th>
                    <th className="px-4 py-3 text-right  text-[10px] font-bold text-slate-400 uppercase tracking-widest">Price Chg%</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {enrichedRows.map((row, i) => {
                    const isBull   = row.netOIChgPct > 0;
                    const pricePct = row.source?.changePct;
                    const futOIPct = row.source?.oiChangePct;
                    const priceClr = pricePct == null ? 'text-slate-400' : pricePct >= 0 ? 'text-emerald-600' : 'text-red-600';
                    const futOIClr = futOIPct == null ? 'text-slate-400' : futOIPct >= 0 ? 'text-emerald-600' : 'text-red-600';
                    return (
                      <tr key={row.symbol} className={`hover:bg-slate-50 transition-colors ${i < 5 ? 'bg-emerald-50/50' : i >= enrichedRows.length - 5 ? 'bg-red-50/50' : ''}`}>
                        <td className="px-4 py-2.5 text-[10px] text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2.5 font-black font-mono text-gray-900 tracking-tight">{row.symbol}</td>
                        <td className="px-4 py-2.5 text-center"><CategoryBadge category={row.source?.category} /></td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold font-mono text-xs ${row.ceOIChg >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtOI(row.ceOIChg)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold font-mono text-xs ${row.peOIChg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtOI(row.peOIChg)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-black text-sm ${isBull ? 'text-emerald-600' : 'text-red-600'}`}>
                          {row.netOIChgPct >= 0 ? '+' : ''}{row.netOIChgPct.toFixed(2)}%
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold text-sm ${futOIClr}`}>
                          {futOIPct != null ? `${futOIPct >= 0 ? '+' : ''}${futOIPct.toFixed(2)}%` : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-bold text-sm ${priceClr}`}>
                          {pricePct != null ? `${pricePct >= 0 ? '+' : ''}${pricePct.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${isBull ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {isBull ? 'BULLISH' : 'BEARISH'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
