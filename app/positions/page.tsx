'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import {
  loadPositions, savePositions, addPosition, removePosition, calcPositionPnL, calcPortfolioSummary,
  getLotSize, LOT_SIZES,
  type Position, type PositionPnL,
} from '@/lib/position-store';
import type { OptionType, Action } from '@/lib/strategy-utils';
import type { OptionChainData } from '@/lib/dhan-api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Add position form ─────────────────────────────────────────────────────────

interface AddFormProps {
  onAdd: (p: Omit<Position, 'id' | 'addedAt' | 'currentLTP'>) => void;
}

function AddPositionForm({ onAdd }: AddFormProps) {
  const [symbol,  setSymbol]  = useState('NIFTY');
  const [expiry,  setExpiry]  = useState('');
  const [strike,  setStrike]  = useState(0);
  const [optType, setOptType] = useState<OptionType>('CE');
  const [action,  setAction]  = useState<Action>('BUY');
  const [lots,    setLots]    = useState(1);
  const [premium, setPremium] = useState(0);

  const lotSize = getLotSize(symbol);

  function submit() {
    if (!expiry || strike <= 0 || premium <= 0) return;
    onAdd({ symbol, expiry, strike, optionType: optType, action, lots, lotSize, entryPremium: premium });
    setPremium(0);
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-4">
      <p className="text-sm font-semibold text-slate-300">Add Position</p>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Symbol</label>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500">
            {Object.keys(LOT_SIZES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Expiry (YYYY-MM-DD)</label>
          <input type="text" value={expiry} onChange={e => setExpiry(e.target.value)}
            placeholder="e.g. 2025-05-29"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Strike</label>
          <input type="number" value={strike || ''} onChange={e => setStrike(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Type</label>
          <select value={optType} onChange={e => setOptType(e.target.value as OptionType)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none">
            <option value="CE">CE (Call)</option>
            <option value="PE">PE (Put)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Action</label>
          <select value={action} onChange={e => setAction(e.target.value as Action)}
            className={`w-full bg-slate-800 border rounded px-2 py-1.5 text-sm font-bold focus:outline-none ${action === 'BUY' ? 'border-emerald-700 text-emerald-300' : 'border-red-700 text-red-300'}`}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Lots (×{lotSize})</label>
          <input type="number" min="1" value={lots} onChange={e => setLots(Math.max(1, Number(e.target.value)))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none font-mono" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Entry Premium</label>
          <input type="number" step="0.05" value={premium || ''} onChange={e => setPremium(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none font-mono" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={submit} disabled={!expiry || strike <= 0 || premium <= 0}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded text-sm transition-colors">
          Add Position
        </button>
        <span className="text-xs text-slate-500">
          Cost: Rs.{fmt(premium * lots * lotSize, 0)}
        </span>
      </div>
    </div>
  );
}

// ── P&L row ───────────────────────────────────────────────────────────────────

function PositionRow({
  p, onRemove, onUpdateLTP,
}: {
  p: PositionPnL;
  onRemove: (id: string) => void;
  onUpdateLTP: (id: string, ltp: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [ltpInput, setLtpInput] = useState(p.currentLTP.toString());
  const isProfit = p.totalPnL > 0;

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
      <td className="px-3 py-2.5">
        <div className="font-mono font-bold text-white text-sm">{p.symbol}</div>
        <div className="text-[10px] text-slate-500">{p.expiry}</div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.optionType === 'CE' ? 'bg-emerald-800 text-white' : 'bg-red-800 text-white'}`}>
          {p.strike.toLocaleString('en-IN')} {p.optionType}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${p.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
          {p.action}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center text-slate-300 text-xs tabular-nums">
        {p.lots} × {p.lotSize}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-slate-300 text-xs tabular-nums">
        {fmt(p.entryPremium)}
      </td>
      <td className="px-3 py-2.5 text-right">
        {editing ? (
          <div className="flex items-center gap-1 justify-end">
            <input
              value={ltpInput}
              onChange={e => setLtpInput(e.target.value)}
              className="bg-slate-800 border border-emerald-700 rounded px-1.5 py-0.5 text-xs text-slate-200 font-mono w-20 focus:outline-none"
              autoFocus
            />
            <button onClick={() => { onUpdateLTP(p.id, Number(ltpInput)); setEditing(false); }}
              className="text-emerald-400 text-xs hover:text-emerald-300">✓</button>
            <button onClick={() => setEditing(false)} className="text-slate-500 text-xs hover:text-slate-300">✕</button>
          </div>
        ) : (
          <button onClick={() => { setLtpInput(p.currentLTP.toString()); setEditing(true); }}
            className="font-mono text-xs text-sky-400 hover:text-sky-300 tabular-nums cursor-pointer">
            {fmt(p.currentLTP)} ✎
          </button>
        )}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums font-semibold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
        {isProfit ? '+' : ''}Rs.{fmt(p.totalPnL, 0)}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
        {isProfit ? '+' : ''}{p.pnlPct}%
      </td>
      <td className="px-3 py-2.5 text-right text-slate-500 text-xs tabular-nums">
        Rs.{fmt(Math.abs(p.investment), 0)}
      </td>
      <td className="px-3 py-2.5 text-center">
        <button onClick={() => onRemove(p.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const creds = useDhanCredentials();
  const [positions,  setPositions]  = useState<Position[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    setPositions(loadPositions());
  }, []);

  function handleAdd(p: Omit<Position, 'id' | 'addedAt' | 'currentLTP'>) {
    const newPos = addPosition(p);
    setPositions(loadPositions());
    return newPos;
  }

  function handleRemove(id: string) {
    removePosition(id);
    setPositions(loadPositions());
  }

  function handleUpdateLTP(id: string, ltp: number) {
    const all = loadPositions();
    savePositions(all.map(p => p.id === id ? { ...p, currentLTP: ltp } : p));
    setPositions(loadPositions());
  }

  const refreshLTPs = useCallback(async () => {
    if (!creds.isConfigured || positions.length === 0) return;
    setRefreshing(true);
    try {
      const bySymbolExpiry: Record<string, { symbol: string; expiry: string; ids: string[] }> = {};
      for (const p of positions) {
        const key = `${p.symbol}::${p.expiry}`;
        if (!bySymbolExpiry[key]) bySymbolExpiry[key] = { symbol: p.symbol, expiry: p.expiry, ids: [] };
        bySymbolExpiry[key].ids.push(p.id);
      }

      const updates: Record<string, number> = {};

      await Promise.all(
        Object.values(bySymbolExpiry).map(async ({ symbol, expiry }) => {
          try {
            const res  = await fetch(`/api/dhan/option-chain?symbol=${symbol}&expiry=${expiry}`, { headers: creds.headers });
            const json = await res.json() as OptionChainData;
            if (!json.strikes) return;
            for (const p of positions.filter(px => px.symbol === symbol && px.expiry === expiry)) {
              const found = json.strikes.find(s => s.strikePrice === p.strike);
              if (found) {
                updates[p.id] = p.optionType === 'CE' ? found.ce.ltp : found.pe.ltp;
              }
            }
          } catch { /* ignore individual failures */ }
        }),
      );

      const all = loadPositions();
      savePositions(all.map(p => updates[p.id] !== undefined ? { ...p, currentLTP: updates[p.id] } : p));
      setPositions(loadPositions());
      setLastUpdated(new Date().toLocaleTimeString('en-IN'));
    } finally {
      setRefreshing(false);
    }
  }, [creds, positions]);

  const withPnL  = positions.map(calcPositionPnL);
  const summary  = calcPortfolioSummary(withPnL);
  const totalPnL = summary.totalPnL;

  return (
    <main className="w-full px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Position Tracker</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Track options P&amp;L — LTP updated from Dhan option chain
            {lastUpdated && <> &nbsp;·&nbsp; Updated {lastUpdated}</>}
          </p>
        </div>
        <button
          onClick={refreshLTPs}
          disabled={refreshing || !creds.isConfigured}
          title={!creds.isConfigured ? 'Configure Dhan credentials in Settings' : 'Refresh LTPs from Dhan'}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded text-sm transition-colors"
        >
          {refreshing ? 'Refreshing…' : 'Refresh LTPs'}
        </button>
      </div>

      {!creds.isConfigured && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded px-3 py-2 text-amber-300 text-sm">
          LTP auto-refresh requires Dhan credentials.{' '}
          <a href="/settings" className="underline hover:text-amber-200">Configure in Settings</a>
          {' '}— you can still track positions manually by editing LTP values.
        </div>
      )}

      {/* Portfolio summary */}
      {withPnL.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Open Positions', value: positions.length.toString(), color: 'text-slate-200' },
            { label: 'Total Invested', value: `Rs.${fmt(summary.totalInvested, 0)}`, color: 'text-slate-200' },
            { label: 'Net P&L',        value: `${totalPnL >= 0 ? '+' : ''}Rs.${fmt(Math.abs(totalPnL), 0)}`, color: totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Net P&L%',       value: `${summary.netPnLPct >= 0 ? '+' : ''}${summary.netPnLPct}%`, color: summary.netPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center">
              <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <AddPositionForm onAdd={handleAdd} />

      {/* Positions table */}
      {withPnL.length === 0 ? (
        <div className="text-center py-16 text-slate-500 bg-slate-900/40 border border-slate-800 rounded-xl">
          <p className="text-base text-slate-400">No positions yet.</p>
          <p className="text-sm mt-1">Add your first position using the form above.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-900 border-b border-slate-700 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-center">Strike / Type</th>
                  <th className="px-3 py-2 text-center">Action</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">Entry</th>
                  <th className="px-3 py-2 text-right">LTP (click to edit)</th>
                  <th className="px-3 py-2 text-right">P&amp;L</th>
                  <th className="px-3 py-2 text-right">P&amp;L%</th>
                  <th className="px-3 py-2 text-right">Investment</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {withPnL.map(p => (
                  <PositionRow
                    key={p.id}
                    p={p}
                    onRemove={handleRemove}
                    onUpdateLTP={handleUpdateLTP}
                  />
                ))}
                {/* Summary row */}
                <tr className="bg-slate-800/60 border-t-2 border-slate-600 text-sm font-semibold">
                  <td colSpan={6} className="px-3 py-2 text-slate-400">Portfolio Total</td>
                  <td className={`px-3 py-2 text-right font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalPnL >= 0 ? '+' : ''}Rs.{fmt(Math.abs(totalPnL), 0)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${summary.netPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {summary.netPnLPct >= 0 ? '+' : ''}{summary.netPnLPct}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    Rs.{fmt(summary.totalInvested, 0)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600">
        Positions stored in browser localStorage — they persist across sessions but are device-specific.
        P&amp;L is based on option premium difference, not underlying price movement.
      </p>
    </main>
  );
}
