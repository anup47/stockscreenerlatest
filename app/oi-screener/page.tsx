'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import type { OIScreenerRow, SymbolDebug } from '@/lib/oi-screener';
import type { OIBuildupData, OIBuildupRow } from '@/app/api/dhan/oi-buildup/route';

// ── Types ──────────────────────────────────────────────────────────────────────

type BuildupType = 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding';
type BuildupFilter = BuildupType | 'All';

interface BuildupInfo { type: BuildupType; changePct: number; price: number; }
interface EnrichedRow extends OIScreenerRow { buildup?: BuildupInfo; }

interface DebugInfo {
  expiries: { weekly: string; midcp: string | null; stock: string };
  symbols: SymbolDebug[];
}
interface RawScreenerData {
  all: OIScreenerRow[];
  scanned: number;
  scannedAt: string;
  stockExpiry?: string;
  stockExpiries?: string[];
  weeklyExpiry?: string;
  n?: number;
  _debug?: DebugInfo;
}
interface BatchResponse {
  all: OIScreenerRow[];
  scanned: number;
  scannedAt: string;
  stockExpiry: string;
  stockExpiries: string[];
  weeklyExpiry: string;
  n: number;
  batchNum: number;
  totalBatches: number;
  _debug?: DebugInfo;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtOI(n: number) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '−' : '+';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000)    return `${sign}${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)      return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${n >= 0 ? '+' : '−'}${abs.toLocaleString('en-IN')}`;
}

