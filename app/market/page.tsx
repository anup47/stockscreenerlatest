'use client';
import { useState, useEffect, useCallback } from 'react';
import type { IndexQuote, FnOStock } from '@/lib/dhan-api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtVol(n: number) {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ── Index card ────────────────────────────────────────────────────────────────

function IndexCard({ q }: { q: IndexQuote }) {
  const up = q.changePct >= 0;
  const changeColor = up ? 'text-emerald-400' : 'text-red-400';
  const borderColor = up ? 'border-t-emerald-600' : 'border-t-red-600';

  return (
    <div className={`bg-slate-900 border border-slate-700 border-t-2 ${borderColor} rounded-xl px-4 py-4 space-y-1.5`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{q.symbol}</span>
        <span className={`text-xs font-bold ${changeColor}`}>
          {up ? '+' : ''}{q.changePct.toFixed(2)}%
        </span>
      </div>
      <div className={`text-3xl font-bold font-mono tabular-nums leading-none ${q.symbol === 'VIX' ? 'text-amber-400' : 'text-slate-100'}`}>
        {fmt(q.ltp)}
      </div>
      <div className={`text-sm font-mono tabular-nums font-semibold ${changeColor}`}>
        {up ? '+' : ''}{fmt(q.change)}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
        <span>H {fmt(q.high)}</span>
        <span>L {fmt(q.low)}</span>
      </div>
    </div>
  );
}

// ── Top movers table ──────────────────────────────────────────────────────────

type SortKey = 'changePct' | 'volume' | 'oi' | 'oiChange';

function MoversTable({ movers }: { movers: FnOStock[] }) {
  const [sortKey, setSortKey]   = useState<SortKey>('changePct');
  const [sortAsc, setSortAsc]   = useState(false);
  const [search,  setSearch]    = useState('');
  const [filter,  setFilter]    = useState<'all' | 'gainers' | 'losers'>('all');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const visible = movers
    .filter(m => filter === 'all' || (filter === 'gainers' ? m.changePct > 0 : m.changePct < 0))
    .filter(m => !search || m.symbol.toLowerCase().includes(search.toLowerCase()) || m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });

  const Sh = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide cursor-pointer select-none hover:text-slate-200 transition-colors ${sortKey === col ? 'text-emerald-400' : 'text-slate-500'}`}
    >
      {label}{sortKey === col ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {(['all', 'gainers', 'losers'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded text-sm font-semibold capitalize transition-colors ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="ml-auto bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-36" />
      </div>

      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Symbol</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                <Sh label="Chg%" col="changePct" />
                <Sh label="Volume" col="volume" />
                <Sh label="OI" col="oi" />
                <Sh label="OI Chg" col="oiChange" />
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Sector</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {visible.slice(0, 25).map((m, i) => (
                <tr key={m.symbol} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-2 text-slate-600 text-xs">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono font-bold text-gray-900 text-sm">{m.symbol}</div>
                    <div className="text-sm text-slate-500 truncate max-w-[130px]">{m.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200 text-sm">Rs.{fmt(m.ltp)}</td>
                  <td className={`px-3 py-2 text-right font-mono text-sm font-semibold ${m.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {m.changePct >= 0 ? '+' : ''}{m.changePct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400 text-sm tabular-nums">{fmtVol(m.volume)}</td>
                  <td className="px-3 py-2 text-right text-slate-400 text-sm tabular-nums">{fmtVol(m.oi)}</td>
                  <td className={`px-3 py-2 text-right text-sm tabular-nums ${m.oiChange > 0 ? 'text-emerald-400' : m.oiChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                    {m.oiChange > 0 ? '+' : ''}{fmtVol(m.oiChange)}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-sm truncate max-w-[120px]">{m.sector || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Market breadth ────────────────────────────────────────────────────────────

function MarketBreadth({ movers }: { movers: FnOStock[] }) {
  const advances  = movers.filter(m => m.changePct > 0).length;
  const declines  = movers.filter(m => m.changePct < 0).length;
  const unchanged = movers.filter(m => m.changePct === 0).length;
  const total     = movers.length || 1;
  const adRatio   = declines > 0 ? +(advances / declines).toFixed(2) : advances > 0 ? 99 : 0;
  const sentiment = adRatio >= 1.5 ? 'Bullish' : adRatio <= 0.7 ? 'Bearish' : 'Neutral';
  const sentColor = sentiment === 'Bullish' ? 'text-emerald-400' : sentiment === 'Bearish' ? 'text-red-400' : 'text-amber-400';

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Market Breadth — F&amp;O Universe</p>
        <span className={`text-sm font-bold ${sentColor}`}>{sentiment}</span>
      </div>
      <div className="flex items-center gap-0 rounded-full overflow-hidden h-3">
        <div className="bg-emerald-500 h-full" style={{ width: `${(advances / total) * 100}%` }} />
        <div className="bg-slate-600 h-full" style={{ width: `${(unchanged / total) * 100}%` }} />
        <div className="bg-red-500 h-full" style={{ width: `${(declines / total) * 100}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-emerald-400">▲ {advances} Advances</span>
        <span className="text-slate-500">{unchanged} Unchanged</span>
        <span className="text-red-400">▼ {declines} Declines</span>
      </div>
      <div className="text-xs text-slate-500">
        A/D Ratio: <span className={`font-mono font-semibold ${sentColor}`}>{adRatio === 99 ? '∞' : adRatio}</span>
        <span className="ml-3">Total scanned: {movers.length}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface IndicesResponse { indices: IndexQuote[]; fetchedAt: string; }
interface MoversResponse  { movers: FnOStock[];    fetchedAt: string; }

export default function MarketPage() {
  const [indices,       setIndices]      = useState<IndexQuote[]>([]);
  const [movers,        setMovers]       = useState<FnOStock[]>([]);
  const [loadingIdx,    setLoadingIdx]   = useState(false);
  const [loadingMovers, setLoadingMov]   = useState(false);
  const [lastUpdated,   setLastUpdated]  = useState('');
  const [error,         setError]        = useState('');

  const refresh = useCallback(async () => {
    setLoadingIdx(true);
    setLoadingMov(true);
    setError('');
    try {
      const [idxRes, movRes] = await Promise.all([
        fetch('/api/dhan/indices'),
        fetch('/api/dhan/fno-movers'),
      ]);
      const [idxJson, movJson] = await Promise.all([
        idxRes.json() as Promise<IndicesResponse>,
        movRes.json() as Promise<MoversResponse>,
      ]);
      setIndices(idxJson.indices ?? []);
      setMovers(movJson.movers ?? []);
      setLastUpdated(new Date().toLocaleTimeString('en-IN'));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingIdx(false);
      setLoadingMov(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const nifty     = indices.find(q => q.symbol === 'NIFTY');
  const loading   = loadingIdx || loadingMovers;

  return (
    <main className="w-full px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Market Dashboard</h1>
          <p className="text-slate-400 text-xs mt-1 uppercase tracking-wide font-medium">
            NSE indices · F&amp;O movers · Market breadth
            {lastUpdated && <> &nbsp;·&nbsp; Updated {lastUpdated}</>}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded text-sm transition-colors"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="bg-red-950/40 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{error}</div>}

      {/* Index cards */}
      {indices.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {indices.map(q => <IndexCard key={q.symbol} q={q} />)}
        </div>
      ) : loadingIdx ? (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-700 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : null}

      {/* Key metrics row */}
      {nifty && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'NIFTY Prev Close', value: fmt(nifty.prevClose), color: 'text-slate-200' },
            { label: 'NIFTY Day Range',  value: `${fmt(nifty.low)} – ${fmt(nifty.high)}`, color: 'text-slate-200' },
            { label: 'NIFTY Open',       value: fmt(nifty.open), color: 'text-slate-200' },
            { label: 'Day Change',       value: `${nifty.changePct >= 0 ? '+' : ''}${nifty.changePct.toFixed(2)}%`, color: nifty.changePct >= 0 ? 'text-emerald-400' : 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{label}</div>
              <div className={`text-xl font-bold font-mono tabular-nums ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Market breadth */}
      {movers.length > 0 && <MarketBreadth movers={movers} />}

      {/* Top movers */}
      <div>
        <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Top F&amp;O Movers</h2>
        {movers.length > 0 ? (
          <MoversTable movers={movers} />
        ) : loadingMovers ? (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center text-slate-400 text-sm">
            Loading F&amp;O data…
          </div>
        ) : (
          <div className="text-center text-slate-500 py-8 text-sm">
            No data available. Click Refresh to try again.
          </div>
        )}
      </div>

      {/* Data note */}
      <div className="text-xs text-slate-600">
        Index data sourced from NSE India public API. F&amp;O movers from TradingView scanner. No broker credentials required for this page.
      </div>
    </main>
  );
}
