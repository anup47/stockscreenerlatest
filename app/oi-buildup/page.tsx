'use client';
import { useState, useCallback, useEffect } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import type { OIBuildupData, OIBuildupRow } from '@/app/api/dhan/oi-buildup/route';

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

function Panel({
  title, subtitle, rows, borderColor, priceColor, oiColor, loading,
}: {
  title: string; subtitle: string; rows: OIBuildupRow[];
  borderColor: string; priceColor: string; oiColor: string; loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const visible = rows.filter(r =>
    !search || r.symbol.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={`bg-slate-900 border border-slate-700 border-t-2 ${borderColor} rounded-xl overflow-hidden flex flex-col`}>
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
                <th className="px-3 py-2 text-left  text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Symbol</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Fut Price</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Chg%</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Fut OI</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">OI Chg%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-xs">
                    {search ? 'No results' : 'No data'}
                  </td>
                </tr>
              ) : visible.map(r => (
                <tr key={r.symbol} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-1.5 font-mono font-bold text-slate-100">{r.symbol}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-300 tabular-nums">{fmt2(r.price)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${priceColor}`}>
                    {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums font-mono">{fmtOI(r.oi)}</td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${oiColor}`}>
                    {r.oiChangePct >= 0 ? '+' : ''}{r.oiChangePct.toFixed(2)}%
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

export default function OIBuildupPage() {
  const { isConfigured, isHydrated, headers } = useDhanCredentials();
  const [data,    setData]    = useState<OIBuildupData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const runScreen = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res  = await fetch('/api/dhan/oi-buildup', { headers });
      const json = await res.json() as OIBuildupData;
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, headers]);

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

  const total     = data ? data.lb.length + data.sb.length + data.sc.length + data.lu.length : 0;
  const fetchedAt = data
    ? new Date(data.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <main className="px-5 py-5 space-y-5">

      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">OI Buildup</h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">
          Futures OI · Long Buildup · Short Buildup · Short Covering · Long Unwinding ·&nbsp;
          {loading
            ? 'Fetching futures data…'
            : data
            ? `${total} symbols classified · ${fetchedAt}`
            : '~205 F&O symbols'}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={runScreen}
          disabled={loading}
          className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors disabled:opacity-60
            ${loading
              ? 'bg-slate-400 text-white cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-3 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

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
        Futures contract price, OI, and OI change from Dhan market feed. ~205 NSE F&O symbols.
      </div>

    </main>
  );
}
