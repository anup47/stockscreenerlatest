'use client';
import { useState, useEffect, useCallback } from 'react';
import type { OIBuildupData, OIBuildupRow } from '@/app/api/dhan/oi-buildup/route';

function fmtOI(n: number) {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmt2(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PanelProps {
  title: string;
  subtitle: string;
  rows: OIBuildupRow[];
  accentClass: string;          // Tailwind border/bg accent
  priceSign: 'up' | 'down';
  oiSign:    'up' | 'down';
}

function Panel({ title, subtitle, rows, accentClass, priceSign, oiSign }: PanelProps) {
  const [search, setSearch] = useState('');

  const visible = rows.filter(r =>
    !search || r.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col border-t-2 ${accentClass}`}>
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2">
        <div>
          <span className="text-sm font-bold text-slate-100">{title}</span>
          <span className="ml-2 text-xs text-slate-500">{subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 tabular-nums font-mono">{rows.length} stocks</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-24"
          />
        </div>
      </div>

      <div className="overflow-auto max-h-72">
        <table className="w-full text-xs min-w-[420px]">
          <thead className="sticky top-0 bg-slate-950 border-b border-slate-700">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Symbol</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Price</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Price Chg%</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">OI</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">OI Chg%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {visible.map(r => (
              <tr key={r.symbol} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-3 py-1.5 font-mono font-bold text-slate-100">{r.symbol}</td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-300 tabular-nums">{fmt2(r.price)}</td>
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${priceSign === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                </td>
                <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums">{fmtOI(r.oi)}</td>
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${oiSign === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.oiChangePct >= 0 ? '+' : ''}{r.oiChangePct.toFixed(2)}%
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-500">No results</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OIBuildupPage() {
  const [data,        setData]        = useState<OIBuildupData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/dhan/oi-buildup');
      const json = await res.json() as OIBuildupData & { error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? `Error ${res.status}`);
      } else {
        setData(json);
        setLastUpdated(new Date().toLocaleTimeString('en-IN'));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <main className="w-full px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">OI Buildup</h1>
          <p className="text-slate-400 text-xs mt-1 uppercase tracking-wide font-medium">
            NSE F&amp;O · Open Interest activity · TradingView data
            {lastUpdated && <> &nbsp;·&nbsp; Updated {lastUpdated}</>}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded text-sm transition-colors"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{error}</div>
      )}

      {/* Summary bar */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Long Buildup',   count: data.lb.length, color: 'text-emerald-400', desc: 'Price ↑  OI ↑' },
            { label: 'Short Buildup',  count: data.sb.length, color: 'text-red-400',     desc: 'Price ↓  OI ↑' },
            { label: 'Short Covering', count: data.sc.length, color: 'text-sky-400',     desc: 'Price ↑  OI ↓' },
            { label: 'Long Unwinding', count: data.lu.length, color: 'text-orange-400',  desc: 'Price ↓  OI ↓' },
          ].map(({ label, count, color, desc }) => (
            <div key={label} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</div>
              <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${color}`}>{count}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* 2×2 grid of panels */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-700 rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel
            title="Long Buildup"
            subtitle="Price ↑  OI ↑"
            rows={data.lb}
            accentClass="border-t-emerald-500"
            priceSign="up"
            oiSign="up"
          />
          <Panel
            title="Short Buildup"
            subtitle="Price ↓  OI ↑"
            rows={data.sb}
            accentClass="border-t-red-500"
            priceSign="down"
            oiSign="up"
          />
          <Panel
            title="Short Covering"
            subtitle="Price ↑  OI ↓"
            rows={data.sc}
            accentClass="border-t-sky-500"
            priceSign="up"
            oiSign="down"
          />
          <Panel
            title="Long Unwinding"
            subtitle="Price ↓  OI ↓"
            rows={data.lu}
            accentClass="border-t-orange-500"
            priceSign="down"
            oiSign="down"
          />
        </div>
      )}

      <div className="text-xs text-slate-600">
        Data sourced from TradingView scanner (NSE). No broker credentials required.
        OI change reflects intraday open interest variation.
      </div>
    </main>
  );
}
