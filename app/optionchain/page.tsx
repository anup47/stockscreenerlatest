'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import { SymbolSearch } from '@/app/components/SymbolSearch';
import type { OptionChainData, OptionStrike } from '@/lib/dhan-api';

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtOI(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000)    return `${sign}${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000)      return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-IN');
}

function fmtChg(n: number) {
  return `${n > 0 ? '+' : ''}${fmtOI(n)}`;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

function findATM(strikes: OptionStrike[], spot: number): number {
  if (!strikes.length) return 0;
  return strikes.reduce(
    (b, s) => Math.abs(s.strikePrice - spot) < Math.abs(b - spot) ? s.strikePrice : b,
    strikes[0].strikePrice,
  );
}

function calcMaxPain(strikes: OptionStrike[]): number {
  if (!strikes.length) return 0;
  let minPain = Infinity, mp = 0;
  for (const t of strikes) {
    const sp = t.strikePrice;
    let pain = 0;
    for (const s of strikes) {
      pain += Math.max(0, sp - s.strikePrice) * s.ce.oi;
      pain += Math.max(0, s.strikePrice - sp) * s.pe.oi;
    }
    if (pain < minPain) { minPain = pain; mp = sp; }
  }
  return mp;
}

function ceTrend(oiChg: number): 'Bullish' | 'Bearish' {
  return oiChg <= 0 ? 'Bullish' : 'Bearish';
}
function peTrend(oiChg: number): 'Bullish' | 'Bearish' {
  return oiChg > 0 ? 'Bullish' : 'Bearish';
}

interface ChainStats {
  ceOI: number; peOI: number;
  ceOIChg: number; peOIChg: number;
  ceVol: number; peVol: number;
  ceBullOI: number; peBullOI: number;
  ceBearOI: number; peBearOI: number;
  ceBullChg: number; peBullChg: number;
  ceBearChg: number; peBearChg: number;
  cePrem: number; pePrem: number;
  otmCeOI: number; otmPeOI: number;
  otmCeChg: number; otmPeChg: number;
  otmCeVol: number; otmPeVol: number;
  itmCeOI: number; itmPeOI: number;
  itmCeChg: number; itmPeChg: number;
  itmCeVol: number; itmPeVol: number;
}

function computeStats(strikes: OptionStrike[], spot: number): ChainStats {
  const s: ChainStats = {
    ceOI: 0, peOI: 0, ceOIChg: 0, peOIChg: 0, ceVol: 0, peVol: 0,
    ceBullOI: 0, peBullOI: 0, ceBearOI: 0, peBearOI: 0,
    ceBullChg: 0, peBullChg: 0, ceBearChg: 0, peBearChg: 0,
    cePrem: 0, pePrem: 0,
    otmCeOI: 0, otmPeOI: 0, otmCeChg: 0, otmPeChg: 0, otmCeVol: 0, otmPeVol: 0,
    itmCeOI: 0, itmPeOI: 0, itmCeChg: 0, itmPeChg: 0, itmCeVol: 0, itmPeVol: 0,
  };
  for (const row of strikes) {
    s.ceOI += row.ce.oi; s.peOI += row.pe.oi;
    s.ceOIChg += row.ce.oiChange; s.peOIChg += row.pe.oiChange;
    s.ceVol += row.ce.volume; s.peVol += row.pe.volume;
    s.cePrem += row.ce.ltp; s.pePrem += row.pe.ltp;

    if (ceTrend(row.ce.oiChange) === 'Bullish') { s.ceBullOI += row.ce.oi; s.ceBullChg += row.ce.oiChange; }
    else { s.ceBearOI += row.ce.oi; s.ceBearChg += row.ce.oiChange; }
    if (peTrend(row.pe.oiChange) === 'Bullish') { s.peBullOI += row.pe.oi; s.peBullChg += row.pe.oiChange; }
    else { s.peBearOI += row.pe.oi; s.peBearChg += row.pe.oiChange; }

    if (row.strikePrice > spot) {
      s.otmCeOI += row.ce.oi; s.otmCeChg += row.ce.oiChange; s.otmCeVol += row.ce.volume;
      s.itmPeOI += row.pe.oi; s.itmPeChg += row.pe.oiChange; s.itmPeVol += row.pe.volume;
    } else if (row.strikePrice < spot) {
      s.itmCeOI += row.ce.oi; s.itmCeChg += row.ce.oiChange; s.itmCeVol += row.ce.volume;
      s.otmPeOI += row.pe.oi; s.otmPeChg += row.pe.oiChange; s.otmPeVol += row.pe.volume;
    }
  }
  return s;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TrendBadge({ trend, align }: { trend: 'Bullish' | 'Bearish'; align?: 'right' }) {
  const isB = trend === 'Bullish';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide whitespace-nowrap
      ${isB
        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
        : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'}
      ${align === 'right' ? 'float-right' : ''}`}>
      <span className="text-[10px]">{isB ? '▲' : '▼'}</span>
      {trend}
    </span>
  );
}

