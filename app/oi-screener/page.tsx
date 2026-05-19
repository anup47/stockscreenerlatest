'use client';
import { useState, useCallback, useEffect } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import type { OIScreenerRow } from '@/lib/oi-screener';

interface ScreenerResponse {
  bullish:   OIScreenerRow[];
  bearish:   OIScreenerRow[];
  all:       OIScreenerRow[];
  scanned:   number;
  scannedAt: string;
}

function fmtOI(n: number) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '−' : '+';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000)    return `${sign}${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)      return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${n >= 0 ? '+' : '−'}${abs.toLocaleString('en-IN')}`;
}

// ── Single stock card inside a panel ─────────────────────────────────────────

function StockCard({ row, rank, side }: { row: OIScreenerRow; rank: number; side: 'bullish' | 'bearish' }) {
  const isBull      = side === 'bullish';
  const pctColor    = isBull ? 'text-emerald-600' : 'text-red-600';
  const rankColor   = isBull ? 'bg-emerald-600'   : 'bg-red-600';
  const rowHover    = isBull ? 'hover:bg-emerald-50' : 'hover:bg-red-50';

  return (
    <div className={`flex items-center gap-4 px-5 py-4 border-b border-slate-700 last:border-0 ${rowHover} transition-colors`}>
      {/* Rank badge */}
      <span className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full ${rankColor} text-white text-xs font-black`}>
        {rank}
      </span>

      {/* Symbol + expiry */}
      <div className="flex-1 min-w-0">
        <div className="font-black text-gray-900 font-mono text-lg leading-tight">{row.symbol}</div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">{row.expiry}</div>
      </div>

      {/* CE / PE OI change */}
      <div className="text-right hidden sm:block">
        <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">CE / PE OI Chg</div>
        <div className="text-xs font-mono">
          <span className="text-rose-600 font-semibold">{fmtOI(row.ceOIChg)}</span>
          <span className="text-slate-300 mx-1">/</span>
          <span className="text-emerald-600 font-semibold">{fmtOI(row.peOIChg)}</span>
        </div>
      </div>

      {/* Net % — the key metric */}
      <div className="text-right flex-shrink-0 w-24">
        <div className={`text-2xl font-black tabular-nums leading-none ${pctColor}`}>
          {row.netOIChgPct >= 0 ? '+' : ''}{row.netOIChgPct.toFixed(2)}%
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mt-0.5">PE−CE / Total OI</div>
      </div>
    </div>
  );
}

// ── Bullish / Bearish panel ───────────────────────────────────────────────────

function Panel({ rows, side, loading }: { rows: OIScreenerRow[]; side: 'bullish' | 'bearish'; loading: boolean }) {
  const isBull = side === 'bullish';

  return (
    <div className={`bg-white rounded-2xl overflow-hidden border-2 ${isBull ? 'border-emerald-500' : 'border-red-500'} shadow-sm`}>
      {/* Panel title */}
      <div className={`px-5 py-4 ${isBull ? 'bg-emerald-600' : 'bg-red-600'}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{isBull ? '🟢' : '🔴'}</span>
          <div>
            <p className="text-white font-black text-xl tracking-tight">
              TOP 5 {isBull ? 'BULLISH' : 'BEARISH'} STOCKS
            </p>
            <p className="text-white/75 text-xs font-medium mt-0.5">
              {isBull
                ? 'Highest (PE − CE) OI Change as % of Total OI'
                : 'Lowest (PE − CE) OI Change as % of Total OI'}
            </p>
          </div>
        </div>
      </div>

      {/* Rows */}
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
              No data — click <strong>Run Screen</strong> to scan
            </div>
          )
          : rows.map((row, i) => (
            <StockCard key={row.symbol} row={row} rank={i + 1} side={side} />
          ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OIScreenerPage() {
  const { isConfigured, isHydrated, headers } = useDhanCredentials();
  const [data,    setData]    = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [showAll, setShowAll] = useState(false);

  const runScreen = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/dhan/oi-screener', { headers });
      const json = await res.json() as ScreenerResponse & { error?: string };
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, headers]);

  useEffect(() => {
    if (isHydrated && isConfigured) runScreen();
  }, [isHydrated, isConfigured, runScreen]);

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
    <main className="px-5 py-5 space-y-6">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">F&amp;O OI Change Screener</h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">
            (PE − CE) OI Chg % of Total OI &nbsp;·&nbsp; {data ? `${data.scanned} symbols scanned · ${scannedTime}` : '~34 F&O symbols'}
          </p>
        </div>
        <button
          onClick={runScreen}
          disabled={loading}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors"
        >
          {loading ? 'Scanning… (30–40s)' : '↻ Run Screen'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-3 text-red-700 text-sm font-medium">{error}</div>
      )}

      {/* ── THE TWO PANELS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel rows={data?.bullish ?? []} side="bullish" loading={loading} />
        <Panel rows={data?.bearish ?? []} side="bearish" loading={loading} />
      </div>

      {/* ── Full ranked list (toggle) ── */}
      {data && !loading && (
        <div className="bg-white border border-slate-700 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAll(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Full Ranked List — All {data.scanned} Symbols
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
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">PE−CE%</th>
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
    </main>
  );
}
