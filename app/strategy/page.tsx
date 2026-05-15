'use client';
import { useState, useMemo } from 'react';
import {
  buildLegs, generatePayoffTable, calcMetrics, calcNetPremium,
  type StrategyLeg, type StrategyName,
} from '@/lib/strategy-utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const STRATEGIES: StrategyName[] = [
  'Long Call', 'Long Put',
  'Bull Call Spread', 'Bear Put Spread', 'Bull Put Spread', 'Bear Call Spread',
  'Long Straddle', 'Long Strangle',
  'Iron Condor', 'Long Butterfly',
  'Covered Call', 'Protective Put',
];

const LOT_SIZES: Record<string, number> = {
  NIFTY: 50, BANKNIFTY: 30, FINNIFTY: 40, MIDCPNIFTY: 75,
  RELIANCE: 250, TCS: 150, INFY: 300, HDFCBANK: 550,
  ICICIBANK: 1375, SBIN: 1500, AXISBANK: 1200,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Leg editor row ────────────────────────────────────────────────────────────

function LegRow({
  leg, idx, onChange, onRemove,
}: {
  leg: StrategyLeg;
  idx: number;
  onChange: (id: number, field: keyof StrategyLeg, val: unknown) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <tr className="border-b border-slate-800">
      <td className="px-3 py-2 text-slate-500 text-xs">{idx + 1}</td>
      <td className="px-2 py-2">
        <select value={leg.action} onChange={e => onChange(leg.id, 'action', e.target.value)}
          className={`bg-slate-800 border rounded px-2 py-1.5 text-sm font-bold focus:outline-none ${leg.action === 'BUY' ? 'border-emerald-700 text-emerald-300' : 'border-red-700 text-red-300'}`}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <select value={leg.optionType} onChange={e => onChange(leg.id, 'optionType', e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none">
          <option value="CE">CE (Call)</option>
          <option value="PE">PE (Put)</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <input type="number" value={leg.strike} onChange={e => onChange(leg.id, 'strike', Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none w-24 font-mono" />
      </td>
      <td className="px-2 py-2">
        <input type="number" step="0.05" value={leg.premium} onChange={e => onChange(leg.id, 'premium', Number(e.target.value))}
          placeholder="0"
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none w-20 font-mono" />
      </td>
      <td className="px-2 py-2">
        <input type="number" min="1" value={leg.lots} onChange={e => onChange(leg.id, 'lots', Math.max(1, Number(e.target.value)))}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none w-14 font-mono" />
      </td>
      <td className="px-2 py-2 text-slate-400 text-sm tabular-nums font-mono">
        {fmt(leg.premium * leg.lots * leg.lotSize)}
      </td>
      <td className="px-2 py-2">
        <button onClick={() => onRemove(leg.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const [symbol,   setSymbol]   = useState('NIFTY');
  const [spot,     setSpot]     = useState(24500);
  const [strategy, setStrategy] = useState<StrategyName>('Long Call');
  const [legs,     setLegs]     = useState<StrategyLeg[]>([]);
  const [nextId,   setNextId]   = useState(100);

  const lotSize = LOT_SIZES[symbol] ?? 50;

  function applyStrategy(s: StrategyName) {
    setStrategy(s);
    setLegs(buildLegs(s, spot, lotSize));
  }

  function updateLeg(id: number, field: keyof StrategyLeg, val: unknown) {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
  }

  function removeLeg(id: number) {
    setLegs(prev => prev.filter(l => l.id !== id));
  }

  function addLeg() {
    const atm = Math.round(spot / 50) * 50;
    setLegs(prev => [...prev, { id: nextId, action: 'BUY', optionType: 'CE', strike: atm, premium: 0, lots: 1, lotSize }]);
    setNextId(n => n + 1);
  }

  const payoff  = useMemo(() => legs.length > 0 ? generatePayoffTable(legs, spot) : [], [legs, spot]);
  const metrics = useMemo(() => legs.length > 0 ? calcMetrics(legs, spot) : null, [legs, spot]);
  const netPrem = useMemo(() => calcNetPremium(legs), [legs]);

  return (
    <main className="w-full px-4 py-5 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Strategy Builder</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Build multi-leg options strategies and visualize payoff at expiry
        </p>
      </div>

      {/* Setup panel */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-4">
        {/* Row 1: symbol + spot + lot size */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Symbol</label>
            <select value={symbol} onChange={e => setSymbol(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500">
              {Object.keys(LOT_SIZES).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Spot Price</label>
            <input type="number" value={spot} onChange={e => setSpot(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Lot Size</label>
            <div className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-300">{lotSize}</div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Net Premium Flow</label>
            <div className={`bg-slate-800 border rounded px-3 py-2 text-sm font-mono font-bold ${netPrem >= 0 ? 'border-emerald-700 text-emerald-400' : 'border-red-700 text-red-400'}`}>
              {netPrem >= 0 ? '+' : ''}Rs.{fmt(netPrem)}
              <span className="text-xs font-normal text-slate-500 ml-1">{netPrem >= 0 ? 'credit' : 'debit'}</span>
            </div>
          </div>
        </div>

        {/* Row 2: strategy template picker */}
        <div>
          <label className="text-xs text-slate-400 block mb-2">Strategy Template</label>
          <div className="flex flex-wrap gap-2">
            {STRATEGIES.map(s => (
              <button key={s} onClick={() => applyStrategy(s)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${strategy === s && legs.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leg editor */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Strategy Legs</p>
          <button onClick={addLeg} className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold">+ Add Leg</button>
        </div>
        {legs.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            Select a strategy template above or click Add Leg.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="bg-slate-800 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left">Action</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Strike</th>
                  <th className="px-2 py-2 text-left">Premium</th>
                  <th className="px-2 py-2 text-left">Lots</th>
                  <th className="px-2 py-2 text-left">Cost/Recv</th>
                  <th className="px-2 py-2 w-6" />
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, i) => (
                  <LegRow key={leg.id} leg={leg} idx={i} onChange={updateLeg} onRemove={removeLeg} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Metrics + Payoff */}
      {metrics && legs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Metrics */}
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-300">Strategy Metrics</p>
            {[
              { label: 'Max Profit',  value: typeof metrics.maxProfit === 'number' ? `Rs.${fmt(metrics.maxProfit)}` : '∞ Unlimited', color: typeof metrics.maxProfit === 'number' && metrics.maxProfit > 0 ? 'text-emerald-400' : 'text-slate-300' },
              { label: 'Max Loss',    value: typeof metrics.maxLoss   === 'number' ? `Rs.${fmt(metrics.maxLoss)}`   : '∞ Unlimited', color: typeof metrics.maxLoss   === 'number' && metrics.maxLoss   < 0 ? 'text-red-400'     : 'text-slate-300' },
              { label: 'Net Premium', value: `Rs.${fmt(metrics.netPremium)}`,  color: metrics.netPremium >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'R:R Ratio',  value: metrics.rrRatio, color: 'text-sky-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-baseline border-b border-slate-800 pb-1.5">
                <span className="text-slate-400 text-sm">{label}</span>
                <span className={`font-mono font-semibold text-sm ${color}`}>{value}</span>
              </div>
            ))}

            <div>
              <p className="text-xs text-slate-500 mb-1">Breakeven(s)</p>
              {metrics.breakevens.length > 0
                ? metrics.breakevens.map(be => (
                    <span key={be} className="inline-block mr-2 px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 text-xs font-mono border border-amber-800">
                      {be.toLocaleString('en-IN')}
                    </span>
                  ))
                : <span className="text-slate-600 text-xs">—</span>
              }
            </div>
          </div>

          {/* Payoff table */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-700">
              <p className="text-sm font-semibold text-slate-300">Payoff at Expiry</p>
            </div>
            <div className="overflow-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-500 uppercase text-[10px] tracking-wide">Underlying Price</th>
                    <th className="px-3 py-2 text-right text-slate-500 uppercase text-[10px] tracking-wide">P&amp;L (Rs.)</th>
                    <th className="px-3 py-2 text-right text-slate-500 uppercase text-[10px] tracking-wide">P&amp;L %</th>
                    <th className="px-3 py-2 text-left text-slate-500 uppercase text-[10px] tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {payoff.map(row => {
                    const isSpot = Math.abs(row.price - spot) < 50;
                    return (
                      <tr key={row.price} className={`${isSpot ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'} transition-colors`}>
                        <td className={`px-3 py-1.5 font-mono font-semibold tabular-nums ${isSpot ? 'text-sky-400' : 'text-slate-200'}`}>
                          {row.price.toLocaleString('en-IN')}
                          {isSpot && <span className="ml-1 text-[9px] text-sky-600">SPOT</span>}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-semibold ${row.pnl > 0 ? 'text-emerald-400' : row.pnl < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {row.pnl > 0 ? '+' : ''}{fmt(row.pnl, 0)}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${row.pnlPct > 0 ? 'text-emerald-400' : row.pnlPct < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {row.pnlPct > 0 ? '+' : ''}{row.pnlPct}%
                        </td>
                        <td className="px-3 py-1.5">
                          {row.status === 'profit'    && <span className="text-emerald-400 text-[10px] font-semibold">PROFIT</span>}
                          {row.status === 'loss'      && <span className="text-red-400 text-[10px] font-semibold">LOSS</span>}
                          {row.status === 'breakeven' && <span className="text-amber-400 text-[10px] font-semibold">BE</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-slate-600 bg-slate-900/50 border border-slate-800 rounded p-3">
        Payoff computed at expiry using intrinsic values only. Does not account for time value, theta decay, IV changes, or transaction costs.
        Always verify premiums from the live option chain before trading.
      </div>
    </main>
  );
}
