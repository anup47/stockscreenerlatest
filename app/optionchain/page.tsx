'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import { SymbolSearch } from '@/app/components/SymbolSearch';
import type { OptionChainData, OptionStrike } from '@/lib/dhan-api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtOI(n: number) {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function calcMaxPain(strikes: OptionStrike[]): number {
  let minPain = Infinity;
  let maxPainStrike = 0;
  for (const target of strikes) {
    const sp = target.strikePrice;
    let pain = 0;
    for (const s of strikes) {
      pain += Math.max(0, sp - s.strikePrice) * s.ce.oi;
      pain += Math.max(0, s.strikePrice - sp) * s.pe.oi;
    }
    if (pain < minPain) { minPain = pain; maxPainStrike = sp; }
  }
  return maxPainStrike;
}

function calcPCR(strikes: OptionStrike[]) {
  const totalPutOI  = strikes.reduce((a, s) => a + s.pe.oi, 0);
  const totalCallOI = strikes.reduce((a, s) => a + s.ce.oi, 0);
  return totalCallOI > 0 ? +(totalPutOI / totalCallOI).toFixed(2) : 0;
}

function findATM(strikes: OptionStrike[], spot: number): number {
  return strikes.reduce((best, s) =>
    Math.abs(s.strikePrice - spot) < Math.abs(best - spot) ? s.strikePrice : best,
    strikes[0]?.strikePrice ?? 0,
  );
}

// ── OI change badge ───────────────────────────────────────────────────────────

function OIChangeBadge({ v }: { v: number }) {
  if (v === 0) return <span className="text-slate-600">—</span>;
  const cls = v > 0 ? 'text-emerald-400' : 'text-red-400';
  return <span className={`font-mono text-xs ${cls}`}>{v > 0 ? '+' : ''}{fmtOI(v)}</span>;
}

// ── Strike row ────────────────────────────────────────────────────────────────