function OIBar({ value, maxVal, rtl }: { value: number; maxVal: number; rtl?: boolean }) {
  const hasData = value !== 0;
  const pct = (hasData && maxVal > 0) ? Math.min(Math.abs(value) / maxVal * 100, 100) : 0;
  const pos = value >= 0;
  return (
    <div className={`relative flex items-center h-[30px] min-w-[100px] overflow-hidden`}>
      {pct > 2 && (
        <div
          className={`absolute inset-y-[4px] rounded-sm ${pos ? 'bg-emerald-500/35' : 'bg-rose-500/35'} ${rtl ? 'right-0' : 'left-0'}`}
          style={{ width: `${pct}%` }}
        />
      )}
      <span className={`relative z-10 tabular-nums font-mono text-xs w-full font-medium
        ${rtl ? 'text-right pr-2.5' : 'text-left pl-2.5'}
        ${!hasData ? 'text-slate-600' : pos ? 'text-emerald-300' : 'text-rose-300'}`}>
        {hasData ? fmtChg(value) : '—'}
      </span>
    </div>
  );
}

function StrikeRow({
  s, atm, maxPain, spot, maxCeChg, maxPeChg,
}: {
  s: OptionStrike; atm: number; maxPain: number; spot: number;
  maxCeChg: number; maxPeChg: number;
}) {
  const isATM   = s.strikePrice === atm;
  const isMP    = s.strikePrice === maxPain && !isATM;
  const itmCall = s.strikePrice < spot;
  const itmPut  = s.strikePrice > spot;
  const ceT     = ceTrend(s.ce.oiChange);
  const peT     = peTrend(s.pe.oiChange);

  const rowBg = isATM
    ? 'bg-amber-900/45 border-y-2 border-amber-500/50'
    : isMP
    ? 'bg-violet-950/50 border-y border-violet-600/30'
    : ceT === 'Bullish'
    ? 'bg-emerald-950/20'
    : 'bg-rose-950/20';

  const dimCall = itmCall ? 'opacity-30' : '';
  const dimPut  = itmPut  ? 'opacity-30' : '';

  return (
    <tr className={`${rowBg} hover:brightness-110 transition-all duration-75`}>

      {/* ── CALLS ── */}
      <td className={`px-3 py-2 text-right ${dimCall}`}>
        <TrendBadge trend={ceT} align="right" />
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-mono text-sm ${dimCall} ${!itmCall ? 'text-sky-300' : ''}`}>
        {s.ce.iv > 0 ? `${s.ce.iv.toFixed(1)}%` : <span className="text-slate-600 text-xs">—</span>}
      </td>
      <td className={`py-0 ${dimCall}`}>
        <OIBar value={s.ce.oiChange} maxVal={maxCeChg} rtl />
      </td>
      <td className={`px-3 py-2 text-right tabular-nums text-sm font-medium ${dimCall} ${!itmCall ? 'text-slate-200' : 'text-slate-500'}`}>
        {fmtOI(s.ce.oi)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums text-sm font-bold ${dimCall} ${!itmCall ? 'text-emerald-300' : 'text-slate-500'}`}>
        {fmt(s.ce.ltp)}
      </td>

      {/* ── STRIKE ── */}
      <td className={`px-4 py-2 text-center font-bold border-x border-slate-600/60 whitespace-nowrap
        ${isATM ? 'text-amber-300 text-base' : isMP ? 'text-violet-300 text-sm' : 'text-white text-sm'}`}>
        {s.strikePrice.toLocaleString('en-IN')}
        {isATM && <div className="text-[9px] font-normal text-amber-500/90 leading-tight mt-0.5">ATM</div>}
        {isMP   && <div className="text-[9px] font-normal text-violet-400/80 leading-tight mt-0.5">MaxPain</div>}
      </td>

      {/* ── PUTS ── */}
      <td className={`px-3 py-2 text-left tabular-nums text-sm font-bold ${dimPut} ${!itmPut ? 'text-rose-300' : 'text-slate-500'}`}>
        {fmt(s.pe.ltp)}
      </td>
      <td className={`px-3 py-2 text-left tabular-nums text-sm font-medium ${dimPut} ${!itmPut ? 'text-slate-200' : 'text-slate-500'}`}>
        {fmtOI(s.pe.oi)}
      </td>
      <td className={`py-0 ${dimPut}`}>
        <OIBar value={s.pe.oiChange} maxVal={maxPeChg} />
      </td>
      <td className={`px-3 py-2 text-left tabular-nums font-mono text-sm ${dimPut} ${!itmPut ? 'text-sky-300' : ''}`}>
        {s.pe.iv > 0 ? `${s.pe.iv.toFixed(1)}%` : <span className="text-slate-600 text-xs">—</span>}
      </td>
      <td className={`px-3 py-2 text-left ${dimPut}`}>
        <TrendBadge trend={peT} />
      </td>
    </tr>
  );
}

