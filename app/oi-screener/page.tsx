'use client';
import { useState, useCallback, useEffect } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import type { OIScreenerRow, SymbolDebug } from '@/lib/oi-screener';

interface DebugInfo {
  expiries: { weekly: string; midcp: string | null; stock: string };
  symbols:  SymbolDebug[];
}

interface ScreenerData {
  bullish:        OIScreenerRow[];
  bearish:        OIScreenerRow[];
  all:            OIScreenerRow[];
  scanned:        number;
  scannedAt:      string;
  stockExpiry?:   string;
  stockExpiries?: string[];
  weeklyExpiry?:  string;
  n?:             number;
  _debug?:        DebugInfo;
}

interface BatchResponse {
  all:            OIScreenerRow[];
  scanned:        number;
  scannedAt:      string;
  stockExpiry:    string;
  stockExpiries:  string[];
  weeklyExpiry:   string;
  n:              number;
  batchNum:       number;
  totalBatches:   number;
  _debug?:        DebugInfo;
  error?:         string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const N_OPTIONS = [
  { value: 5,  label: 'N = 5  (11 strikes)' },
  { value: 7,  label: 'N = 7  (15 strikes)' },
  { value: 10, label: 'N = 10  (21 strikes)' },
  { value: 15, label: 'N = 15  (31 strikes)' },
  { value: 20, label: 'N = 20  (41 strikes)' },
];

// ── Stock card ────────────────────────────────────────────────────────────────

function StockCard({ row, rank, side }: { row: OIScreenerRow; rank: number; side: 'bullish' | 'bearish' }) {
  const isBull    = side === 'bullish';
  const pctColor  = isBull ? 'text-emerald-600' : 'text-red-600';
  const rankColor = isBull ? 'bg-emerald-600'   : 'bg-red-600';
  const rowHover  = isBull ? 'hover:bg-emerald-50' : 'hover:bg-red-50';

  return (
    <div className={`flex items-center gap-4 px-5 py-4 border-b border-slate-700 last:border-0 ${rowHover} transition-colors`}>
      <span className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full ${rankColor} text-white text-xs font-black`}>
        {rank}
      </span>

      <div className="flex-1 min-w-0">
        <div className="font-black text-gray-900 font-mono text-lg leading-tight">{row.symbol}</div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">{row.expiry}</div>
      </div>

      <div className="text-right hidden sm:block">
        <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">CE / PE OI Chg</div>
        <div className="text-xs font-mono">
          <span className="text-rose-600 font-semibold">{fmtOI(row.ceOIChg)}</span>
          <span className="text-slate-300 mx-1">/</span>
          <span className="text-emerald-600 font-semibold">{fmtOI(row.peOIChg)}</span>
        </div>
      </div>

      <div className="text-right flex-shrink-0 w-24">
        <div className={`text-2xl font-black tabular-nums leading-none ${pctColor}`}>
          {row.netOIChgPct >= 0 ? '+' : ''}{row.netOIChgPct.toFixed(2)}%
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mt-0.5">PE−CE / Total OI</div>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function Panel({ rows, side, loading }: { rows: OIScreenerRow[]; side: 'bullish' | 'bearish'; loading: boolean }) {
  const isBull = side === 'bullish';

  return (
    <div className={`bg-white rounded-2xl overflow-hidden border-2 ${isBull ? 'border-emerald-500' : 'border-red-500'} shadow-sm`}>
      <div className={`px-5 py-4 ${isBull ? 'bg-emerald-600' : 'bg-red-600'}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{isBull ? '🟢' : '🔴'}</span>
          <div>
            <p className="text-white font-black text-xl tracking-tight">
              TOP 5 {isBull ? 'BULLISH' : 'BEARISH'} STOCKS
            </p>
            <p className="text-white/75 text-xs font-medium mt-0.5">
              {isBull
                ? 'Highest (PE OI Chg − CE OI Chg) / Total OI  ·  ratio > 0 only'
                : 'Lowest (PE OI Chg − CE OI Chg) / Total OI  ·  ratio < 0 only'}
            </p>
          </div>
        </div>
      </div>

      <div>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-slate-700 last:border-0">
                <div className={`w-7 h-7 rounded-full shimmer ${isBull ? 'bg-emerald-200' : 'bg-red-200'}`} />
                <div className="flex-1 space-y-1.5">
                  <div className="h-5 w-24 rounded bg-slate-200 shimmer" />
                  <div className="h-3 w-16 rounded bg-slate-100 shimmer" />
                </div>
                <div className="h-8 w-20 rounded bg-slate-100 shimmer" />
              </div>
            ))
          : rows.length === 0
          ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              {side === 'bullish' ? 'No stocks with positive ratio' : 'No stocks with negative ratio'}
            </div>
          )
          : rows.map((row, i) => (
            <StockCard key={row.symbol} row={row} rank={i + 1} side={side} />
          ))}
      </div>
    </div>
  );
}

