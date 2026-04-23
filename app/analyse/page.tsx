'use client';
import { useState } from 'react';
import type {
  FullAnalysis, FibLevel, GannLevel, SRLevel,
  CandlePattern, VolumeAnalysis, KeyIndicators, TrendInfo, TradePlan, FnOData,
} from '@/lib/ta-analysis';

const TIMEFRAMES = [
  { value: '1min', label: '1 min' }, { value: '2min', label: '2 min' },
  { value: '5min', label: '5 min' }, { value: '10min', label: '10 min' },
  { value: '30min', label: '30 min' }, { value: '1hour', label: '1 Hour' },
  { value: '1day', label: 'Daily' }, { value: '1week', label: 'Weekly' },
  { value: '1month', label: 'Monthly' },
];

const DURATIONS = [
  { value: 'intraday', label: 'Intraday' }, { value: 'btst', label: 'BTST' },
  { value: '1week', label: '1 Week' }, { value: '1month', label: '1 Month' },
  { value: '3months', label: '3 Months' }, { value: '6months', label: '6 Months' },
  { value: '1year', label: '1 Year' },
];

// ── Reusable section wrapper ──────────────────────────────────────────────────

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full text-left px-4 py-2.5 flex justify-between items-center font-semibold text-sm ${color}`}
      >
        <span>{title}</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 bg-slate-900 text-sm space-y-2">{children}</div>}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex justify-between items-baseline border-b border-slate-800 pb-1">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-100">{value}{sub && <span className="text-slate-500 ml-1 text-xs">{sub}</span>}</span>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>{label}</span>;
}

// ── Section 1: Chart Overview ─────────────────────────────────────────────────

function ChartOverview({ data }: { data: FullAnalysis }) {
  return (
    <Section title="1. Chart Overview — Elliott Wave & Fibonacci" color="bg-violet-950 text-violet-200">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Badge label={data.elliott.currentWave} color={data.elliott.bias === 'bullish' ? 'bg-emerald-700 text-white' : data.elliott.bias === 'bearish' ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-200'} />
          <span className="text-slate-300">{data.elliott.description}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-slate-500 uppercase text-xs mb-1">Fibonacci Retracements</p>
          {data.fibRetracements.map((f: FibLevel) => (
            <div key={f.label} className="flex justify-between text-xs py-0.5 border-b border-slate-800">
              <span className="text-amber-400">{f.label}</span>
              <span className="font-mono">Rs. {f.price.toFixed(2)}</span>
              <span className={f.pctFromCurrent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {f.pctFromCurrent >= 0 ? '+' : ''}{f.pctFromCurrent}%
              </span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-slate-500 uppercase text-xs mb-1">Fibonacci Extensions</p>
          {data.fibExtensions.map((f: FibLevel) => (
            <div key={f.label} className="flex justify-between text-xs py-0.5 border-b border-slate-800">
              <span className="text-sky-400">{f.label}</span>
              <span className="font-mono">Rs. {f.price.toFixed(2)}</span>
              <span className="text-emerald-400">+{f.pctFromCurrent}%</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Section 2: Gann Theory ────────────────────────────────────────────────────

function GannSection({ levels }: { levels: GannLevel[] }) {
  return (
    <Section title="2. Gann Square of Nine Levels" color="bg-amber-950 text-amber-200">
      <p className="text-slate-400 text-xs mb-2">Gann price levels derived from square root of current price. Key support/resistance zones.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {levels.map(g => (
          <div key={g.label} className={`flex flex-col items-center border rounded py-1.5 ${g.pctFromCurrent === 0 || Math.abs(g.pctFromCurrent) < 1 ? 'border-amber-600 bg-amber-950' : 'border-slate-700 bg-slate-800'}`}>
            <span className="text-xs text-slate-400">{g.label}</span>
            <span className="font-mono font-semibold">Rs. {g.price.toFixed(2)}</span>
            <span className={`text-xs ${g.pctFromCurrent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {g.pctFromCurrent >= 0 ? '+' : ''}{g.pctFromCurrent}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Section 3: Chart Patterns & Candlesticks ───────────────────────────────────

function PatternSection({ data }: { data: FullAnalysis }) {
  return (
    <Section title="3. Chart Patterns & Candlestick Signals" color="bg-rose-950 text-rose-200">
      {data.candlePatterns.length === 0 && (
        <p className="text-slate-400">No significant candlestick pattern detected on the last 3 bars.</p>
      )}
      <div className="space-y-2">
        {data.candlePatterns.map((p: CandlePattern, i) => (
          <div key={i} className="flex items-start gap-2">
            <Badge label={p.type.toUpperCase()} color={p.type === 'bullish' ? 'bg-emerald-700 text-white' : p.type === 'bearish' ? 'bg-red-800 text-white' : 'bg-slate-600 text-slate-200'} />
            <div>
              <span className="font-semibold text-slate-200">{p.name}</span>
              <p className="text-slate-400 text-xs">{p.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <p className="text-slate-500 uppercase text-xs mb-1">Heikin Ashi (last 10 bars)</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left pr-2">Date</th>
                <th className="text-right pr-2">O</th>
                <th className="text-right pr-2">H</th>
                <th className="text-right pr-2">L</th>
                <th className="text-right pr-2">C</th>
                <th className="text-right">Bias</th>
              </tr>
            </thead>
            <tbody>
              {data.heikinAshi.slice(-6).map((b, i) => {
                const bull = b.close > b.open;
                return (
                  <tr key={i} className={bull ? 'text-emerald-400' : 'text-red-400'}>
                    <td className="pr-2 text-slate-500">{b.date.slice(0, 10)}</td>
                    <td className="text-right pr-2 font-mono">{b.open}</td>
                    <td className="text-right pr-2 font-mono">{b.high.toFixed(2)}</td>
                    <td className="text-right pr-2 font-mono">{b.low.toFixed(2)}</td>
                    <td className="text-right pr-2 font-mono">{b.close}</td>
                    <td className="text-right font-bold">{bull ? 'Bull' : 'Bear'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

// ── Section 4: Volume & Price-Volume ──────────────────────────────────────────

function VolumeSection({ v }: { v: VolumeAnalysis }) {
  return (
    <Section title="4. Volume & Price-Volume Analysis" color="bg-teal-950 text-teal-200">
      <Row label="Avg Volume (20d)" value={v.avgVol20.toLocaleString()} />
      <Row label="Avg Volume (5d)" value={v.avgVol5.toLocaleString()} />
      <Row label="Vol Ratio (5d / 20d)" value={v.volRatio} />
      <Row label="Volume Trend" value={v.trend} />
      <Row label="OBV Trend" value={v.obvTrend} />
      <Row label="A/D Line" value={v.adTrend} />
      <p className="text-amber-300 text-xs mt-2">{v.note}</p>
    </Section>
  );
}

function SRSection({ levels, price }: { levels: SRLevel[]; price: number }) {
  const supports = levels.filter(l => l.type === 'support').sort((a, b) => b.price - a.price).slice(0, 4);
  const resistances = levels.filter(l => l.type === 'resistance').sort((a, b) => a.price - b.price).slice(0, 4);
  return (
    <div className="mt-2">
      <p className="text-slate-500 uppercase text-xs mb-1">Support / Resistance Zones</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-red-400 text-xs mb-1">Resistance</p>
          {resistances.map(r => (
            <div key={r.price} className="flex justify-between text-xs py-0.5 border-b border-slate-800">
              <span className="font-mono text-red-300">Rs. {r.price}</span>
              <span className="text-slate-500">+{((r.price / price - 1) * 100).toFixed(1)}%</span>
              <span className="text-slate-600">str {r.strength}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-emerald-400 text-xs mb-1">Support</p>
          {supports.map(s => (
            <div key={s.price} className="flex justify-between text-xs py-0.5 border-b border-slate-800">
              <span className="font-mono text-emerald-300">Rs. {s.price}</span>
              <span className="text-slate-500">{((s.price / price - 1) * 100).toFixed(1)}%</span>
              <span className="text-slate-600">str {s.strength}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Section 6: F&O ─────────────────────────────────────────────────────────────

function FnOSection({ fno }: { fno: FnOData | null }) {
  if (!fno) return (
    <Section title="6. Derivatives & F&O Analysis" color="bg-orange-950 text-orange-200">
      <p className="text-slate-400">Stock not in F&O segment or options data unavailable.</p>
    </Section>
  );
  const pcrColor = fno.pcr > 1.3 ? 'text-emerald-400' : fno.pcr < 0.8 ? 'text-red-400' : 'text-amber-400';
  return (
    <Section title="6. Derivatives & F&O Analysis" color="bg-orange-950 text-orange-200">
      <Row label="Put/Call Ratio (PCR)" value={<span className={pcrColor}>{fno.pcr}</span> as unknown as string} />
      <Row label="Max Pain Strike" value={`Rs. ${fno.maxPainStrike}`} />
      <Row label="Implied Volatility (avg)" value={`${fno.ivCurrent}%`} />
      <Row label="Max OI Call Strike" value={`Rs. ${fno.topCEStrike.strike}`} sub={`OI: ${fno.topCEStrike.oi.toLocaleString()}`} />
      <Row label="Max OI Put Strike" value={`Rs. ${fno.topPEStrike.strike}`} sub={`OI: ${fno.topPEStrike.oi.toLocaleString()}`} />
      <p className="text-amber-300 text-xs mt-2">{fno.note}</p>
      <p className="text-slate-400 text-xs mt-1">
        Max pain at Rs. {fno.maxPainStrike} — price tends to gravitate here on expiry.
        Resistance capped near Rs. {fno.topCEStrike.strike} (highest call OI).
        Support expected near Rs. {fno.topPEStrike.strike} (highest put OI).
      </p>
    </Section>
  );
}

// ── Section 7: Trade Plan ─────────────────────────────────────────────────────

function TradePlanSection({ plan }: { plan: TradePlan }) {
  const actionColor = plan.action === 'BUY' ? 'bg-emerald-600 text-white' : plan.action === 'WATCH' ? 'bg-amber-600 text-white' : 'bg-red-800 text-white';
  return (
    <Section title="7. Synthesis & Trade Plan" color="bg-emerald-950 text-emerald-200">
      <div className="flex items-center gap-2 mb-3">
        <Badge label={plan.action} color={actionColor} />
        <span className="text-slate-300 text-xs">{plan.rationale}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Entry', value: `Rs. ${plan.entry}`, color: 'border-emerald-700' },
          { label: 'Stop Loss', value: `Rs. ${plan.stopLoss}`, sub: `-${plan.riskPct}%`, color: 'border-red-700' },
          { label: 'Target 1', value: `Rs. ${plan.target1}`, sub: `+${plan.t1Pct}%`, color: 'border-sky-700' },
          { label: 'Target 2', value: `Rs. ${plan.target2}`, sub: `+${plan.t2Pct}%`, color: 'border-violet-700' },
          { label: 'Target 3', value: `Rs. ${plan.target3}`, sub: `+${plan.t3Pct}%`, color: 'border-amber-700' },
          { label: 'R:R Ratio', value: plan.rrRatio, color: 'border-slate-600' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className={`border ${color} rounded p-2 text-center`}>
            <div className="text-slate-500 text-xs">{label}</div>
            <div className="font-mono font-semibold">{value}</div>
            {sub && <div className="text-xs text-slate-400">{sub}</div>}
          </div>
        ))}
      </div>
      <Row label="Holding Period" value={plan.holdingPeriod} />
    </Section>
  );
}

// ── Section 8: Arc & Cycle Matrix ─────────────────────────────────────────────

function CycleSection({ zones, totalBars }: { zones: number[]; totalBars: number }) {
  return (
    <Section title="8. Arc & Cycle Matrix — Fibonacci Time Zones" color="bg-indigo-950 text-indigo-200">
      <p className="text-slate-400 text-xs mb-2">
        Fibonacci time zones mark bars from the last significant swing low where price turns tend to occur.
        Watch for reversals or acceleration near these bars.
      </p>
      <div className="flex flex-wrap gap-2">
        {zones.map((barIdx, i) => {
          const fibs = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
          const barsFromEnd = totalBars - 1 - barIdx;
          const isPast = barIdx < totalBars;
          return (
            <div key={i} className={`border rounded px-2 py-1 text-center ${isPast ? 'border-indigo-700 bg-indigo-950' : 'border-slate-600'}`}>
              <div className="text-xs text-indigo-400">Fib {fibs[i]}</div>
              <div className="text-xs font-mono">{barsFromEnd >= 0 ? `${barsFromEnd} bars ago` : `in ${-barsFromEnd} bars`}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalysePage() {
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('1day');
  const [duration, setDuration] = useState('1month');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<FullAnalysis | null>(null);

  async function runAnalysis() {
    if (!symbol.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const url = `/api/analyse?symbol=${encodeURIComponent(symbol.trim())}&timeframe=${timeframe}&duration=${duration}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Analysis failed'); return; }
      setData(json as FullAnalysis);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-emerald-400">Single Stock Analysis</h1>
        <p className="text-slate-400 text-sm mt-1">Technical deep-dive across 8 sections — Elliott Wave, Gann, Patterns, Volume, Indicators, F&O, Trade Plan, Cycles</p>
      </div>

      {/* Form */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs text-slate-400 mb-1 block">Stock Symbol (NSE)</label>
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && runAnalysis()}
              placeholder="e.g. RELIANCE, INFY, TATASTEEL"
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Candle Timeframe</label>
            <select
              value={timeframe}
              onChange={e => setTimeframe(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
            >
              {TIMEFRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Trade Duration</label>
            <select
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
            >
              {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || !symbol.trim()}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2 rounded transition-colors"
        >
          {loading ? 'Analysing...' : 'Analyse'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-3">
          {/* Price header */}
          <div className="flex items-baseline gap-3 border-b border-slate-700 pb-3">
            <h2 className="text-xl font-bold text-slate-100">{data.symbol}</h2>
            <span className="text-2xl font-mono text-emerald-400">Rs. {data.price.toFixed(2)}</span>
            <span className="text-slate-500 text-sm">| {data.timeframe} chart | {data.duration} trade | {new Date(data.analysedAt).toLocaleTimeString()}</span>
          </div>

          <ChartOverview data={data} />
          <GannSection levels={data.gann} />
          <PatternSection data={data} />
          <VolumeSection v={data.volume} />
          <Section title="5. Key Technical Indicators & Trend" color="bg-sky-950 text-sky-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500 uppercase text-xs mb-1">Trend (Weinstein Stage)</p>
                <Badge label={data.trend.stage} color={data.trend.stage2 ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-200'} />
                <p className="text-slate-400 text-xs mt-1">{data.trend.note}</p>
                <div className="mt-2 space-y-1">
                  {(['ma20', 'ma50', 'ma150', 'ma200'] as const).map(k => (
                    <Row key={k} label={k.toUpperCase().replace('MA', 'MA ')} value={`Rs. ${data.trend[k]}`} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-500 uppercase text-xs mb-1">Oscillators</p>
                <Row label="RSI (14)" value={data.indicators.rsi14} />
                <Row label="MACD Line" value={data.indicators.macdLine} />
                <Row label="MACD Signal" value={data.indicators.macdSignal} />
                <Row label="Histogram" value={data.indicators.macdHistogram} />
                <Row label="MACD Status" value={data.indicators.macdCrossover} />
                <Row label="Stoch %K" value={data.indicators.stoch.k} />
                <Row label="Stoch Status" value={data.indicators.stoch.signal} />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-slate-500 uppercase text-xs mb-1">Bollinger Bands (20, 2)</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {([['Lower', data.indicators.bb.lower], ['Middle', data.indicators.bb.middle], ['Upper', data.indicators.bb.upper]] as const).map(([l, v]) => (
                  <div key={l} className="border border-slate-700 rounded py-1">
                    <div className="text-slate-500">{l}</div>
                    <div className="font-mono">Rs. {v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-slate-400">BB Width: <span className="text-slate-100">{data.indicators.bb.widthPct}%</span></span>
                <span className="text-slate-300">{data.indicators.bb.position}</span>
              </div>
            </div>
            <Row label="ATR (14)" value={`Rs. ${data.indicators.atr14}`} sub={`(${data.indicators.atrPct}% of price)`} />
            <SRSection levels={data.srLevels} price={data.price} />
          </Section>
          <FnOSection fno={data.fno} />
          <TradePlanSection plan={data.tradePlan} />
          <CycleSection zones={data.fibTimeZones} totalBars={data.heikinAshi.length + 10} />
        </div>
      )}
    </main>
  );
}
