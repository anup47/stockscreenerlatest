'use client';
import { useState, useEffect, useCallback } from 'react';
import type { OptionsResult, ScoreBreakdown, BacktestStats } from '@/lib/options-screener';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  results: OptionsResult[];
  stats: {
    bullishCount: number;
    bearishCount: number;
    strongCount: number;
    watchlistCount: number;
    totalScanned: number;
  };
  timestamp: string;
  elapsedMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Badge components ──────────────────────────────────────────────────────────

function DirectionBadge({ d }: { d: 'CALL' | 'PUT' }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-wide ${
      d === 'CALL' ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'
    }`}>{d === 'CALL' ? 'CALL' : 'PUT'}</span>
  );
}

function ConfidenceBadge({ c }: { c: OptionsResult['confidence'] }) {
  const cls = c === 'Strong' ? 'bg-emerald-900 text-emerald-300 border border-emerald-700'
    : c === 'Moderate' ? 'bg-amber-900 text-amber-300 border border-amber-700'
    : 'bg-slate-800 text-slate-400 border border-slate-600';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{c}</span>;
}

function EntryBadge({ e }: { e: OptionsResult['entryQuality'] }) {
  const cls = e === 'Triggered' ? 'text-emerald-400'
    : e === 'Early'    ? 'text-sky-400'
    : 'text-amber-400';
  return <span className={`text-xs font-semibold ${cls}`}>{e}</span>;
}

function ScoreBar({ score, dir }: { score: number; dir: 'CALL' | 'PUT' }) {
  const color = dir === 'CALL' ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-xs font-semibold">{score}</span>
    </div>
  );
}

// ── Score breakdown row ───────────────────────────────────────────────────────

function BreakdownBar({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  const pct = (score / max) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-slate-300 w-12 text-right">{score}/{max}</span>
    </div>
  );
}

function ScoreBreakdownPanel({ bd, dir }: { bd: ScoreBreakdown; dir: 'CALL' | 'PUT' }) {
  const color = dir === 'CALL' ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div className="space-y-1.5">
      <BreakdownBar label="Trend"      score={bd.trend}      max={25} color={color} />
      <BreakdownBar label="Momentum"   score={bd.momentum}   max={20} color={color} />
      <BreakdownBar label="Volume"     score={bd.volume}     max={20} color={color} />
      <BreakdownBar label="Volatility" score={bd.volatility} max={15} color={color} />
      <BreakdownBar label="Setup"      score={bd.setup}      max={20} color={color} />
    </div>
  );
}

// ── Backtest components ───────────────────────────────────────────────────────

function WinRateBadge({ bt }: { bt: BacktestStats }) {
  if (bt.sampleSize === 0) return <span className="text-xs text-slate-600">—</span>;
  const color = bt.winRate3d >= 60 ? 'text-emerald-400'
    : bt.winRate3d >= 50 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="text-right leading-tight">
      <span className={`text-xs font-mono font-semibold ${color}`}>{bt.winRate3d}%</span>
      <span className="text-xs text-slate-600 block">n={bt.sampleSize}</span>
    </div>
  );
}

function BtConfBadge({ c }: { c: BacktestStats['btConfidence'] }) {
  const cls = c === 'High'     ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700'
    : c === 'Moderate' ? 'bg-amber-900/60 text-amber-400 border border-amber-700'
    : 'bg-slate-800 text-slate-500 border border-slate-600';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{c} confidence</span>;
}

function BacktestPanel({ bt, dir }: { bt: BacktestStats; dir: 'CALL' | 'PUT' }) {
  if (bt.sampleSize === 0) {
    return (
      <div>
        <p className="text-slate-500 uppercase text-xs mb-2 tracking-wide">Historical Backtest</p>
        <p className="text-xs text-slate-600">No matching historical signals in last 6 months.</p>
      </div>
    );
  }
  const isCall  = dir === 'CALL';
  const wr3Color = bt.winRate3d >= 60 ? 'text-emerald-400' : bt.winRate3d >= 50 ? 'text-amber-400' : 'text-red-400';
  const wr1Color = bt.winRate1d >= 60 ? 'text-emerald-400' : bt.winRate1d >= 50 ? 'text-amber-400' : 'text-red-400';
  const retColor = (isCall ? bt.avgReturn3d > 0 : bt.avgReturn3d < 0) ? 'text-emerald-400' : 'text-red-400';
  const pfColor  = bt.profitFactor >= 1.5 ? 'text-emerald-400' : bt.profitFactor >= 1 ? 'text-amber-400' : 'text-red-400';
  const sign = (n: number) => n > 0 ? `+${n}%` : `${n}%`;

  const stats: [string, string, string][] = [
    ['Win Rate (3-day)',    `${bt.winRate3d}%`,            wr3Color],
    ['Win Rate (1-day)',    `${bt.winRate1d}%`,            wr1Color],
    ['Avg 3d Return',      sign(bt.avgReturn3d),           retColor],
    ['Avg 1d Return',      sign(bt.avgReturn1d),           retColor],
    ['Avg Winning Trade',  sign(bt.avgWin),                'text-emerald-400'],
    ['Avg Losing Trade',   sign(bt.avgLoss),               'text-red-400'],
    ['Profit Factor',      `${bt.profitFactor === 99 ? '∞' : bt.profitFactor}x`, pfColor],
    ['Best Outcome',       sign(bt.bestOutcome),           'text-emerald-400'],
    ['Worst Outcome',      sign(bt.worstOutcome),          'text-red-400'],
    ['Sample Size',        `${bt.sampleSize} signals`,     'text-slate-300'],
    ['Freq / Month',       `${bt.signalFreqPerMonth}×`,    'text-slate-400'],
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-500 uppercase text-xs tracking-wide">Historical Backtest — 6 Months</p>
        <BtConfBadge c={bt.btConfidence} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {stats.map(([label, val, cls]) => (
          <div key={label} className="flex justify-between text-xs border-b border-slate-700/60 pb-0.5">
            <span className="text-slate-500">{label}</span>
            <span className={`font-mono ${cls}`}>{val}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600 mt-2 leading-relaxed">
        Tracks underlying price direction over 3 sessions, not option P&L.
        Past signal frequency does not guarantee future occurrence.
      </p>
    </div>
  );
}

// ── Expanded detail drawer ────────────────────────────────────────────────────

function DetailDrawer({ r }: { r: OptionsResult }) {
  const isCall = r.direction === 'CALL';
  return (
    <tr>
      <td colSpan={13} className="bg-slate-800/60 border-b border-slate-700">
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          {/* Score breakdown */}
          <div>
            <p className="text-slate-500 uppercase text-xs mb-2 tracking-wide">Score Breakdown (100 pts)</p>
            <ScoreBreakdownPanel bd={r.scoreBreakdown} dir={r.direction} />
            <div className="mt-2 flex gap-3 text-xs text-slate-500">
              <span>Bullish: <span className="text-emerald-400 font-mono">{r.bullishScore}</span></span>
              <span>Bearish: <span className="text-red-400 font-mono">{r.bearishScore}</span></span>
              <span>Spread: <span className="text-slate-300 font-mono">{r.directionalSpread}</span></span>
            </div>
          </div>

          {/* Reasons + risks */}
          <div className="space-y-3">
            <div>
              <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">
                {isCall ? 'Bullish Signals' : 'Bearish Signals'}
              </p>
              <ul className="space-y-0.5">
                {r.reasons.map((reason, i) => (
                  <li key={i} className={`text-xs flex gap-1.5 ${isCall ? 'text-emerald-300' : 'text-red-300'}`}>
                    <span className="shrink-0 mt-0.5">{isCall ? '▲' : '▼'}</span>{reason}
                  </li>
                ))}
              </ul>
            </div>
            {r.riskFlags.length > 0 && (
              <div>
                <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Risk Flags</p>
                <ul className="space-y-0.5">
                  {r.riskFlags.map((flag, i) => (
                    <li key={i} className="text-xs text-amber-400 flex gap-1.5">
                      <span className="shrink-0">⚠</span>{flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Trade details */}
          <div className="space-y-2">
            <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Trade Details</p>
            {[
              ['Option Side',     r.optionSide,       isCall ? 'text-emerald-400' : 'text-red-400'],
              ['Holding Bias',    r.holdingBias,       'text-slate-200'],
              ['Entry Quality',   r.entryQuality,     r.entryQuality === 'Triggered' ? 'text-emerald-400' : r.entryQuality === 'Early' ? 'text-sky-400' : 'text-amber-400'],
              ['Trend Status',    r.trendStatus,       'text-slate-200'],
              ['vs EMA 20',       `${r.priceVsEma20Pct > 0 ? '+' : ''}${r.priceVsEma20Pct}%`, r.priceVsEma20Pct > 0 ? 'text-emerald-400' : 'text-red-400'],
              ['vs EMA 50',       `${r.priceVsEma50Pct > 0 ? '+' : ''}${r.priceVsEma50Pct}%`, r.priceVsEma50Pct > 0 ? 'text-emerald-400' : 'text-red-400'],
            ].map(([label, val, cls]) => (
              <div key={label} className="flex justify-between text-xs border-b border-slate-700 pb-1">
                <span className="text-slate-400">{label}</span>
                <span className={`font-mono ${cls}`}>{val}</span>
              </div>
            ))}
            <div className="mt-2 text-xs text-slate-500 bg-slate-800 rounded p-2">
              <p className="font-semibold text-amber-400 mb-1">Before buying options, verify:</p>
              <p>• IV rank — avoid buying when IV is already elevated</p>
              <p>• Spread/slippage in option chain</p>
              <p>• Nearest expiry liquidity</p>
              <p>• Stop-loss on premium (not just price)</p>
            </div>
          </div>

          {/* Backtest panel */}
          <BacktestPanel bt={r.backtest} dir={r.direction} />
        </div>
      </td>
    </tr>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OptionsPage() {
  const [data,      setData]      = useState<ApiResponse | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [expandedRow, setExpanded] = useState<string | null>(null);

  // Filters
  const [filterDir,   setFilterDir]   = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  const [filterConf,  setFilterConf]  = useState<'ALL' | 'Strong' | 'Moderate' | 'Watchlist'>('ALL');
  const [filterSetup, setFilterSetup] = useState('ALL');
  const [filterHold,  setFilterHold]  = useState('ALL');
  const [minScore,    setMinScore]    = useState(58);
  const [sortCol,     setSortCol]     = useState<'score' | 'volRatio' | 'atrPct' | 'rsi'>('score');

  const runScan = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res  = await fetch('/api/options-screen');
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Scan failed'); return; }
      setData(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  // Auto-scan on mount
  useEffect(() => { runScan(); }, [runScan]);

  const setupTypes = data
    ? ['ALL', ...new Set(data.results.map(r => r.setupType))]
    : ['ALL'];

  const filtered = (data?.results ?? [])
    .filter(r => filterDir  === 'ALL' || r.direction  === filterDir)
    .filter(r => filterConf === 'ALL' || r.confidence === filterConf)
    .filter(r => filterSetup === 'ALL' || r.setupType === filterSetup)
    .filter(r => filterHold  === 'ALL' || r.holdingBias === filterHold)
    .filter(r => r.score >= minScore)
    .sort((a, b) => {
      if (sortCol === 'score')    return b.score    - a.score;
      if (sortCol === 'volRatio') return b.volRatio - a.volRatio;
      if (sortCol === 'atrPct')   return b.atrPct   - a.atrPct;
      if (sortCol === 'rsi')      return (a.direction === 'CALL' ? b.rsi - a.rsi : a.rsi - b.rsi);
      return 0;
    });

  const SortHdr = ({ col, label }: { col: typeof sortCol; label: string }) => (
    <th
      className={`text-right pr-3 py-2 cursor-pointer select-none hover:text-slate-200 transition-colors ${sortCol === col ? 'text-emerald-400' : 'text-slate-500'}`}
      onClick={() => setSortCol(col)}
    >{label}{sortCol === col ? ' ↓' : ''}</th>
  );

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Directional Options Screener</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            High-probability CALL / PUT candidates for 1–3 session directional trades &mdash; F&O stocks only
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-5 py-2 rounded text-sm transition-colors shrink-0"
        >
          {loading ? 'Scanning...' : 'Refresh Scan'}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-950/40 border border-amber-800/50 rounded text-xs text-amber-300 px-3 py-2">
        This screener identifies directional setups, not guaranteed outcomes.
        Final trade decision must consider IV, option spread, lot size, and your risk management.
        Always check IV before buying — avoid options when IV rank is high.
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{error}</div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
          <div className="text-slate-400 text-sm">Scanning F&O universe...</div>
          <div className="text-slate-600 text-xs mt-1">Fetching 1y daily data, computing 7-factor scores</div>
          <div className="mt-4 w-48 mx-auto h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full animate-pulse w-1/2" />
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Bullish Calls"   value={data.stats.bullishCount}   color="text-emerald-400" />
            <StatCard label="Bearish Puts"    value={data.stats.bearishCount}   color="text-red-400" />
            <StatCard label="Strong Setups"   value={data.stats.strongCount}    color="text-amber-400" />
            <StatCard label="Watchlist"       value={data.stats.watchlistCount} color="text-slate-300" />
            <StatCard label="F&O Stocks Scanned" value={data.stats.totalScanned} color="text-slate-400" />
          </div>

          {/* Meta row */}
          <div className="text-xs text-slate-600 flex gap-3 flex-wrap">
            <span>Scanned at {new Date(data.timestamp).toLocaleTimeString('en-IN')}</span>
            <span>|</span>
            <span>{data.elapsedMs}ms</span>
            <span>|</span>
            <span>Showing {filtered.length} of {data.results.length} results</span>
          </div>

          {/* Filter bar */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Direction</label>
              <select value={filterDir} onChange={e => setFilterDir(e.target.value as typeof filterDir)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none">
                <option value="ALL">All</option>
                <option value="CALL">CALL only</option>
                <option value="PUT">PUT only</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Confidence</label>
              <select value={filterConf} onChange={e => setFilterConf(e.target.value as typeof filterConf)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none">
                <option value="ALL">All</option>
                <option value="Strong">Strong</option>
                <option value="Moderate">Moderate</option>
                <option value="Watchlist">Watchlist</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Setup Type</label>
              <select value={filterSetup} onChange={e => setFilterSetup(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none">
                {setupTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Holding Bias</label>
              <select value={filterHold} onChange={e => setFilterHold(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none">
                <option value="ALL">All</option>
                <option value="1-2 days">1–2 days</option>
                <option value="2-5 days">2–5 days</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Min Score</label>
              <div className="flex items-center gap-2">
                <input type="range" min={50} max={90} value={minScore}
                  onChange={e => setMinScore(Number(e.target.value))}
                  className="w-24 accent-emerald-500" />
                <span className="text-sm font-mono text-slate-200 w-6">{minScore}</span>
              </div>
            </div>
          </div>

          {/* Results table */}
          {filtered.length === 0 ? (
            <div className="text-center text-slate-500 py-10 text-sm">
              No results match current filters. Try lowering the min score or relaxing filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-slate-800 text-slate-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left pl-4 py-2">Symbol</th>
                    <th className="text-left py-2">Direction</th>
                    <th className="text-right pr-3 py-2 cursor-pointer" onClick={() => setSortCol('score')}>
                      Score{sortCol === 'score' ? ' ↓' : ''}
                    </th>
                    <th className="text-left py-2">Confidence</th>
                    <th className="text-left py-2">Setup</th>
                    <th className="text-right pr-3 py-2">Price</th>
                    <SortHdr col="volRatio" label="Vol Ratio" />
                    <SortHdr col="atrPct"   label="ATR%" />
                    <SortHdr col="rsi"      label="RSI" />
                    <th className="text-left py-2">Trend</th>
                    <th className="text-left py-2">Hold</th>
                    <th className="text-left py-2">Entry</th>
                    <th className="text-right pr-4 py-2">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isExpanded = expandedRow === r.symbol;
                    const isCall     = r.direction === 'CALL';
                    const rowHover   = isCall ? 'hover:bg-emerald-950/30' : 'hover:bg-red-950/30';
                    return (
                      <>
                        <tr
                          key={r.symbol}
                          onClick={() => setExpanded(isExpanded ? null : r.symbol)}
                          className={`border-b border-slate-800 cursor-pointer transition-colors ${rowHover} ${isExpanded ? (isCall ? 'bg-emerald-950/40' : 'bg-red-950/40') : ''}`}
                        >
                          <td className="pl-4 py-2.5">
                            <div className="font-semibold text-slate-100">{r.symbol}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[120px]">{r.company}</div>
                          </td>
                          <td className="py-2.5"><DirectionBadge d={r.direction} /></td>
                          <td className="text-right pr-3 py-2.5">
                            <ScoreBar score={r.score} dir={r.direction} />
                          </td>
                          <td className="py-2.5"><ConfidenceBadge c={r.confidence} /></td>
                          <td className="py-2.5 text-xs text-slate-300 max-w-[140px]">{r.setupType}</td>
                          <td className="text-right pr-3 py-2.5 font-mono text-slate-200">Rs.{fmt(r.price)}</td>
                          <td className={`text-right pr-3 py-2.5 font-mono ${r.volRatio >= 1.5 ? (isCall ? 'text-emerald-400' : 'text-red-400') : r.volRatio >= 1.2 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {r.volRatio}x
                          </td>
                          <td className={`text-right pr-3 py-2.5 font-mono ${r.atrPct >= 2 ? 'text-amber-400' : 'text-slate-300'}`}>
                            {r.atrPct}%
                          </td>
                          <td className={`text-right pr-3 py-2.5 font-mono ${r.rsi > 60 ? 'text-emerald-400' : r.rsi < 40 ? 'text-red-400' : 'text-slate-300'}`}>
                            {r.rsi}
                          </td>
                          <td className="py-2.5 text-xs text-slate-400">{r.trendStatus}</td>
                          <td className="py-2.5 text-xs text-slate-400">{r.holdingBias}</td>
                          <td className="py-2.5"><EntryBadge e={r.entryQuality} /></td>
                          <td className="pr-4 py-2.5"><WinRateBadge bt={r.backtest} /></td>
                        </tr>
                        {isExpanded && <DetailDrawer key={`${r.symbol}-detail`} r={r} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Scoring legend */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-400 mb-2">Scoring Model (100 pts total)</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                ['Trend Structure',   '25 pts', 'EMAs aligned, price positioning'],
                ['Momentum',          '20 pts', 'RSI level + direction, MACD'],
                ['Volume Confirm.',   '20 pts', 'Vol ratio, up/down vol dominance'],
                ['Volatility Exp.',   '15 pts', 'ATR expansion, price momentum'],
                ['Setup Pattern',     '20 pts', 'Breakout / Pullback / Breakdown'],
              ].map(([label, pts, desc]) => (
                <div key={label} className="bg-slate-800 rounded p-2">
                  <div className="text-slate-300 font-medium">{label}</div>
                  <div className="text-emerald-400 font-mono">{pts}</div>
                  <div className="text-slate-600 text-xs mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
            <p className="mt-2">
              Minimum score to appear: <span className="font-mono text-slate-300">58</span> &nbsp;|&nbsp;
              Directional spread required: <span className="font-mono text-slate-300">12+ pts</span> &nbsp;|&nbsp;
              Strong: <span className="font-mono text-slate-300">75+</span> &nbsp;|&nbsp;
              Moderate: <span className="font-mono text-slate-300">65+</span>
            </p>
          </div>
        </>
      )}
    </main>
  );
}