// ── Diagnostic panel ──────────────────────────────────────────────────────────

function debugChip(s: SymbolDebug['status']): string {
  if (s === 'ok')        return 'text-emerald-700 bg-emerald-50';
  if (s === 'api-error') return 'text-red-700 bg-red-50';
  if (s === 'zero-oi')   return 'text-amber-700 bg-amber-50';
  return 'text-slate-500 bg-slate-100';
}

function DebugPanel({ info }: { info: DebugInfo }) {
  const [open, setOpen] = useState(false);
  const ok  = info.symbols.filter(s => s.status === 'ok').length;
  const err = info.symbols.filter(s => s.status !== 'ok').length;

  return (
    <div className="bg-white border border-slate-700 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Diagnostic — {ok} ok · {err} failed
          &nbsp;·&nbsp; weekly {info.expiries.weekly} · stock {info.expiries.stock}
        </p>
        <span className="text-slate-400 text-sm">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-slate-700">
          <table className="w-full text-xs min-w-[520px]">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiry</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {info.symbols.map(s => (
                <tr key={s.sym} className="hover:bg-slate-800/25">
                  <td className="px-4 py-1.5 font-black font-mono text-gray-900">{s.sym}</td>
                  <td className="px-4 py-1.5 text-slate-400">{s.expiry}</td>
                  <td className="px-4 py-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${debugChip(s.status)}`}>{s.status}</span>
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

// ── Dropdown component ────────────────────────────────────────────────────────

function Dropdown({ label, value, onChange, disabled, children }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="px-3 py-2 text-sm font-semibold text-gray-900 bg-white border border-slate-700 rounded-lg disabled:opacity-50 cursor-pointer hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors min-w-[160px]"
      >
        {children}
      </select>
    </label>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OIScreenerPage() {
  const { isConfigured, isHydrated, headers } = useDhanCredentials();
  const [data,              setData]              = useState<ScreenerData | null>(null);
  const [loading,           setLoading]           = useState(false);
  const [batchesDone,       setBatchesDone]       = useState(0);
  const [error,             setError]             = useState('');
  const [showAll,           setShowAll]           = useState(false);

  const [selectedExpiry,    setSelectedExpiry]    = useState('');
  const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
  const [n,                 setN]                 = useState(7);

  const dirty = n !== (data?.n ?? 7) || selectedExpiry !== (data?.stockExpiry ?? '');

  const runScreen = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError('');
    setBatchesDone(0);

    const baseParams = new URLSearchParams({ n: String(n) });
    if (selectedExpiry) baseParams.set('stockExpiry', selectedExpiry);

    const batchResults = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) => {
        const p = new URLSearchParams(baseParams);
        p.set('batch', String(i + 1));
        return fetch(`/api/dhan/oi-screener?${p}`, { headers })
          .then(res => res.json() as Promise<BatchResponse>)
          .then(json => { setBatchesDone(prev => prev + 1); return json; });
      })
    );

    const allRows: OIScreenerRow[]  = [];
    const allDebug: SymbolDebug[]   = [];
    const batchErrors: string[]     = [];
    let refBatch: BatchResponse | null = null;

    for (const [i, result] of batchResults.entries()) {
      if (result.status === 'rejected') {
        batchErrors.push(`Batch ${i + 1}: ${String(result.reason)}`);
      } else {
        const json = result.value;
        if (json.error) {
          batchErrors.push(`Batch ${i + 1}: ${json.error}`);
        } else {
          allRows.push(...(json.all ?? []));
          if (json._debug?.symbols) allDebug.push(...json._debug.symbols);
          if (!refBatch) refBatch = json;
        }
      }
    }

    if (allRows.length === 0) {
      setError(batchErrors.join(' | ') || 'No data returned');
      setLoading(false);
      return;
    }

    allRows.sort((a, b) => b.netOIChgPct - a.netOIChgPct);
    const bullish = allRows.filter(r => r.netOIChgPct > 0).slice(0, 5);
    const bearish = allRows.filter(r => r.netOIChgPct < 0).reverse().slice(0, 5);

    const merged: ScreenerData = {
      bullish,
      bearish,
      all:          allRows,
      scanned:      allRows.length,
      scannedAt:    new Date().toISOString(),
      stockExpiry:  refBatch?.stockExpiry,
      stockExpiries: refBatch?.stockExpiries,
      weeklyExpiry: refBatch?.weeklyExpiry,
      n,
      _debug: refBatch?._debug ? { expiries: refBatch._debug.expiries, symbols: allDebug } : undefined,
    };

    setData(merged);
    if (merged.stockExpiries?.length) setAvailableExpiries(merged.stockExpiries);
    if (!selectedExpiry && merged.stockExpiry) setSelectedExpiry(merged.stockExpiry);
    if (batchErrors.length) setError(`Partial results (${4 - batchErrors.length}/4 batches ok): ${batchErrors.join(' | ')}`);

    setLoading(false);
  }, [isConfigured, headers, n, selectedExpiry]);

  useEffect(() => {
    if (isHydrated && isConfigured) runScreen();
  }, [isHydrated, isConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isHydrated) return null;

  if (!isConfigured) {
    return (
      <main className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-slate-500">Dhan credentials not configured.</p>
        <a href="/settings" className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded hover:bg-emerald-500 transition-colors">
          Go to Settings
        </a>
      </main>
    );
  }

  const scannedTime = data
    ? new Date(data.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <main className="px-5 py-5 space-y-5">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">F&amp;O OI Change Screener</h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">
          (PE OI Chg − CE OI Chg) / Total OI &nbsp;·&nbsp;
          {loading
            ? `Scanning… ${batchesDone}/4 batches complete`
            : data
            ? `${data.scanned} symbols scanned · ${scannedTime}`
            : '~200 F&O symbols across 4 parallel batches'}
        </p>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-end gap-4">
        <Dropdown
          label="Expiry Month (stocks)"
          value={selectedExpiry}
          onChange={v => setSelectedExpiry(v)}
          disabled={loading}
        >
          {availableExpiries.length === 0
            ? <option value="">Loading…</option>
            : availableExpiries.map(exp => (
                <option key={exp} value={exp}>{expiryToMonthLabel(exp)}</option>
              ))
          }
        </Dropdown>

        <Dropdown
          label="Near-ATM Strikes (N per side)"
          value={n}
          onChange={v => setN(Number(v))}
          disabled={loading}
        >
          {N_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Dropdown>

        <div className="flex flex-col justify-end">
          <button
            onClick={runScreen}
            disabled={loading}
            className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors disabled:opacity-50
              ${dirty
                ? 'bg-amber-500 hover:bg-amber-400 text-white ring-2 ring-amber-400/50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
          >
            {loading
              ? `Scanning… (${batchesDone}/4)`
              : dirty
              ? '↻ Re-run with new settings'
              : '↻ Run Screen'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-3 text-red-700 text-sm font-medium">{error}</div>
      )}

      {/* ── Two panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel rows={data?.bullish ?? []} side="bullish" loading={loading} />
        <Panel rows={data?.bearish ?? []} side="bearish" loading={loading} />
      </div>

      {/* ── Full ranked list ── */}
      {data && !loading && (
        <div className="bg-white border border-slate-700 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAll(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Full Ranked List — All {data.scanned} Symbols · N = {data.n ?? n} strikes per side
            </p>
            <span className="text-slate-400 text-sm">{showAll ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showAll && (
            <div className="overflow-x-auto border-t border-slate-700">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiry</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-rose-500 uppercase tracking-widest">CE OI Chg</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-600 uppercase tracking-widest">PE OI Chg</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">PE−CE / Total OI</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {data.all.map((row, i) => {
                    const isBull = row.netOIChgPct > 0;
                    const isTop5 = i < 5;
                    const isBot5 = i >= data.all.length - 5;
                    return (
                      <tr key={row.symbol}
                        className={`hover:bg-slate-800/25 transition-colors ${isTop5 ? 'bg-emerald-950/20' : isBot5 ? 'bg-rose-950/20' : ''}`}>
                        <td className="px-4 py-2.5 text-[10px] text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2.5 font-black font-mono text-gray-900">{row.symbol}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{row.expiry}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${row.ceOIChg >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {fmtOI(row.ceOIChg)}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${row.peOIChg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmtOI(row.peOIChg)}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-black text-base ${isBull ? 'text-emerald-600' : 'text-red-600'}`}>
                          {row.netOIChgPct >= 0 ? '+' : ''}{row.netOIChgPct.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2.5 text-right">
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

      {/* ── Diagnostic ── */}
      {data?._debug && !loading && (
        <DebugPanel info={data._debug} />
      )}

    </main>
  );
}