function expiryToMonthLabel(expiry: string): string {
  const [y, m] = expiry.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function buildBuildupMap(data: OIBuildupData): Map<string, BuildupInfo> {
  const map = new Map<string, BuildupInfo>();
  const add = (rows: OIBuildupRow[], type: BuildupType) =>
    rows.forEach(r => map.set(r.symbol, { type, changePct: r.changePct, price: r.price }));
  add(data.lb, 'Long Buildup');
  add(data.sb, 'Short Buildup');
  add(data.sc, 'Short Covering');
  add(data.lu, 'Long Unwinding');
  return map;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_N = 7;

const N_OPTIONS = [
  { value: 5,  label: 'N=5 (11 strikes)' },
  { value: 7,  label: 'N=7 (15 strikes)' },
  { value: 10, label: 'N=10 (21 strikes)' },
  { value: 15, label: 'N=15 (31 strikes)' },
  { value: 20, label: 'N=20 (41 strikes)' },
];

const TOP_N_OPTIONS = [5, 10, 15, 20];

const BUILDUP_CONFIG: Record<BuildupType, {
  short: string; desc: string;
  chipBg: string; chipText: string;
  activeBg: string; activeText: string;
  dot: string; border: string;
}> = {
  'Long Buildup':   {
    short: 'Long Buildup',   desc: 'Price ↑  OI ↑',
    chipBg: 'bg-emerald-50', chipText: 'text-emerald-700',
    activeBg: 'bg-emerald-600', activeText: 'text-white',
    dot: 'bg-emerald-500', border: 'border-emerald-200',
  },
  'Short Buildup':  {
    short: 'Short Buildup',  desc: 'Price ↓  OI ↑',
    chipBg: 'bg-red-50',     chipText: 'text-red-700',
    activeBg: 'bg-red-600',  activeText: 'text-white',
    dot: 'bg-red-500',       border: 'border-red-200',
  },
  'Short Covering': {
    short: 'Short Cover',    desc: 'Price ↑  OI ↓',
    chipBg: 'bg-sky-50',     chipText: 'text-sky-700',
    activeBg: 'bg-sky-600',  activeText: 'text-white',
    dot: 'bg-sky-500',       border: 'border-sky-200',
  },
  'Long Unwinding': {
    short: 'Long Unwind',    desc: 'Price ↓  OI ↓',
    chipBg: 'bg-orange-50',  chipText: 'text-orange-700',
    activeBg: 'bg-orange-600', activeText: 'text-white',
    dot: 'bg-orange-500',    border: 'border-orange-200',
  },
};

// Derived from BUILDUP_CONFIG keys so it never drifts if a type is added.
const BUILDUP_FILTER_LIST: BuildupFilter[] = ['All', ...Object.keys(BUILDUP_CONFIG) as BuildupType[]];

// ── BuildupBadge ───────────────────────────────────────────────────────────────

function BuildupBadge({ type }: { type?: BuildupType }) {
  if (!type) return <span className="text-[10px] text-slate-400 font-mono">—</span>;
  const cfg = BUILDUP_CONFIG[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.chipBg} ${cfg.chipText} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.short}
    </span>
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
            <div className="h-4 w-16 bg-slate-100 rounded" />
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

// ── Stock card ─────────────────────────────────────────────────────────────────

function StockCard({ row, rank, side }: { row: EnrichedRow; rank: number; side: 'bullish' | 'bearish' }) {
  const isBull      = side === 'bullish';
  const rankBg      = isBull ? 'bg-emerald-600' : 'bg-red-600';
  const oiSignalClr = isBull ? 'text-emerald-600' : 'text-red-600';
  const pricePct    = row.buildup?.changePct;
  const priceClr    = pricePct == null ? 'text-slate-400' : pricePct >= 0 ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full ${rankBg} text-white text-xs font-black`}>
          {rank}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2.5">
            <span className="font-black text-gray-900 font-mono text-base leading-none tracking-tight">{row.symbol}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">{row.expiry}</span>
            <BuildupBadge type={row.buildup?.type} />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1">OI Signal</div>
              <div className={`text-sm font-black tabular-nums leading-none ${oiSignalClr}`}>
                {row.netOIChgPct >= 0 ? '+' : ''}{row.netOIChgPct.toFixed(2)}%
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Price Chg</div>
              <div className={`text-sm font-bold tabular-nums leading-none ${priceClr}`}>
                {pricePct != null ? `${pricePct >= 0 ? '+' : ''}${pricePct.toFixed(2)}%` : '—'}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Fut Price</div>
              <div className="text-sm font-bold tabular-nums leading-none text-gray-700">
                {row.buildup ? `₹${row.buildup.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
              </div>
            </div>
          </div>

          <div className="flex gap-4 text-[11px]">
            <span className="text-slate-400">CE OI Chg <span className="font-semibold font-mono text-rose-600">{fmtOI(row.ceOIChg)}</span></span>
            <span className="text-slate-400">PE OI Chg <span className="font-semibold font-mono text-emerald-600">{fmtOI(row.peOIChg)}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

function Panel({
  rows, side, loading, topN,
}: {
  rows: EnrichedRow[];
  side: 'bullish' | 'bearish';
  loading: boolean;
  topN: number;
}) {
  const isBull = side === 'bullish';
  const sliced = rows.slice(0, topN);

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
              {isBull
                ? '(PE OI Chg − CE OI Chg) / Total OI  ·  ratio > 0'
                : '(PE OI Chg − CE OI Chg) / Total OI  ·  ratio < 0'}
            </p>
          </div>
        </div>
      </div>

      <div>
        {loading
          ? Array.from({ length: topN }).map((_, i) => <SkeletonCard key={i} isBull={isBull} />)
          : sliced.length === 0
          ? (
            <div className="py-14 text-center">
              <p className="text-slate-400 text-sm">No stocks match the current filter</p>
              <p className="text-slate-300 text-xs mt-1">Try setting Futures Signal to &quot;All&quot;</p>
            </div>
          )
          : sliced.map((row, i) => (
              <StockCard key={row.symbol} row={row} rank={i + 1} side={side} />
            ))}
      </div>
    </div>
  );
}

// ── Diagnostic panel ───────────────────────────────────────────────────────────

function debugChip(s: SymbolDebug['status']): string {
  if (s === 'ok')        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (s === 'api-error') return 'text-red-700 bg-red-50 border-red-200';
  if (s === 'zero-oi')   return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-500 bg-slate-100 border-slate-200';
}

function DebugPanel({ info }: { info: DebugInfo }) {
  const [open, setOpen] = useState(false);
  const ok  = info.symbols.filter(s => s.status === 'ok').length;
  const err = info.symbols.filter(s => s.status !== 'ok').length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Diagnostic — {ok} ok · {err} failed · weekly {info.expiries.weekly} · stock {info.expiries.stock}
        </p>
        <span className="text-slate-400 text-sm">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-xs min-w-[520px]">
            <thead className="bg-slate-50">
              <tr>
                {['Symbol', 'Expiry', 'Status', 'Detail'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {info.symbols.map(s => (
                <tr key={s.sym} className="hover:bg-slate-50">
                  <td className="px-4 py-1.5 font-black font-mono text-gray-900">{s.sym}</td>
                  <td className="px-4 py-1.5 text-slate-400">{s.expiry}</td>
                  <td className="px-4 py-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${debugChip(s.status)}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-1.5 text-slate-500 max-w-xs truncate">
                    {s.status === 'ok'
                      ? `${s.strikes} strikes · OI ${(s.totalOI ?? 0).toLocaleString('en-IN')}`
                      : s.error ?? (s.strikes != null ? `${s.strikes} strikes` : '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Select helper ──────────────────────────────────────────────────────────────

function LabeledSelect({ label, value, onChange, disabled, children }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="px-3 py-2 text-sm font-semibold text-gray-900 bg-white border border-slate-200 rounded-lg shadow-sm disabled:opacity-50 cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors min-w-[160px]"
      >
        {children}
      </select>
    </label>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OIScreenerPage() {
  const { isConfigured, isHydrated, headers } = useDhanCredentials();

  // Screener state
  const [rawData,     setRawData]     = useState<RawScreenerData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const [batchesDone, setBatchesDone] = useState(0);
  const [error,       setError]       = useState('');

  // Buildup state
  const [buildupMap, setBuildupMap] = useState<Map<string, BuildupInfo>>(new Map());

  // Screener settings
  const [selectedExpiry,    setSelectedExpiry]    = useState('');
  const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
  const [n,                 setN]                 = useState(DEFAULT_N);

  // Filters & display
  const [buildupFilter, setBuildupFilter] = useState<BuildupFilter>('All');
  const [topN,          setTopN]          = useState(5);
  const [showAll,       setShowAll]       = useState(false);
  const [tableSearch,   setTableSearch]   = useState('');

  const dirty = n !== (rawData?.n ?? DEFAULT_N) || selectedExpiry !== (rawData?.stockExpiry ?? '');

  // ── Sort + enrich (only re-runs when data or buildup map changes, not on filter) ──
  const enrichedSorted = useMemo(() => {
    if (!rawData) return null;
    const rows: EnrichedRow[] = rawData.all.map(r => ({ ...r, buildup: buildupMap.get(r.symbol) }));
    rows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);
    return { rows, meta: rawData };
  }, [rawData, buildupMap]);

  // ── Filter + count (only re-runs when filter changes, not on every scan batch) ──
  const enrichedData = useMemo(() => {
    if (!enrichedSorted) return null;
    const { rows: sorted, meta } = enrichedSorted;

    const counts: Record<BuildupType, number> = {
      'Long Buildup': 0, 'Short Buildup': 0, 'Short Covering': 0, 'Long Unwinding': 0,
    };
    sorted.forEach(r => { if (r.buildup) counts[r.buildup.type]++; });

    const applyFilter = (rows: EnrichedRow[]) =>
      buildupFilter === 'All' ? rows : rows.filter(r => r.buildup?.type === buildupFilter);

    return {
      ...meta,
      all:     sorted,
      bullish: applyFilter(sorted.filter(r => r.netOIChgPct > 0)),
      bearish: applyFilter(sorted.filter(r => r.netOIChgPct < 0).reverse()),
      counts,
    };
  }, [enrichedSorted, buildupFilter]);

  // ── Table rows (filtered + searched) ──
  const tableRows = useMemo(() => {
    if (!enrichedData) return [];
    const q = tableSearch.toLowerCase();
    return enrichedData.all.filter(r =>
      (buildupFilter === 'All' || r.buildup?.type === buildupFilter) &&
      (!q || r.symbol.toLowerCase().includes(q))
    );
  }, [enrichedData, buildupFilter, tableSearch]);

  // ── Run OI screener ──
  const runScreen = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setScanning(false);
    setError('');
    setBatchesDone(0);
    setRawData(null);

    interface PrefetchResponse {
      weeklyExpiry: string; midcpExpiry: string | null;
      stockExpiry: string; stockExpiries: string[]; error?: string;
    }
    let prefetch: PrefetchResponse;
    try {
      const r = await fetch('/api/dhan/oi-screener/prefetch', { headers });
      prefetch = await r.json() as PrefetchResponse;
      if (!r.ok || prefetch.error) {
        setError(prefetch.error ?? `Expiry prefetch failed (HTTP ${r.status})`);
        setLoading(false);
        return;
      }
    } catch (e) {
      setError(`Expiry prefetch failed: ${String(e)}`);
      setLoading(false);
      return;
    }

    if (prefetch.stockExpiries.length) setAvailableExpiries(prefetch.stockExpiries);
    const effectiveExpiry = (selectedExpiry && prefetch.stockExpiries.includes(selectedExpiry))
      ? selectedExpiry : prefetch.stockExpiry;
    if (!selectedExpiry) setSelectedExpiry(effectiveExpiry);

    const baseParams = new URLSearchParams({
      n:            String(n),
      weeklyExpiry: prefetch.weeklyExpiry,
      midcpExpiry:  prefetch.midcpExpiry ?? '',
      stockExpiry:  effectiveExpiry,
    });

    const allRows: OIScreenerRow[] = [];
    const allDebug: SymbolDebug[]  = [];
    const batchErrors: string[]    = [];
    let refBatch: BatchResponse | null = null;

    for (let batch = 1; batch <= 4; batch++) {
      const p = new URLSearchParams(baseParams);
      p.set('batch', String(batch));
      try {
        const res  = await fetch(`/api/dhan/oi-screener?${p}`, { headers });
        const json = await res.json() as BatchResponse;
        if (json.error) {
          batchErrors.push(`Batch ${batch}: ${json.error}`);
        } else {
          allRows.push(...(json.all ?? []));
          if (json._debug?.symbols) allDebug.push(...json._debug.symbols);
          if (!refBatch) refBatch = json;

          setRawData({
            all:           [...allRows],
            scanned:       allRows.length,
            scannedAt:     new Date().toISOString(),
            stockExpiry:   effectiveExpiry,
            stockExpiries: prefetch.stockExpiries,
            weeklyExpiry:  prefetch.weeklyExpiry,
            n,
            _debug: refBatch._debug ? { expiries: refBatch._debug.expiries, symbols: allDebug } : undefined,
          });

          if (batch === 1) { setLoading(false); setScanning(true); }
        }
      } catch (e) {
        batchErrors.push(`Batch ${batch}: ${String(e)}`);
      }
      setBatchesDone(batch);
    }

    if (allRows.length === 0) {
      setError(batchErrors.join(' | ') || 'No data returned');
    } else if (batchErrors.length) {
      setError(`Partial results (${4 - batchErrors.length}/4 batches ok): ${batchErrors.join(' | ')}`);
    }
    setLoading(false);
    setScanning(false);
  }, [isConfigured, headers, n, selectedExpiry]);

  useEffect(() => {
    if (!isHydrated || !isConfigured) return;
    runScreen();
    fetch('/api/dhan/oi-buildup')
      .then(r => r.json() as Promise<OIBuildupData>)
      .then(json => { if (!json.error) setBuildupMap(buildBuildupMap(json)); })
      .catch(() => {});
  }, [isHydrated, isConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isHydrated) return null;

  if (!isConfigured) {
    return (
      <main className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-slate-500">Dhan credentials not configured.</p>
        <a href="/settings" className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 transition-colors">
          Go to Settings
        </a>
      </main>
    );
  }

  const scannedAt = rawData
    ? new Date(rawData.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  const scanStatus = loading
    ? (batchesDone === 0 ? 'Fetching expiry dates…' : `Scanning batch ${batchesDone}/4…`)
    : scanning
    ? `${rawData?.scanned ?? 0} scanned · batch ${batchesDone + 1}/4 in progress…`
    : rawData
    ? `${rawData.scanned} symbols scanned · ${scannedAt}${buildupMap.size === 0 ? ' · loading futures…' : ''}`
    : '~200 F&O symbols · runs in 4 sequential batches';

  return (
    <main className="px-5 py-5 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">F&amp;O OI Change Screener</h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">{scanStatus}</p>
      </div>

      {/* ── Filter card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">

        {/* Row 1: dropdowns + scan button */}
        <div className="flex flex-wrap items-end gap-4">
          <LabeledSelect
            label="Expiry Month"
            value={selectedExpiry}
            onChange={setSelectedExpiry}
            disabled={loading}
          >
            {availableExpiries.length === 0
              ? <option value="">Loading…</option>
              : availableExpiries.map(exp => (
                  <option key={exp} value={exp}>{expiryToMonthLabel(exp)}</option>
                ))}
          </LabeledSelect>

          <LabeledSelect
            label="ATM Strikes (N per side)"
            value={n}
            onChange={v => setN(Number(v))}
            disabled={loading}
          >
            {N_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </LabeledSelect>

          <LabeledSelect
            label="Top N per panel"
            value={topN}
            onChange={v => setTopN(Number(v))}
          >
            {TOP_N_OPTIONS.map(v => <option key={v} value={v}>Top {v}</option>)}
          </LabeledSelect>

          <div className="flex flex-col justify-end">
            <button
              onClick={runScreen}
              disabled={loading || scanning}
              className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors disabled:opacity-60
                ${loading || scanning
                  ? 'bg-slate-400 text-white cursor-not-allowed'
                  : dirty
                  ? 'bg-amber-500 hover:bg-amber-400 text-white ring-2 ring-amber-400/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
            >
              {loading
                ? (batchesDone === 0 ? 'Fetching expiries…' : `Batch ${batchesDone}/4…`)
                : scanning
                ? `Batch ${batchesDone + 1}/4…`
                : dirty ? '↻ Re-run with new settings' : '↻ Run Screen'}
            </button>
          </div>
        </div>

        {/* Row 2: futures signal filter */}
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Futures Signal Filter</p>
          <div className="flex flex-wrap gap-2">
            {BUILDUP_FILTER_LIST.map(f => {
              const isActive = buildupFilter === f;
              const cfg      = f !== 'All' ? BUILDUP_CONFIG[f] : null;
              const count    = f !== 'All' && enrichedData ? enrichedData.counts[f] : null;
              return (
                <button
                  key={f}
                  onClick={() => setBuildupFilter(f)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    isActive
                      ? f === 'All'
                        ? 'bg-slate-700 text-white border-slate-700'
                        : `${cfg!.activeBg} ${cfg!.activeText} border-transparent`
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {cfg && isActive && <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />}
                  {f === 'All' ? 'All Signals' : cfg!.short}
                  {count != null && (
                    <span className={`tabular-nums ${isActive ? 'opacity-80' : 'text-slate-400'}`}>{count}</span>
                  )}
                </button>
              );
            })}
            {buildupFilter !== 'All' && (
              <span className="text-[10px] text-slate-400 self-center">
                {BUILDUP_CONFIG[buildupFilter as BuildupType].desc}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary chips ───────────────────────────────────────────── */}
      {enrichedData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(BUILDUP_CONFIG) as [BuildupType, typeof BUILDUP_CONFIG[BuildupType]][]).map(([type, cfg]) => (
            <button
              key={type}
              onClick={() => setBuildupFilter(buildupFilter === type ? 'All' : type)}
              className={`rounded-xl px-4 py-3 text-left border transition-all ${
                buildupFilter === type
                  ? `${cfg.chipBg} ${cfg.border} border shadow-sm`
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${buildupFilter === type ? cfg.chipText : 'text-slate-500'}`}>
                {cfg.short}
              </div>
              <div className={`text-2xl font-black tabular-nums ${buildupFilter === type ? cfg.chipText : 'text-gray-900'}`}>
                {enrichedData.counts[type]}
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5">{cfg.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-red-700 text-sm font-medium">{error}</div>
      )}

      {/* ── Panels ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel rows={enrichedData?.bullish ?? []} side="bullish" loading={loading} topN={topN} />
        <Panel rows={enrichedData?.bearish ?? []} side="bearish" loading={loading} topN={topN} />
      </div>

      {/* ── Full ranked table ────────────────────────────────────────── */}
      {enrichedData && !loading && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowAll(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Full Ranked List — {tableRows.length} of {enrichedData.scanned} symbols · N = {enrichedData.n ?? n}
            </p>
            <span className="text-slate-400 text-sm">{showAll ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showAll && (
            <div className="border-t border-slate-100">
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <input
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  placeholder="Search symbol…"
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 w-36"
                />
                <p className="text-[10px] text-slate-400">{tableRows.length} results</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left   text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                      <th className="px-4 py-3 text-left   text-[10px] font-bold text-slate-400 uppercase tracking-widest">Symbol</th>
                      <th className="px-4 py-3 text-left   text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expiry</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Futures Signal</th>
                      <th className="px-4 py-3 text-right  text-[10px] font-bold text-rose-500   uppercase tracking-widest">CE OI Chg</th>
                      <th className="px-4 py-3 text-right  text-[10px] font-bold text-emerald-600 uppercase tracking-widest">PE OI Chg</th>
                      <th className="px-4 py-3 text-right  text-[10px] font-bold text-slate-400 uppercase tracking-widest">OI Signal</th>
                      <th className="px-4 py-3 text-right  text-[10px] font-bold text-slate-400 uppercase tracking-widest">Price Chg%</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Options</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tableRows.map((row, i) => {
                      const isBull   = row.netOIChgPct > 0;
                      const isTop5   = i < 5 && buildupFilter === 'All';
                      const isBot5   = i >= tableRows.length - 5 && buildupFilter === 'All';
                      const pricePct = row.buildup?.changePct;
                      const priceClr = pricePct == null ? 'text-slate-400' : pricePct >= 0 ? 'text-emerald-600' : 'text-red-600';
                      return (
                        <tr
                          key={row.symbol}
                          className={`hover:bg-slate-50 transition-colors ${
                            isTop5 ? 'bg-emerald-50/50' : isBot5 ? 'bg-red-50/50' : ''
                          }`}
                        >
                          <td className="px-4 py-2.5 text-[10px] text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-2.5 font-black font-mono text-gray-900 tracking-tight">{row.symbol}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">{row.expiry}</td>
                          <td className="px-4 py-2.5 text-center">
                            <BuildupBadge type={row.buildup?.type} />
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold font-mono text-xs ${row.ceOIChg >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {fmtOI(row.ceOIChg)}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold font-mono text-xs ${row.peOIChg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {fmtOI(row.peOIChg)}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-black text-sm ${isBull ? 'text-emerald-600' : 'text-red-600'}`}>
                            {row.netOIChgPct >= 0 ? '+' : ''}{row.netOIChgPct.toFixed(2)}%
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-bold text-sm ${priceClr}`}>
                            {pricePct != null ? `${pricePct >= 0 ? '+' : ''}${pricePct.toFixed(2)}%` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              isBull ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {isBull ? 'BULLISH' : 'BEARISH'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Diagnostic ──────────────────────────────────────────────── */}
      {enrichedData?._debug && !loading && (
        <DebugPanel info={enrichedData._debug} />
      )}

    </main>
  );
}