function StrikeRow({
  s, atm, maxPain, spotPrice,
}: {
  s: OptionStrike; atm: number; maxPain: number; spotPrice: number;
}) {
  const isATM      = s.strikePrice === atm;
  const isMaxPain  = s.strikePrice === maxPain;
  const isITMCall  = s.strikePrice < spotPrice;
  const isITMPut   = s.strikePrice > spotPrice;

  const rowBg = isATM
    ? 'bg-emerald-950/40 border-y border-emerald-800/60'
    : isMaxPain
      ? 'bg-amber-950/30'
      : '';

  return (
    <tr className={`text-xs hover:bg-slate-800/50 transition-colors ${rowBg}`}>
      {/* CALL side */}
      <td className={`px-2 py-1.5 text-right tabular-nums ${isITMCall ? 'text-slate-500' : 'text-slate-200'}`}>{fmtOI(s.ce.oi)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums"><OIChangeBadge v={s.ce.oiChange} /></td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${isITMCall ? 'text-slate-500' : 'text-slate-400'}`}>{fmtOI(s.ce.volume)}</td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${isITMCall ? 'text-slate-500' : 'text-amber-400'}`}>
        {s.ce.iv > 0 ? `${s.ce.iv.toFixed(1)}%` : '—'}
      </td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${isITMCall ? 'text-slate-500' : 'text-sky-400'}`}>
        {s.ce.delta !== 0 ? s.ce.delta.toFixed(2) : '—'}
      </td>
      <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${isITMCall ? 'text-slate-500' : 'text-emerald-300'}`}>
        {fmt(s.ce.ltp)}
      </td>

      {/* Strike (center) */}
      <td className={`px-3 py-1.5 text-center font-bold tabular-nums ${
        isATM ? 'text-emerald-400 text-sm' : isMaxPain ? 'text-amber-300' : 'text-slate-200'
      }`}>
        {s.strikePrice.toLocaleString('en-IN')}
        {isATM     && <span className="ml-1 text-[9px] font-normal text-emerald-600">ATM</span>}
        {isMaxPain && <span className="ml-1 text-[9px] font-normal text-amber-600">MP</span>}
      </td>

      {/* PUT side */}
      <td className={`px-2 py-1.5 text-left font-semibold tabular-nums ${isITMPut ? 'text-slate-500' : 'text-red-300'}`}>
        {fmt(s.pe.ltp)}
      </td>
      <td className={`px-2 py-1.5 text-left tabular-nums ${isITMPut ? 'text-slate-500' : 'text-sky-400'}`}>
        {s.pe.delta !== 0 ? s.pe.delta.toFixed(2) : '—'}
      </td>
      <td className={`px-2 py-1.5 text-left tabular-nums ${isITMPut ? 'text-slate-500' : 'text-amber-400'}`}>
        {s.pe.iv > 0 ? `${s.pe.iv.toFixed(1)}%` : '—'}
      </td>
      <td className={`px-2 py-1.5 text-left tabular-nums ${isITMPut ? 'text-slate-500' : 'text-slate-400'}`}>{fmtOI(s.pe.volume)}</td>
      <td className="px-2 py-1.5 text-left tabular-nums"><OIChangeBadge v={s.pe.oiChange} /></td>
      <td className={`px-2 py-1.5 text-left tabular-nums ${isITMPut ? 'text-slate-500' : 'text-slate-200'}`}>{fmtOI(s.pe.oi)}</td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OptionChainPage() {
  const creds = useDhanCredentials();

  const [symbol,   setSymbol]   = useState('NIFTY');
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry,   setExpiry]   = useState('');
  const [data,     setData]     = useState<OptionChainData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const loadExpiries = useCallback(async (sym: string) => {
    if (!creds.isConfigured) return;
    setExpiries([]);
    setExpiry('');
    setData(null);
    try {
      const res  = await fetch(`/api/dhan/expiry?symbol=${sym}`, { headers: creds.headers });
      const json = await res.json() as { expiries?: string[]; error?: string };
      if (!res.ok) { setError(json.error ?? 'Failed to load expiries'); return; }
      const list = json.expiries ?? [];
      setExpiries(list);
      if (list.length > 0) setExpiry(list[0]);
    } catch (e) { setError(String(e)); }
  }, [creds]);

  const loadChain = useCallback(async () => {
    if (!creds.isConfigured || !expiry) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/dhan/option-chain?symbol=${symbol}&expiry=${expiry}`, { headers: creds.headers });
      const json = await res.json() as OptionChainData & { error?: string };
      if (!res.ok) { setError((json as { error?: string }).error ?? 'Failed to load option chain'); return; }
      setData(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [creds, symbol, expiry]);

  useEffect(() => { loadExpiries(symbol); }, [symbol, loadExpiries]);
  useEffect(() => { if (expiry) loadChain(); }, [expiry, loadChain]);

  const strikes   = data?.strikes ?? [];
  const spotPrice = data?.underlyingPrice ?? 0;
  const atm       = strikes.length > 0 ? findATM(strikes, spotPrice) : 0;
  const maxPain   = strikes.length > 0 ? calcMaxPain(strikes) : 0;
  const pcr       = strikes.length > 0 ? calcPCR(strikes) : 0;

  const totalCallOI = strikes.reduce((a, s) => a + s.ce.oi, 0);
  const totalPutOI  = strikes.reduce((a, s) => a + s.pe.oi, 0);

  const pcrColor = pcr >= 1.3 ? 'text-emerald-400' : pcr <= 0.7 ? 'text-red-400' : 'text-amber-400';
  const pcrLabel = pcr >= 1.3 ? 'Bullish' : pcr <= 0.7 ? 'Bearish' : 'Neutral';

  if (!creds.isConfigured) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-2xl font-bold text-slate-300">Dhan API Not Configured</p>
        <p className="text-slate-400">Option Chain requires a Dhan broker API key.</p>
        <a href="/settings" className="inline-block mt-3 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-sm transition-colors">
          Go to Settings
        </a>
      </main>
    );
  }

  return (
    <main className="max-w-screen-2xl mx-auto px-4 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Option Chain</h1>
          <p className="text-slate-400 text-sm mt-0.5">Live strike-wise OI · IV · Greeks — powered by Dhan API</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SymbolSearch
            value={symbol}
            onChange={s => { setSymbol(s); setData(null); }}
          />
          <select
            value={expiry}
            onChange={e => setExpiry(e.target.value)}
            disabled={expiries.length === 0}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          >
            {expiries.length === 0 && <option value="">Loading…</option>}
            {expiries.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <button
            onClick={loadChain}
            disabled={loading || !expiry}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded text-sm transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-950/40 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{error}</div>}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Spot Price',    value: fmt(spotPrice),      color: 'text-slate-100' },
            { label: 'ATM Strike',    value: atm.toLocaleString('en-IN'), color: 'text-emerald-400' },
            { label: 'Max Pain',      value: maxPain.toLocaleString('en-IN'), color: 'text-amber-400' },
            { label: `PCR (${pcrLabel})`, value: pcr.toString(),  color: pcrColor },
            { label: 'Total Call OI', value: fmtOI(totalCallOI), color: 'text-emerald-300' },
            { label: 'Total Put OI',  value: fmtOI(totalPutOI),  color: 'text-red-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-center">
              <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-400 text-sm">Loading option chain for {symbol} {expiry}…</p>
          <div className="mt-3 w-48 mx-auto h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full animate-pulse w-1/2" />
          </div>
        </div>
      )}

      {/* Option chain table */}
      {data && !loading && strikes.length > 0 && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                {/* Section headers */}
                <tr className="bg-slate-800/60">
                  <th colSpan={6} className="text-center py-1.5 text-emerald-400 text-xs font-bold tracking-widest uppercase border-r border-slate-700">
                    CALLS
                  </th>
                  <th className="py-1.5 border-x border-slate-700 bg-slate-900" />
                  <th colSpan={6} className="text-center py-1.5 text-red-400 text-xs font-bold tracking-widest uppercase border-l border-slate-700">
                    PUTS
                  </th>
                </tr>
                {/* Column headers */}
                <tr className="bg-slate-900 border-b border-slate-700 text-slate-500 uppercase tracking-wide">
                  <th className="px-2 py-2 text-right">OI</th>
                  <th className="px-2 py-2 text-right">OI Chg</th>
                  <th className="px-2 py-2 text-right">Vol</th>
                  <th className="px-2 py-2 text-right">IV</th>
                  <th className="px-2 py-2 text-right">Delta</th>
                  <th className="px-2 py-2 text-right border-r border-slate-800">LTP</th>
                  <th className="px-3 py-2 text-center border-x border-slate-700 bg-slate-800/40 text-slate-300">Strike</th>
                  <th className="px-2 py-2 text-left border-l border-slate-800">LTP</th>
                  <th className="px-2 py-2 text-left">Delta</th>
                  <th className="px-2 py-2 text-left">IV</th>
                  <th className="px-2 py-2 text-left">Vol</th>
                  <th className="px-2 py-2 text-left">OI Chg</th>
                  <th className="px-2 py-2 text-left">OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {strikes.map(s => (
                  <StrikeRow
                    key={s.strikePrice}
                    s={s}
                    atm={atm}
                    maxPain={maxPain}
                    spotPrice={spotPrice}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-950/80 border border-emerald-800 inline-block" />
              ATM (At the Money)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-950/60 border border-amber-900 inline-block" />
              Max Pain
            </span>
            <span>Faded rows = ITM side</span>
            <span className="ml-auto">
              {data.fetchedAt && `Updated ${new Date(data.fetchedAt).toLocaleTimeString('en-IN')}`}
            </span>
          </div>
        </div>
      )}

      {!loading && !data && !error && creds.isConfigured && (
        <div className="text-center py-16 text-slate-500">
          <p className="text-base">Select symbol and expiry above to load the option chain.</p>
        </div>
      )}
    </main>
  );
}
