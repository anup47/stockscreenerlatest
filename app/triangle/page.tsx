'use client';
import { useState, useEffect, useCallback } from 'react';
import type { TriangleResult, TriangleDebug } from '@/lib/triangle-screener';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  results: TriangleResult[];
  stats: {
    total: number;
    nearBreakout: number;
    recentBreakout: number;
    avgScore: number;
    universeSize: number;
  };
  timeframe: string;
  timestamp: string;
  elapsedMs: number;
}

type TabKey = 'daily' | 'weekly';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function scoreColor(score: number) {
  if (score >= 9) return 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40';
  if (score >= 7) return 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40';
  return 'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30';
}

function patternColor(score: number) {
  if (score >= 4) return 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40';
  if (score === 3) return 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40';
  return 'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30';
}

// ── Badge components ──────────────────────────────────────────────────────────

function ScoreBadge({ score, max }: { score: number; max: number }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${scoreColor(score)}`}>
      {score}/{max}
    </span>
  );
}

function PatternBadge({ score }: { score: number }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${patternColor(score)}`}>
      {score}/5
    </span>
  );
}

function IndicatorBadge({
  status,
  value,
}: {
  status: string;
  value?: string;
}) {
  const isBull = status === 'Bullish' || status === 'Rising';
  const isBear = status === 'Bearish' || status === 'Falling' || status === 'Overbought';
  const cls = isBull ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
    : isBear ? 'bg-red-900/50 text-red-300 border border-red-700'
    : 'bg-slate-800 text-slate-400 border border-slate-600';
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {value ? `${value} ` : ''}{status}
    </span>
  );
}

function ConfBadge({ hit }: { hit: number }) {
  const cls = hit === 3 ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
    : hit === 2 ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
    : 'bg-slate-800 text-slate-400 border border-slate-600';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>{hit}/3</span>;
}