// ── Stats tables ──────────────────────────────────────────────────────────────

type NetRow = { label: string; ce: number | string; pe: number | string; net?: number | string; chg?: boolean };
type ValRow = { label: string; value: number | string; color?: string };

function NetTable({ title, rows, accent }: { title: string; rows: NetRow[]; accent: string }) {
  function numCell(v: number | string, chg?: boolean) {
    if (typeof v === 'string') return <span className="text-slate-300 font-mono">{v}</span>;
    const col = chg
      ? (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-500')
      : 'text-slate-200';
    return <span className={`${col} tabular-nums font-mono`}>{chg && v > 0 ? '+' : ''}{fmtOI(v)}</span>;
  }
  function netCell(v: number | string | undefined, chg?: boolean) {
    if (v === undefined) return <span className="text-slate-600">—</span>;
    if (typeof v === 'string') return <span className="text-slate-300 font-mono">{v}</span>;
    const col = v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-500';
    return <span className={`${col} tabular-nums font-mono font-semibold`}>{chg && v > 0 ? '+' : ''}{fmtOI(v)}</span>;
  }
  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-lg">
      <div className={`px-4 py-2.5 text-xs font-bold tracking-widest uppercase text-center ${accent} bg-slate-800/70 border-b border-slate-700/60`}>
        {title}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800/30 border-b border-slate-700/40 text-[10px] uppercase tracking-wide">
            <th className="px-3 py-2 text-left text-slate-500 font-semibold">Stat</th>
            <th className="px-3 py-2 text-right text-emerald-500/80 font-semibold">Calls</th>
            <th className="px-3 py-2 text-right text-rose-500/80 font-semibold">Puts</th>
            <th className="px-3 py-2 text-right text-slate-400 font-semibold">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-t border-slate-800/60 hover:bg-slate-800/25 transition-colors">
              <td className="px-3 py-2 text-slate-400 font-medium">{r.label}</td>
              <td className="px-3 py-2 text-right">{numCell(r.ce, r.chg)}</td>
              <td className="px-3 py-2 text-right">{numCell(r.pe, r.chg)}</td>
              <td className="px-3 py-2 text-right">{netCell(r.net, r.chg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValTable({ title, rows, accent }: { title: string; rows: ValRow[]; accent: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-lg">
      <div className={`px-4 py-2.5 text-xs font-bold tracking-widest uppercase text-center ${accent} bg-slate-800/70 border-b border-slate-700/60`}>
        {title}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-t border-slate-800/60 hover:bg-slate-800/25 transition-colors">
              <td className="px-3 py-2 text-slate-400 font-medium">{r.label}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-mono font-semibold ${r.color ?? 'text-slate-200'}`}>
                {typeof r.value === 'number' ? fmtOI(r.value) : r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [atmRange, setAtmRange] = useState(15);
  const [showAll,  setShowAll]  = useState(false);

  const loadExpiries = useCallback(async (sym: string) => {
    if (!creds.isConfigured) return;
    setExpiries([]); setExpiry(''); setData(null); setError('');
    try {
      const res  = await fetch(`/api/dhan/expiry?symbol=${sym}`, { headers: creds.headers });
      const json = await res.json() as { expiries?: string[]; error?: string };
      if (!res.ok) { setError(json.error ?? 'Failed to load expiries'); return; }
      const list = json.expiries ?? [];
      setExpiries(list);
      if (list.length) setExpiry(list[0]);
    } catch (e) { setError(String(e)); }
  }, [creds]);

  const loadChain = useCallback(async () => {
    if (!creds.isConfigured || !expiry) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/dhan/option-chain?symbol=${symbol}&expiry=${expiry}`, { headers: creds.headers });
      const json = await res.json() as OptionChainData & { error?: string };
      if (!res.ok) { setError((json as { error?: string }).error ?? 'Failed'); return; }
      setData(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [creds, symbol, expiry]);

  useEffect(() => { loadExpiries(symbol); }, [symbol, loadExpiries]);
  useEffect(() => { if (expiry) loadChain(); }, [expiry, loadChain]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const allStrikes = data?.strikes ?? [];
  const spot       = data?.underlyingPrice ?? 0;
  const atm        = allStrikes.length ? findATM(allStrikes, spot) : 0;
  const maxPain    = allStrikes.length ? calcMaxPain(allStrikes) : 0;
  const atmIdx     = allStrikes.findIndex(s => s.strikePrice === atm);

  const strikes = showAll
    ? allStrikes
    : atmIdx >= 0
      ? allStrikes.slice(Math.max(0, atmIdx - atmRange), atmIdx + atmRange + 1)
      : allStrikes;

  const maxCeChg = strikes.reduce((m, s) => Math.max(m, Math.abs(s.ce.oiChange)), 0);
  const maxPeChg = strikes.reduce((m, s) => Math.max(m, Math.abs(s.pe.oiChange)), 0);

  const totalCeOI = allStrikes.reduce((a, s) => a + s.ce.oi, 0);
  const totalPeOI = allStrikes.reduce((a, s) => a + s.pe.oi, 0);
  const pcr       = totalCeOI > 0 ? +(totalPeOI / totalCeOI).toFixed(2) : 0;
  const pcrLabel  = pcr >= 1.3 ? 'Bullish' : pcr <= 0.7 ? 'Bearish' : 'Neutral';
  const pcrColor  = pcr >= 1.3 ? 'text-emerald-400' : pcr <= 0.7 ? 'text-rose-400' : 'text-amber-400';

  const totalCeVol = allStrikes.reduce((a, s) => a + s.ce.volume, 0);
  const totalPeVol = allStrikes.reduce((a, s) => a + s.pe.volume, 0);
  const pcrVol     = totalCeVol > 0 ? +(totalPeVol / totalCeVol).toFixed(2) : 0;

  const atmRow = allStrikes.find(s => s.strikePrice === atm);
  const atmIV  = atmRow ? (atmRow.ce.iv + atmRow.pe.iv) / 2 : 0;

  const stats = allStrikes.length ? computeStats(allStrikes, spot) : null;

  // ── Guard ───────────────────────────────────────────────────────────────────

  if (!creds.isConfigured) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-3xl font-bold text-slate-200">Dhan API Not Configured</p>
        <p className="text-slate-400 text-lg">Option Chain requires a Dhan broker API key.</p>
        <a href="/settings" className="inline-block mt-4 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm transition-colors">
          Go to Settings →
        </a>
      </main>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="max-w-screen-2xl mx-auto px-4 py-4 space-y-4">

      {/* ── Controls ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900 border border-slate-700/80 rounded-xl px-5 py-3 shadow-lg">
        <div className="flex items-center gap-3 flex-wrap">
          <SymbolSearch value={symbol} onChange={s => { setSymbol(s); setData(null); }} />

          <select
            value={expiry} onChange={e => setExpiry(e.target.value)} disabled={expiries.length === 0}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50 min-w-[130px]"
          >
            {expiries.length === 0 && <option value="">Loading…</option>}
            {expiries.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          {/* ATM filter */}
          <div className="flex items-center gap-4 bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="radio" checked={!showAll} onChange={() => setShowAll(false)} className="accent-emerald-500 w-3.5 h-3.5" />
              <span className="font-medium">Near ATM</span>
              <input
                type="number" min={5} max={50} value={atmRange}
                onChange={e => { setAtmRange(Number(e.target.value)); setShowAll(false); }}
                onClick={() => setShowAll(false)}
                className="w-12 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-center text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
              />
              <span className="text-slate-500">strikes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="radio" checked={showAll} onChange={() => setShowAll(true)} className="accent-emerald-500 w-3.5 h-3.5" />
              <span className="font-medium">All Strikes</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {data?.fetchedAt && (
            <span className="text-sm text-slate-500">
              Updated {new Date(data.fetchedAt).toLocaleTimeString('en-IN')}
            </span>
          )}
          <button
            onClick={loadChain} disabled={loading || !expiry}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors shadow"
          >
            <span className={loading ? 'animate-spin inline-block' : ''}>⟳</span>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-700 rounded-xl px-5 py-3 text-red-300 text-sm font-medium">{error}</div>
      )}

      {/* ── Info bar ── */}
      {data && (
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
          {[
            { label: 'Spot Price',      value: fmt(spot),                            color: 'text-white text-xl' },
            { label: 'ATM Strike',      value: atm.toLocaleString('en-IN'),           color: 'text-amber-300 text-xl' },
            { label: 'Max Pain',        value: maxPain.toLocaleString('en-IN'),       color: 'text-violet-300 text-lg' },
            { label: `PCR · ${pcrLabel}`, value: pcr.toFixed(2),                     color: `${pcrColor} text-xl` },
            { label: 'PCR Volume',      value: pcrVol.toFixed(2),                    color: 'text-sky-300 text-lg' },
            { label: 'ATM IV',          value: atmIV > 0 ? `${atmIV.toFixed(1)}%` : '—', color: 'text-orange-300 text-lg' },
            { label: 'Showing',         value: `${strikes.length} strikes`,           color: 'text-slate-400 text-base' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-center shadow">
              <div className={`font-bold font-mono leading-tight ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-1 font-medium">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-14 text-center">
          <p className="text-slate-400">Loading option chain for <span className="text-white font-semibold">{symbol}</span> · <span className="text-amber-300">{expiry}</span></p>
          <div className="mt-4 w-56 mx-auto h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-emerald-500 rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {/* ── Option chain table ── */}
      {data && !loading && strikes.length > 0 && (
        <div className="rounded-xl border border-slate-700/80 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse">
              <thead>
                {/* Band headers */}
                <tr>
                  <th colSpan={5}
                    className="py-3 text-center text-sm font-black tracking-[0.25em] uppercase
                      bg-gradient-to-r from-emerald-900 via-emerald-800/80 to-emerald-900/40
                      text-emerald-300 border-r border-emerald-700/60">
                    ▲ CALLS
                  </th>
                  <th className="py-3 bg-slate-800 border-x border-slate-600/80 text-xs font-bold text-slate-400 tracking-widest uppercase">
                    STRIKE
                  </th>
                  <th colSpan={5}
                    className="py-3 text-center text-sm font-black tracking-[0.25em] uppercase
                      bg-gradient-to-r from-rose-900/40 via-rose-800/80 to-rose-900
                      text-rose-300 border-l border-rose-700/60">
                    ▼ PUTS
                  </th>
                </tr>
                {/* Column labels */}
                <tr className="text-xs font-semibold tracking-widest uppercase border-b-2 border-slate-700">
                  <th className="px-3 py-2.5 text-right text-emerald-500/80 bg-emerald-950/40 min-w-[90px]">Trend</th>
                  <th className="px-3 py-2.5 text-right text-emerald-500/80 bg-emerald-950/40">IV</th>
                  <th className="px-3 py-2.5 text-right text-emerald-500/80 bg-emerald-950/40 min-w-[110px]">OI Chg</th>
                  <th className="px-3 py-2.5 text-right text-emerald-500/80 bg-emerald-950/40">OI</th>
                  <th className="px-3 py-2.5 text-right text-emerald-500/80 bg-emerald-950/40 border-r border-slate-700">LTP</th>
                  <th className="px-3 py-2.5 text-center bg-slate-800 border-x border-slate-600/80 text-slate-300 text-sm">Price</th>
                  <th className="px-3 py-2.5 text-left text-rose-500/80 bg-rose-950/40 border-l border-slate-700">LTP</th>
                  <th className="px-3 py-2.5 text-left text-rose-500/80 bg-rose-950/40">OI</th>
                  <th className="px-3 py-2.5 text-left text-rose-500/80 bg-rose-950/40 min-w-[110px]">OI Chg</th>
                  <th className="px-3 py-2.5 text-left text-rose-500/80 bg-rose-950/40">IV</th>
                  <th className="px-3 py-2.5 text-left text-rose-500/80 bg-rose-950/40 min-w-[90px]">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {strikes.map(s => (
                  <StrikeRow
                    key={s.strikePrice}
                    s={s} atm={atm} maxPain={maxPain} spot={spot}
                    maxCeChg={maxCeChg} maxPeChg={maxPeChg}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="bg-slate-900/90 border-t border-slate-700 px-5 py-3 flex flex-wrap items-center gap-5 text-xs text-slate-500">
            {[
              { bg: 'bg-amber-900/50 border border-amber-600/40', label: 'ATM Strike' },
              { bg: 'bg-violet-900/50 border border-violet-600/40', label: 'Max Pain' },
              { bg: 'bg-emerald-950/60 border border-emerald-800/40', label: 'Bullish (CE OI ↓ / PE OI ↑)' },
              { bg: 'bg-rose-950/60 border border-rose-800/40', label: 'Bearish (CE OI ↑ / PE OI ↓)' },
            ].map(({ bg, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`w-3.5 h-3.5 rounded ${bg} inline-block`} />
                {label}
              </span>
            ))}
            <span className="text-slate-600">· Faded columns = ITM side</span>
          </div>
        </div>
      )}

      {/* ── Stats tables ── */}
      {stats && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <NetTable
            title="Totals"
            accent="text-slate-300"
            rows={[
              { label: 'Total OI',      ce: stats.ceOI,    pe: stats.peOI,    net: stats.peOI - stats.ceOI },
              { label: 'OI Change',     ce: stats.ceOIChg, pe: stats.peOIChg, net: stats.peOIChg + stats.ceOIChg, chg: true },
              { label: 'Volume',        ce: stats.ceVol,   pe: stats.peVol,   net: stats.peVol - stats.ceVol },
              { label: 'Writing OI',    ce: stats.ceBearOI, pe: stats.peBullOI, net: stats.peBullOI - stats.ceBearOI },
              { label: 'Writing Chg',   ce: stats.ceBearChg, pe: stats.peBullChg, net: stats.peBullChg + stats.ceBearChg, chg: true },
              { label: 'Buying OI',     ce: stats.ceBullOI, pe: stats.peBearOI, net: stats.ceBullOI - stats.peBearOI },
            ]}
          />

          <ValTable
            title="Key Ratios"
            accent="text-sky-400"
            rows={[
              { label: 'PCR OI',        value: pcr.toFixed(2), color: pcrColor },
              { label: 'PCR Volume',    value: pcrVol.toFixed(2), color: 'text-sky-300' },
              { label: 'Signal',        value: pcrLabel, color: pcrColor },
              { label: 'Max Pain',      value: maxPain.toLocaleString('en-IN'), color: 'text-violet-300' },
              { label: 'ATM IV',        value: atmIV > 0 ? `${atmIV.toFixed(1)}%` : '—', color: 'text-orange-300' },
              { label: 'CE Premium Σ',  value: fmt(stats.cePrem), color: 'text-emerald-300' },
              { label: 'PE Premium Σ',  value: fmt(stats.pePrem), color: 'text-rose-300' },
              { label: 'PE−CE OI Chg',  value: fmtChg(stats.peOIChg - stats.ceOIChg), color: stats.peOIChg > stats.ceOIChg ? 'text-emerald-400' : 'text-rose-400' },
              { label: 'Bullish OI',    value: fmtOI(stats.peBullOI + stats.ceBullOI), color: 'text-emerald-400' },
              { label: 'Bearish OI',    value: fmtOI(stats.ceBearOI + stats.peBearOI), color: 'text-rose-400' },
            ]}
          />

          <NetTable
            title="OTM Analysis"
            accent="text-amber-400"
            rows={[
              { label: 'OTM OI',       ce: stats.otmCeOI,  pe: stats.otmPeOI,  net: stats.otmPeOI - stats.otmCeOI },
              { label: 'OTM OI Chg',   ce: stats.otmCeChg, pe: stats.otmPeChg, net: stats.otmPeChg + stats.otmCeChg, chg: true },
              { label: 'OTM Volume',   ce: stats.otmCeVol, pe: stats.otmPeVol, net: stats.otmPeVol - stats.otmCeVol },
              {
                label: 'PCR OTM OI',
                ce: stats.otmCeOI > 0 ? +(stats.otmPeOI / stats.otmCeOI).toFixed(2).toString() : '—',
                pe: '—', net: undefined,
              },
            ]}
          />

          <NetTable
            title="ITM Analysis"
            accent="text-cyan-400"
            rows={[
              { label: 'ITM OI',       ce: stats.itmCeOI,  pe: stats.itmPeOI,  net: stats.itmPeOI - stats.itmCeOI },
              { label: 'ITM OI Chg',   ce: stats.itmCeChg, pe: stats.itmPeChg, net: stats.itmPeChg + stats.itmCeChg, chg: true },
              { label: 'ITM Volume',   ce: stats.itmCeVol, pe: stats.itmPeVol, net: stats.itmPeVol - stats.itmCeVol },
              {
                label: 'PCR ITM OI',
                ce: stats.itmCeOI > 0 ? +(stats.itmPeOI / stats.itmCeOI).toFixed(2).toString() : '—',
                pe: '—', net: undefined,
              },
            ]}
          />
        </div>
      )}

      {!loading && !data && !error && (
        <div className="text-center py-24 text-slate-500">
          <p className="text-lg font-medium">Select a symbol and expiry above to load the option chain.</p>
        </div>
      )}
    </main>
  );
}
