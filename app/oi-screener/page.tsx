'use client';
import { useState, useCallback, useEffect } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import type { OIScreenerRow } from '@/app/api/dhan/oi-screener/route';

interface ScreenerResponse {
  bullish:   OIScreenerRow[];
  bearish:   OIScreenerRow[];
  all:       OIScreenerRow[];
  scanned:   number;
  scannedAt: string;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtOI(n: number) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000)    return `${sign}${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)      return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toLocaleString('en-IN')}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtTotalOI(n: number) {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(1)}L`;
  return n.toLocaleString('en-IN');
}

// ── Row ───────────────────────────────────────────────────────────────────────

function StockRow({ row, rank, side }: { row: OIScreenerRow; rank: number; side: 'bullish' | 'bearish' }) {
  const netColor = row.netOIChgPct >= 0 ? 'text-emerald-600' : 'text-red-600';
  const rankBg   = side === 'bullish' ? 'bg-emerald-600' : 'bg-red-600';

  return (
    <tr className="border-b border-slate-700 hover:bg-slate-800/25 transition-colors">
      <td className="px-4 py-3.5">
        <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full ${rankBg} text-white text-[10px] font-bold`}>
          {rank}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="font-bold text-gray-900 font-mono text-base">{row.symbol}</div>
        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{row.expiry}</div>
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums">
        <div className={`text-sm font-semibold ${row.ceOIChg >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {fmtOI(row.ceOIChg)}
        </div>
        <div className="text-[10px] text-slate-400">{fmtTotalOI(row.ceOI)} OI</div>
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums">
        <div className={`text-sm font-semibold ${row.peOIChg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {fmtOI(row.peOIChg)}
        </div>
        <div className="text-[10px] text-slate-400">{fmtTotalOI(row.peOI)} OI</div>
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums">
        <div className={`text-xl font-bold ${netColor}`}>{fmtPct(row.netOIChgPct)}</div>
        <div className="text-[10px] text-slate-400">{fmtOI(row.netOIChg)} net</div>
      </td>
    </tr>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function Panel({
  rows, side, loading,
}: { rows: OIScreenerRow[]; side: 'bullish' | 'bearish'; loading: boolean }) {
  const isBull       = side === 'bullish';
  const borderColor  = isBull ? 'border-t-emerald-500' : 'border-t-red-500';
  const signalBadge  = isBull
    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
    : 'bg-red-50 text-red-700 ring-1 ring-red-200';
  const title       = isBull ? 'TOP 5 BULLISH' : 'TOP 5 BEARISH';
  const subtitle    = isBull ? 'Highest PE − CE OI Chg%' : 'Lowest PE − CE OI Chg%';

  return (
    <div className={`bg-white border border-slate-700 border-t-2 ${borderColor} rounded-xl overflow-hidden`}>
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${signalBadge}`}>
          {isBull ? '🟢 Bullish Signal' : '🔴 Bearish Signal'}
        </span>
      </div>

      {/* Table */}
      <table className="w-full">
        <thead className="bg-slate-800 border-b border-slate-700">
          <tr>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-10">#</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-rose-500 uppercase tracking-widest">CE OI Chg</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-emerald-600 uppercase tracking-widest">PE OI Chg</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">PE−CE %</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-700">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-4">
                      <div className="h-4 rounded bg-slate-800 shimmer" style={{ width: `${40 + (i * j * 13) % 45}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.length === 0
            ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">No data yet</td>
              </tr>
            )
            : rows.map((row, i) => (
              <StockRow key={row.symbol} row={row} rank={i + 1} side={side} />
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OIScreenerPage() {
  const { isConfigured, isHydrated, headers } = useDhanCredentials();
  const [data,    setData]    = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

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
        <p className="text-slate-500 text-sm">Dhan credentials not configured.</p>
        <a href="/settings" className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded hover:bg-emerald-500 transition-colors">
          Go to Settings
        </a>
      </main>
    );
  }

  const elapsed = data
    ? new Date(data.scannedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <main className="px-5 py-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">OI Change Screener</h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">
            (PE − CE) OI Change as % of Total OI &nbsp;·&nbsp; Top 5 Bullish &amp; Bearish F&amp;O Stocks
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {elapsed && !loading && (
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
              {data?.scanned} stocks · {elapsed}
            </span>
          )}
          <button
            onClick={runScreen}
            disabled={loading}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded text-sm transition-colors"
          >
            {loading ? 'Scanning…' : 'Run Screen'}
          </button>
        </div>
      </div>

      {/* ── Loading note ── */}
      {loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-700 text-sm">
          Fetching option chains for ~34 F&amp;O symbols — this takes 20–40 seconds. Please wait…
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-red-700 text-sm">{error}</div>
      )}

      {/* ── Method card ── */}
      <div className="bg-white border border-slate-700 rounded-xl px-5 py-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Methodology</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-500">
          <div className="space-y-1">
            <p><span className="font-bold text-emerald-600">Bullish</span> — Highest (PE OI Chg − CE OI Chg) / Total OI</p>
            <p className="text-slate-400">More put writing &amp; call unwinding relative to total market OI → market expects price to hold or rise</p>
          </div>
          <div className="space-y-1">
            <p><span className="font-bold text-red-600">Bearish</span> — Lowest (most negative) (PE OI Chg − CE OI Chg) / Total OI</p>
            <p className="text-slate-400">More call writing &amp; put unwinding relative to total market OI → market expects price to fall</p>
          </div>
        </div>
      </div>

      {/* ── Screener panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel rows={data?.bullish ?? []} side="bullish" loading={loading} />
        <Panel rows={data?.bearish ?? []} side="bearish" loading={loading} />
      </div>

      {/* ── Full ranked table ── */}
      {data && data.all.length > 0 && !loading && (
        <div className="bg-white border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Ranked List — All {data.scanned} Symbols</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-8">#</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Symbol</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiry</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-rose-500 uppercase tracking-widest">CE OI Chg</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-emerald-600 uppercase tracking-widest">PE OI Chg</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">PE−CE%</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {data.all.map((row, i) => {
                  const isBull = row.netOIChgPct > 0;
                  const pctColor = isBull ? 'text-emerald-600' : 'text-red-600';
                  const isTop5   = i < 5;
                  const isBot5   = i >= data.all.length - 5;
                  return (
                    <tr key={row.symbol}
                      className={`hover:bg-slate-800/25 transition-colors ${isTop5 ? 'bg-emerald-950/20' : isBot5 ? 'bg-rose-950/20' : ''}`}>
                      <td className="px-4 py-2.5 text-[10px] text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5 font-bold font-mono text-gray-900">{row.symbol}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{row.expiry}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${row.ceOIChg >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {fmtOI(row.ceOIChg)}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${row.peOIChg >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {fmtOI(row.peOIChg)}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${pctColor}`}>
                        {fmtPct(row.netOIChgPct)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isBull ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
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
    </main>
  );
}