function SignalBadge({ label }: { label: string }) {
  const isStrong  = label.includes('Strong') || label.includes('Breakout');
  const isHigh    = label.includes('High');
  const cls = isStrong ? 'text-emerald-400 font-semibold'
    : isHigh   ? 'text-sky-400 font-semibold'
    : 'text-slate-400';
  return <span className={`text-xs ${cls}`}>{label}</span>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

// ── Debug drawer ──────────────────────────────────────────────────────────────

function DebugDrawer({ r }: { r: TriangleResult }) {
  const d: TriangleDebug = r.debug;
  const { scoreBreakdown: sb } = d;

  const Row = ({ label, val, cls = 'text-slate-200' }: { label: string; val: string; cls?: string }) => (
    <div className="flex justify-between text-xs border-b border-slate-700/60 pb-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono ${cls}`}>{val}</span>
    </div>
  );

  return (
    <tr>
      <td colSpan={13} className="bg-slate-800/60 border-b border-slate-700">
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">

          {/* Pattern internals */}
          <div className="space-y-1.5">
            <p className="text-slate-500 uppercase text-xs mb-2 tracking-wide">Pattern Internals</p>
            <Row label="Resistance Level"  val={`Rs.${fmt(d.resistanceLevel)}`} />
            <Row label="Resistance Touches" val={`${d.resistanceTouches}`} cls={d.resistanceTouches >= 3 ? 'text-emerald-400' : 'text-amber-400'} />
            <div className="text-xs">
              <span className="text-slate-500">Touch Prices: </span>
              <span className="font-mono text-slate-300">{d.touchPrices.map(p => fmt(p)).join(' · ')}</span>
            </div>
            <Row label="Rising Lows Count" val={`${d.risingLowsCount}`} cls={d.risingLowsCount >= 3 ? 'text-emerald-400' : 'text-amber-400'} />
            <div className="text-xs">
              <span className="text-slate-500">Swing Lows: </span>
              <span className="font-mono text-slate-300">{d.swingLowPrices.map(p => fmt(p)).join(' · ')}</span>
            </div>
            <Row label="Compression Ratio"
              val={`${(d.compressionRatio * 100).toFixed(0)}%`}
              cls={d.compressionRatio < 0.5 ? 'text-emerald-400' : d.compressionRatio < 0.75 ? 'text-amber-400' : 'text-slate-300'}
            />
            <Row label="Breakout Distance"
              val={d.isAboveResistance ? `+${Math.abs(d.breakoutDistPct).toFixed(2)}% above` : `${d.breakoutDistPct.toFixed(2)}% below`}
              cls={d.isAboveResistance ? 'text-emerald-400' : d.breakoutDistPct <= 3 ? 'text-sky-400' : 'text-slate-300'}
            />
          </div>

          {/* Indicators */}
          <div className="space-y-1.5">
            <p className="text-slate-500 uppercase text-xs mb-2 tracking-wide">Indicator Details</p>
            <Row label="RSI(14)" val={`${d.rsiValue}`} cls={d.rsiStatus === 'Bullish' ? 'text-emerald-400' : d.rsiStatus === 'Overbought' ? 'text-amber-400' : d.rsiStatus === 'Bearish' ? 'text-red-400' : 'text-slate-300'} />
            <Row label="RSI Status" val={d.rsiStatus} cls={d.rsiStatus === 'Bullish' ? 'text-emerald-400' : d.rsiStatus === 'Bearish' ? 'text-red-400' : 'text-amber-400'} />
            <Row label="MACD Line"    val={`${d.macdLine.toFixed(3)}`} />
            <Row label="MACD Signal"  val={`${d.macdSignal.toFixed(3)}`} />
            <Row label="Histogram"    val={`${d.macdHistogram.toFixed(3)}`} cls={d.macdHistogram > d.macdHistPrev ? 'text-emerald-400' : 'text-red-400'} />
            <Row label="Hist. Prev"   val={`${d.macdHistPrev.toFixed(3)}`} />
            <Row label="MACD Status"  val={d.macdStatus} cls={d.macdStatus === 'Bullish' ? 'text-emerald-400' : d.macdStatus === 'Bearish' ? 'text-red-400' : 'text-amber-400'} />
            <Row label="OBV Slope"    val={`${d.obvSlope > 0 ? '+' : ''}${d.obvSlope.toLocaleString()}`} cls={d.obvSlope > 0 ? 'text-emerald-400' : d.obvSlope < 0 ? 'text-red-400' : 'text-slate-300'} />
            <Row label="OBV Status"   val={d.obvStatus} cls={d.obvStatus === 'Rising' ? 'text-emerald-400' : d.obvStatus === 'Falling' ? 'text-red-400' : 'text-slate-300'} />
          </div>

          {/* Score breakdown */}
          <div>
            <p className="text-slate-500 uppercase text-xs mb-2 tracking-wide">Score Breakdown</p>
            <div className="space-y-2">
              {[
                { label: 'Resistance Touches', score: sb.resistanceTouches, max: 3 },
                { label: 'Rising Lows',         score: sb.risingLows,        max: 2 },
                { label: 'Confirmations',        score: sb.confirmations,     max: 3 },
                { label: 'Proximity Bonus',      score: sb.proximity,         max: 4 },
              ].map(({ label, score, max }) => (
                <div key={label} className="text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-mono text-slate-300">{score}/{max}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${(score / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-1 border-t border-slate-700 flex justify-between text-xs">
                <span className="text-slate-400 font-semibold">Total Score</span>
                <span className={`font-mono font-bold ${scoreColor(r.totalScore)} px-2 py-0.5 rounded-full`}>
                  {r.totalScore}/12
                </span>
              </div>
            </div>

            <div className="mt-3 bg-slate-800/70 rounded p-2 text-xs text-slate-500">
              <p className="font-semibold text-slate-400 mb-1">Pattern Rules</p>
              <p>• Resistance: ≥2 pivot highs within ±1.5%</p>
              <p>• Rising lows: each swing low higher than prior</p>
              <p>• Confirmations: ≥2 of RSI / Adaptive MACD / OBV</p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrianglePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('daily');
  const [dailyData,  setDailyData]  = useState<ApiResponse | null>(null);
  const [weeklyData, setWeeklyData] = useState<ApiResponse | null>(null);
  const [dailyLoading,  setDailyLoading]  = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRow, setExpanded] = useState<string | null>(null);

  // Filters
  const [minScore,        setMinScore]        = useState(5);
  const [nearBreakout,    setNearBreakout]    = useState(false);
  const [recentBreakout,  setRecentBreakout]  = useState(false);
  const [maxBreakoutDist, setMaxBreakoutDist] = useState(20);
  const [sortCol, setSortCol] = useState<'totalScore' | 'breakoutDistPct' | 'patternScore' | 'rsiValue'>('totalScore');

  const runScan = useCallback(async (tf: TabKey) => {
    const setLoading = tf === 'daily' ? setDailyLoading : setWeeklyLoading;
    const setData    = tf === 'daily' ? setDailyData    : setWeeklyData;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/triangle-screen?tf=${tf}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Scan failed'); return; }
      setData(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  // Auto-scan daily on mount; scan weekly when tab first switched to it
  useEffect(() => { runScan('daily'); }, [runScan]);

  const handleTabSwitch = (tab: TabKey) => {
    setActiveTab(tab);
    setExpanded(null);
    if (tab === 'weekly' && !weeklyData && !weeklyLoading) runScan('weekly');
  };

  const data    = activeTab === 'daily' ? dailyData    : weeklyData;
  const loading = activeTab === 'daily' ? dailyLoading : weeklyLoading;

  const filtered = (data?.results ?? [])
    .filter(r => r.totalScore >= minScore)
    .filter(r => !nearBreakout   || (!r.isAboveResistance && r.breakoutDistPct <= 5))
    .filter(r => !recentBreakout || r.isAboveResistance)
    .filter(r => r.isAboveResistance || r.breakoutDistPct <= maxBreakoutDist)
    .sort((a, b) => {
      if (sortCol === 'totalScore')      return b.totalScore      - a.totalScore;
      if (sortCol === 'patternScore')    return b.patternScore    - a.patternScore;
      if (sortCol === 'breakoutDistPct') {
        // Sort by closeness to resistance (abs dist, breakouts first)
        const da = a.isAboveResistance ? 0 : a.breakoutDistPct;
        const db = b.isAboveResistance ? 0 : b.breakoutDistPct;
        return da - db;
      }
      if (sortCol === 'rsiValue')        return b.rsiValue        - a.rsiValue;
      return 0;
    });

  const SortTh = ({ col, label, cls = '' }: { col: typeof sortCol; label: string; cls?: string }) => (
    <th
      className={`py-2 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-slate-200 transition-colors whitespace-nowrap ${sortCol === col ? 'text-emerald-400' : 'text-slate-500'} ${cls}`}
      onClick={() => setSortCol(col)}
    >
      {label}{sortCol === col ? ' ↓' : ''}
    </th>
  );

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Ascending Triangle Screener</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Flat resistance + rising swing lows + RSI / Adaptive MACD / OBV confirmation — scored 1–12
          </p>
        </div>
        <button
          onClick={() => runScan(activeTab)}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-5 py-2 rounded text-sm transition-colors shrink-0"
        >
          {loading ? 'Scanning...' : 'Refresh Scan'}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-slate-700 pb-0">
        {(['daily', 'weekly'] as TabKey[]).map(tab => (
          <button
            key={tab}
            onClick={() => handleTabSwitch(tab)}
            className={`px-5 py-2 rounded-t text-sm font-semibold capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-emerald-500 text-emerald-400 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            {tab === 'daily' ? 'Daily' : 'Weekly'}
            {tab === 'daily' && dailyLoading  && <span className="ml-2 text-xs text-slate-500">...</span>}
            {tab === 'weekly' && weeklyLoading && <span className="ml-2 text-xs text-slate-500">...</span>}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{error}</div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
          <div className="text-slate-400 text-sm">Scanning {activeTab} patterns across {142} stocks...</div>
          <div className="text-slate-600 text-xs mt-1">Detecting resistance clusters, rising lows, and confirming with RSI / MACD / OBV</div>
          <div className="mt-4 w-48 mx-auto h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full animate-pulse w-1/2" />
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Patterns Found"      value={data.stats.total}          color="text-emerald-400" />
            <StatCard label="Near Breakout (≤5%)" value={data.stats.nearBreakout}   color="text-sky-400" />
            <StatCard label="Recent Breakouts"    value={data.stats.recentBreakout} color="text-amber-400" />
            <StatCard label="Avg Score /12"        value={data.stats.avgScore}       color="text-slate-300" />
          </div>

          {/* Meta */}
          <div className="text-xs text-slate-600 flex gap-3 flex-wrap">
            <span>Scanned at {new Date(data.timestamp).toLocaleTimeString('en-IN')}</span>
            <span>|</span><span>{data.elapsedMs}ms</span>
            <span>|</span><span>Showing {filtered.length} of {data.results.length} results</span>
          </div>

          {/* Filters */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Min Score</label>
              <div className="flex items-center gap-2">
                <input type="range" min={5} max={12} value={minScore}
                  onChange={e => setMinScore(Number(e.target.value))}
                  className="w-24 accent-emerald-500" />
                <span className="text-sm font-mono text-slate-200 w-6">{minScore}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Max Breakout Dist %</label>
              <div className="flex items-center gap-2">
                <input type="range" min={3} max={20} value={maxBreakoutDist}
                  onChange={e => setMaxBreakoutDist(Number(e.target.value))}
                  className="w-24 accent-emerald-500" />
                <span className="text-sm font-mono text-slate-200 w-6">{maxBreakoutDist}%</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={nearBreakout} onChange={e => setNearBreakout(e.target.checked)}
                className="accent-emerald-500 w-4 h-4" />
              <span className="text-sm text-slate-300">Near Breakout Only (≤5%)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={recentBreakout} onChange={e => setRecentBreakout(e.target.checked)}
                className="accent-emerald-500 w-4 h-4" />
              <span className="text-sm text-slate-300">Recent Breakouts Only</span>
            </label>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="text-center text-slate-500 py-10 text-sm">
              No patterns match current filters. Try lowering min score or expanding distance.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm min-w-[960px]">
                <thead className="bg-slate-800 text-slate-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left pl-4 py-2">Symbol</th>
                    <th className="text-left py-2">TF</th>
                    <th className="text-right pr-3 py-2">Price</th>
                    <th className="text-right pr-3 py-2">Resistance</th>
                    <SortTh col="breakoutDistPct" label="Dist %" cls="text-right pr-3" />
                    <SortTh col="patternScore"    label="Pattern"  cls="text-center" />
                    <SortTh col="rsiValue"        label="RSI"      cls="text-center" />
                    <th className="text-center py-2">MACD</th>
                    <th className="text-center py-2">OBV</th>
                    <th className="text-center py-2">Conf.</th>
                    <SortTh col="totalScore"      label="Score"    cls="text-center" />
                    <th className="text-left pr-4 py-2">Signal</th>
                    <th className="py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isExpanded = expandedRow === r.symbol;
                    const isBreakout = r.isAboveResistance;
                    const rowClass   = isBreakout
                      ? 'hover:bg-emerald-950/30'
                      : r.breakoutDistPct <= 3
                        ? 'hover:bg-sky-950/30'
                        : 'hover:bg-slate-800/40';
                    return (
                      <>
                        <tr
                          key={r.symbol}
                          onClick={() => setExpanded(isExpanded ? null : r.symbol)}
                          className={`border-b border-slate-800 cursor-pointer transition-colors ${rowClass} ${isExpanded ? 'bg-slate-800/50' : ''}`}
                        >
                          <td className="pl-4 py-2.5">
                            <div className="font-semibold text-slate-100">{r.symbol}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[120px]">{r.company}</div>
                          </td>
                          <td className="py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.timeframe === 'Daily' ? 'bg-slate-700 text-slate-300' : 'bg-indigo-900/50 text-indigo-300 border border-indigo-700'}`}>
                              {r.timeframe}
                            </span>
                          </td>
                          <td className="text-right pr-3 py-2.5 font-mono text-slate-200 text-xs">
                            Rs.{fmt(r.price)}
                          </td>
                          <td className="text-right pr-3 py-2.5 font-mono text-slate-400 text-xs">
                            Rs.{fmt(r.resistance)}
                          </td>
                          <td className="text-right pr-3 py-2.5 font-mono text-xs">
                            {r.isAboveResistance
                              ? <span className="text-emerald-400">+{Math.abs(r.breakoutDistPct).toFixed(1)}%↑</span>
                              : <span className={r.breakoutDistPct <= 3 ? 'text-sky-400' : r.breakoutDistPct <= 6 ? 'text-amber-400' : 'text-slate-400'}>
                                  {r.breakoutDistPct.toFixed(1)}%
                                </span>
                            }
                          </td>
                          <td className="text-center py-2.5">
                            <PatternBadge score={r.patternScore} />
                          </td>
                          <td className="text-center py-2.5">
                            <IndicatorBadge status={r.rsiStatus} value={String(r.rsiValue)} />
                          </td>
                          <td className="text-center py-2.5">
                            <IndicatorBadge status={r.macdStatus} />
                          </td>
                          <td className="text-center py-2.5">
                            <IndicatorBadge status={r.obvStatus} />
                          </td>
                          <td className="text-center py-2.5">
                            <ConfBadge hit={r.confirmationsHit} />
                          </td>
                          <td className="text-center py-2.5">
                            <ScoreBadge score={r.totalScore} max={12} />
                          </td>
                          <td className="pr-4 py-2.5">
                            <SignalBadge label={r.signalLabel} />
                          </td>
                          <td className="py-2.5 text-slate-600 text-xs">
                            {isExpanded ? '▲' : '▼'}
                          </td>
                        </tr>
                        {isExpanded && <DebugDrawer key={`${r.symbol}-debug`} r={r} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-400 mb-2">Scoring Guide (12 pts total)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ['Resistance Touches', '3 pts', '≥3 pivots clustered within ±1.5%'],
                ['Rising Lows',        '2 pts', '≥3 swing lows, each higher than prior'],
                ['Confirmations',      '3 pts', '1pt each: RSI 45–72 · MACD Bullish · OBV Rising'],
                ['Proximity Bonus',    '4 pts', '≤10% → 1 | ≤5% → 2 | ≤2% → 3 | Breakout → +bonus'],
              ].map(([label, pts, desc]) => (
                <div key={label} className="bg-slate-800 rounded p-2">
                  <div className="text-slate-300 font-medium">{label}</div>
                  <div className="text-emerald-400 font-mono">{pts}</div>
                  <div className="text-slate-600 mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
            <p className="mt-2">
              Min score to appear: <span className="font-mono text-slate-300">5/12</span> &nbsp;|&nbsp;
              Must have ≥2 of 3 confirmations &nbsp;|&nbsp;
              Strong: <span className="font-mono text-slate-300">9+</span> &nbsp;|&nbsp;
              High Quality: <span className="font-mono text-slate-300">7–8</span> &nbsp;|&nbsp;
              Adaptive MACD uses histogram direction (not just sign)
            </p>
          </div>
        </>
      )}
    </main>
  );
}
