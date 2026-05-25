'use client';
import { useState, useCallback, useEffect } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import type { OIBuildupData, OIBuildupRow } from '@/app/api/dhan/oi-buildup/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtOI(n: number) {
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000)    return `${(n / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)      return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmt2(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function Panel({
  title, subtitle, rows, borderColor, priceColor, oiColor, loading,
}: {
  title:       string;
  subtitle:    string;
  rows:        OIBuildupRow[];
  borderColor: string;
  priceColor:  string;
  oiColor:     string;
  loading:     boolean;
}) {
  const [search, setSearch] = useState('');

  const visible = rows.filter(r =>
    !search || r.symbol.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={`bg-slate-900 border border-slate-700 border-t-2 ${borderColor} rounded-xl overflow-hidden flex flex-col`}>
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-100">{title}</span>
          <span className="text-xs text-slate-500">{subtitle}</span>
          <span className="text-xs text-slate-400 tabular-nums font-mono bg-slate-800 px-1.5 py-0.5 rounded">
            {rows.length}
          </span>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-24"
        />
      </div>

      {/* Panel body */}
      <div className="overflow-auto max-h-72">
        {loading && rows.length === 0 ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <table className="w-full text-xs min-w-[380px]">
            <thead className="sticky top-0 bg-slate-950 border-b border-slate-700 z-10">
              <tr>
                <th className="px-3 py-2 text-left   text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Symbol</th>
                <th className="px-3 py-2 text-right  text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                <th className="px-3 py-2 text-right  text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Chg%</th>
                <th className="px-3 py-2 text-right  text-[10px] font-semibold text-slate-500 uppercase tracking-wide">OI (CE+PE)</th>
                <th className="px-3 py-2 text-right  text-[10px] font-semibold text-slate-500 uppercase tracking-wide">OI Chg%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-xs">
                    {search ? 'No results' : 'No data yet — scanning…'}
                  </td>
                </tr>
              ) : visible.map(r => (
                <tr key={r.symbol} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-1.5 font-mono font-bold text-slate-100">{r.symbol}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-300 tabular-nums">{fmt2(r.price)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${priceColor}`}>
                    {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums font-mono">{fmtOI(r.totalOI)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${oiColor}`}>
                    {r.oiChgPct >= 0 ? '+' : ''}{r.oiChgPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Accumulated scan state ────────────────────────────────────────────────────

interface ScanData {
  lb:          OIBuildupRow[];
  sb:          OIBuildupRow[];
  sc:          OIBuildupRow[];
  lu:          OIBuildupRow[];
  scanned:     number;
  scannedAt:   string;
  stockExpiry: string;
  weeklyExpiry: string;
  n:           number;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OIBuildupPage() {
  const { isConfigured, isHydrated, headers } = useDhanCredentials();
  const [data,              setData]              = useState<ScanData | null>(null);
  const [loading,           setLoading]           = useState(false);
  const [scanning,          setScanning]          = useState(false);
  const [batchesDone,       setBatchesDone]       = useState(0);
  const [error,             setError]             = useState('');
  const [selectedExpiry,    setSelectedExpiry]    = useState('');
  const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
  const [n,                 setN]                 = useState(7);

  const runScreen = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setScanning(false);
    setError('');
    setBatchesDone(0);
    setData(null);

    // Phase A — prefetch expiry dates once (reuse OI screener endpoint)
    interface PrefetchResponse {
      weeklyExpiry:  string;
      midcpExpiry:   string | null;
      stockExpiry:   string;
      stockExpiries: string[];
      error?:        string;
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
      ? selectedExpiry
      : prefetch.stockExpiry;
    if (!selectedExpiry) setSelectedExpiry(effectiveExpiry);

    const baseParams = new URLSearchParams({
      n:            String(n),
      weeklyExpiry: prefetch.weeklyExpiry,
      midcpExpiry:  prefetch.midcpExpiry ?? '',
      stockExpiry:  effectiveExpiry,
    });

    const allLB: OIBuildupRow[] = [];
    const allSB: OIBuildupRow[] = [];
    const allSC: OIBuildupRow[] = [];
    const allLU: OIBuildupRow[] = [];
    const batchErrors: string[] = [];

    // Phase B — 4 sequential batches (same proven architecture as OI screener)
    for (let batch = 1; batch <= 4; batch++) {
      const p = new URLSearchParams(baseParams);
      p.set('batch', String(batch));
      try {
        const res  = await fetch(`/api/dhan/oi-buildup?${p}`, { headers });
        const json = await res.json() as OIBuildupData;
        if (json.error) {
          batchErrors.push(`Batch ${batch}: ${json.error}`);
        } else {
          allLB.push(...(json.lb ?? []));
          allSB.push(...(json.sb ?? []));
          allSC.push(...(json.sc ?? []));
          allLU.push(...(json.lu ?? []));

          // Re-sort accumulated rows
          allLB.sort((a, b) => b.oiChgPct - a.oiChgPct);
          allSB.sort((a, b) => b.oiChgPct - a.oiChgPct);
          allSC.sort((a, b) => a.oiChgPct - b.oiChgPct);
          allLU.sort((a, b) => a.oiChgPct - b.oiChgPct);

          const total = allLB.length + allSB.length + allSC.length + allLU.length;
          setData({
            lb: [...allLB], sb: [...allSB], sc: [...allSC], lu: [...allLU],
            scanned:     total,
            scannedAt:   new Date().toISOString(),
            stockExpiry: effectiveExpiry,
            weeklyExpiry: prefetch.weeklyExpiry,
            n,
          });
          if (batch === 1) { setLoading(false); setScanning(true); }
        }
      } catch (e) {
        batchErrors.push(`Batch ${batch}: ${String(e)}`);
      }
      setBatchesDone(batch);
    }

    const total = allLB.length + allSB.length + allSC.length + allLU.length;
    if (total === 0) {
      setError(batchErrors.join(' | ') || 'No data returned');
    } else if (batchErrors.length) {
      setError(`Partial results (${4 - batchErrors.length}/4 batches ok): ${batchErrors.join(' | ')}`);
    }
    setLoading(false);
    setScanning(false);
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

  const scannedCount = data
    ? data.lb.length + data.sb.length + data.sc.length + data.lu.length
    : 0;
  const scannedTime  = data
    ? new Date(data.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <main className="px-5 py-5 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">OI Buildup</h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">
          Long Buildup · Short Buildup · Short Covering · Long Unwinding ·&nbsp;
          {loading
            ? (batchesDone === 0 ? 'Fetching expiry dates…' : `Scanning batch ${batchesDone}/4…`)
            : scanning
            ? `${scannedCount} classified so far · scanning batch ${batchesDone + 1}/4…`
            : data
            ? `${scannedCount} symbols classified · ${scannedTime}`
            : '~200 F&O symbols · 4 sequential batches'}
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiry (stocks)</span>
          <select
            value={selectedExpiry}
            onChange={e => setSelectedExpiry(e.target.value)}
            disabled={loading}
            className="px-3 py-2 text-sm font-semibold text-gray-900 bg-white border border-slate-700 rounded-lg disabled:opacity-50 cursor-pointer hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 min-w-[160px]"
          >
            {availableExpiries.length === 0
              ? <option value="">Loading…</option>
              : availableExpiries.map(exp => (
                  <option key={exp} value={exp}>
                    {new Date(exp + 'T00:00:00').toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                  </option>
                ))
            }
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ATM Strikes (N)</span>
          <select
            value={n}
            onChange={e => setN(Number(e.target.value))}
            disabled={loading}
            className="px-3 py-2 text-sm font-semibold text-gray-900 bg-white border border-slate-700 rounded-lg disabled:opacity-50 cursor-pointer hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            {[5, 7, 10, 15, 20].map(v => (
              <option key={v} value={v}>N = {v}  ({2 * v + 1} strikes)</option>
            ))}
          </select>
        </label>

        <div className="flex flex-col justify-end">
          <button
            onClick={runScreen}
            disabled={loading || scanning}
            className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors disabled:opacity-60
              ${loading || scanning
                ? 'bg-slate-400 text-white cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
          >
            {loading
              ? (batchesDone === 0 ? 'Fetching expiries…' : `Scanning ${batchesDone}/4…`)
              : scanning
              ? `Scanning ${batchesDone + 1}/4…`
              : '↻ Run Scan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-3 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Summary count cards */}
      {(data || loading) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Long Buildup',   count: data?.lb.length ?? 0, color: 'text-emerald-400', desc: 'Price ↑  OI ↑' },
            { label: 'Short Buildup',  count: data?.sb.length ?? 0, color: 'text-red-400',     desc: 'Price ↓  OI ↑' },
            { label: 'Short Covering', count: data?.sc.length ?? 0, color: 'text-sky-400',     desc: 'Price ↑  OI ↓' },
            { label: 'Long Unwinding', count: data?.lu.length ?? 0, color: 'text-orange-400',  desc: 'Price ↓  OI ↓' },
          ].map(({ label, count, color, desc }) => (
            <div key={label} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</div>
              <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${loading && count === 0 ? 'animate-pulse text-slate-600' : color}`}>
                {count}
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* 2×2 quadrant panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel
          title="Long Buildup"   subtitle="Price ↑  OI ↑"
          rows={data?.lb ?? []}  borderColor="border-t-emerald-500"
          priceColor="text-emerald-400" oiColor="text-emerald-400"
          loading={loading}
        />
        <Panel
          title="Short Buildup"  subtitle="Price ↓  OI ↑"
          rows={data?.sb ?? []}  borderColor="border-t-red-500"
          priceColor="text-red-400"     oiColor="text-emerald-400"
          loading={loading}
        />
        <Panel
          title="Short Covering" subtitle="Price ↑  OI ↓"
          rows={data?.sc ?? []}  borderColor="border-t-sky-500"
          priceColor="text-emerald-400" oiColor="text-red-400"
          loading={loading}
        />
        <Panel
          title="Long Unwinding" subtitle="Price ↓  OI ↓"
          rows={data?.lu ?? []}  borderColor="border-t-orange-500"
          priceColor="text-red-400"     oiColor="text-red-400"
          loading={loading}
        />
      </div>

      <div className="text-xs text-slate-600">
        Price data from Dhan market feed (NSE_EQ) and NSE India public API for indices.
        OI is CE + PE open interest near ATM from Dhan option chain.
        OI Chg% = (CE OI chg + PE OI chg) ÷ previous total OI.
      </div>

    </main>
  );
}
