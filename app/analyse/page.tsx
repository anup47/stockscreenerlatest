'use client';
import { useState } from 'react';
import type {
  FullAnalysis, FibLevel, GannLevel, SRLevel,
  CandlePattern, VolumeAnalysis, TradePlan, OHLCVBar,
} from '@/lib/ta-analysis';

const TIMEFRAMES = [
  { value: '1min',   label: '1 min' },  { value: '2min',   label: '2 min' },
  { value: '5min',   label: '5 min' },  { value: '10min',  label: '10 min' },
  { value: '30min',  label: '30 min' }, { value: '1hour',  label: '1 Hour' },
  { value: '1day',   label: 'Daily' },  { value: '1week',  label: 'Weekly' },
  { value: '1month', label: 'Monthly' },
];

const DURATIONS = [
  { value: 'intraday', label: 'Intraday' }, { value: 'btst',     label: 'BTST' },
  { value: '1week',    label: '1 Week' },   { value: '1month',   label: '1 Month' },
  { value: '3months',  label: '3 Months' }, { value: '6months',  label: '6 Months' },
  { value: '1year',    label: '1 Year' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toString();
}

// ── Reusable UI pieces ────────────────────────────────────────────────────────

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full text-left px-4 py-2.5 flex justify-between items-center font-semibold text-sm ${color}`}
      >
        <span>{title}</span>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 bg-slate-900 text-sm space-y-2">{children}</div>}
    </div>
  );
}

function Row({ label, value, sub, valueClass }: { label: string; value: React.ReactNode; sub?: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-baseline border-b border-slate-800 pb-1 gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className={`font-mono text-right ${valueClass ?? 'text-slate-100'}`}>
        {value}{sub && <span className="text-slate-500 ml-1 text-xs">{sub}</span>}
      </span>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>{label}</span>;
}

// ── Price Header ──────────────────────────────────────────────────────────────

function PriceHeader({ data }: { data: FullAnalysis }) {
  const changePos = data.dayChangePct >= 0;
  const changeColor = changePos ? 'text-emerald-400' : 'text-red-400';
  const yrPos = (data.price / data.yearHigh) * 100;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-3">
      {/* Row 1: symbol + price + change */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-2xl font-bold text-slate-100">{data.symbol.replace(/\.(NS|BO)$/i, '')}</h2>
        <span className="text-3xl font-mono font-semibold text-emerald-400">Rs. {fmt(data.price)}</span>
        <span className={`text-lg font-mono font-semibold ${changeColor}`}>
          {changePos ? '+' : ''}{data.dayChangePct}%
        </span>
        {data.isFnO && <Badge label="F&O" color="bg-orange-700 text-white" />}
      </div>

      {/* Row 2: 52W range + prev close */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-slate-400">52W High: <span className="font-mono text-slate-100">Rs. {fmt(data.yearHigh)}</span></span>
        <span className="text-slate-400">52W Low: <span className="font-mono text-slate-100">Rs. {fmt(data.yearLow)}</span></span>
        <span className="text-slate-400">Prev Close: <span className="font-mono text-slate-100">Rs. {fmt(data.prevClose)}</span></span>
      </div>

      {/* 52W range bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>52W Low</span>
          <span className="text-slate-300">{yrPos.toFixed(0)}% from high</span>
          <span>52W High</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${yrPos.toFixed(1)}%` }}
          />
        </div>
      </div>

      {/* Row 3: meta */}
      <div className="text-xs text-slate-500 flex gap-3 flex-wrap">
        <span>{data.timeframe} chart</span>
        <span>|</span>
        <span>{data.duration} trade</span>
        <span>|</span>
        <span>{new Date(data.analysedAt).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'medium' })}</span>
      </div>
    </div>
  );
}

// ── Section 1: Elliott Wave + Fibonacci ──────────────────────────────────────

function ChartOverview({ data }: { data: FullAnalysis }) {
  return (
    <Section title="1. Chart Overview — Elliott Wave & Fibonacci" color="bg-violet-950 text-violet-200">
      <div className="flex items-start gap-2 mb-3">
        <Badge
          label={data.elliott.currentWave}
          color={data.elliott.bias === 'bullish' ? 'bg-emerald-700 text-white' : data.elliott.bias === 'bearish' ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-200'}
        />
        <p className="text-slate-300 text-xs leading-relaxed">{data.elliott.description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Fibonacci Retracements</p>
          {data.fibRetracements.map((f: FibLevel) => (
            <div key={f.label} className="flex justify-between text-xs py-0.5 border-b border-slate-800 gap-2">
              <span className="text-amber-400 w-12 shrink-0">{f.label}</span>
              <span className="font-mono">Rs. {fmt(f.price)}</span>
              <span className={f.pctFromCurrent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {f.pctFromCurrent >= 0 ? '+' : ''}{f.pctFromCurrent}%
              </span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Fibonacci Extensions</p>
          {data.fibExtensions.map((f: FibLevel) => (
            <div key={f.label} className="flex justify-between text-xs py-0.5 border-b border-slate-800 gap-2">
              <span className="text-sky-400 w-16 shrink-0">{f.label}</span>
              <span className="font-mono">Rs. {fmt(f.price)}</span>
              <span className="text-emerald-400">+{f.pctFromCurrent}%</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Section 2: Gann ───────────────────────────────────────────────────────────

function GannSection({ levels }: { levels: GannLevel[] }) {
  return (
    <Section title="2. Gann Square of Nine Levels" color="bg-amber-950 text-amber-200">
      <p className="text-slate-400 text-xs mb-2">Price levels derived from the square root of current price. Key reversal / support-resistance zones.</p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {levels.map(g => (
          <div key={g.label} className={`flex flex-col items-center border rounded py-1.5 px-1 ${Math.abs(g.pctFromCurrent) < 1 ? 'border-amber-600 bg-amber-950' : 'border-slate-700 bg-slate-800'}`}>
            <span className="text-xs text-slate-400">{g.label}</span>
            <span className="font-mono font-semibold text-xs">Rs. {fmt(g.price)}</span>
            <span className={`text-xs ${g.pctFromCurrent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {g.pctFromCurrent >= 0 ? '+' : ''}{g.pctFromCurrent}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Section 3: Patterns + OHLCV table ────────────────────────────────────────

function OHLCVTable({ bars }: { bars: OHLCVBar[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Recent OHLCV (last 10 bars)</p>
      <table className="w-full text-xs min-w-[480px]">
        <thead>
          <tr className="text-slate-500 border-b border-slate-800">
            <th className="text-left py-1 pr-2">Date</th>
            <th className="text-right pr-2">Open</th>
            <th className="text-right pr-2">High</th>
            <th className="text-right pr-2">Low</th>
            <th className="text-right pr-2">Close</th>
            <th className="text-right">Volume</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b, i) => {
            const bull = b.close >= b.open;
            const rowClass = bull ? 'text-emerald-400' : 'text-red-400';
            return (
              <tr key={i} className={`border-b border-slate-800/50 ${rowClass}`}>
                <td className="py-0.5 pr-2 text-slate-400 font-normal">{b.date.slice(0, 10)}</td>
                <td className="text-right pr-2 font-mono">{fmt(b.open)}</td>
                <td className="text-right pr-2 font-mono">{fmt(b.high)}</td>
                <td className="text-right pr-2 font-mono">{fmt(b.low)}</td>
                <td className={`text-right pr-2 font-mono font-semibold ${rowClass}`}>{fmt(b.close)}</td>
                <td className="text-right font-mono text-slate-400">{fmtVol(b.volume)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

      {/* Raw OHLCV table */}
      <OHLCVTable bars={data.recentBars} />

      {/* Heikin Ashi */}
      <div className="mt-3">
        <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Heikin Ashi (last 6 bars)</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full min-w-[380px]">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left pr-2">Date</th>
                <th className="text-right pr-2">HA-O</th>
                <th className="text-right pr-2">HA-H</th>
                <th className="text-right pr-2">HA-L</th>
                <th className="text-right pr-2">HA-C</th>
                <th className="text-right">Signal</th>
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

// ── Section 4: Volume ─────────────────────────────────────────────────────────

function VolumeSection({ v }: { v: VolumeAnalysis }) {
  return (
    <Section title="4. Volume & Price-Volume Analysis" color="bg-teal-950 text-teal-200">
      <Row label="Avg Volume (20d)" value={v.avgVol20.toLocaleString('en-IN')} />
      <Row label="Avg Volume (5d)"  value={v.avgVol5.toLocaleString('en-IN')} />
      <Row
        label="Vol Ratio (5d / 20d)"
        value={v.volRatio}
        valueClass={v.volRatio > 1.5 ? 'text-emerald-400' : v.volRatio < 0.6 ? 'text-amber-400' : 'text-slate-100'}
      />
      <Row label="Volume Trend" value={v.trend} />
      <Row label="OBV Trend"    value={v.obvTrend} />
      <Row label="A/D Line"     value={v.adTrend} />
      <p className="text-amber-300 text-xs mt-2">{v.note}</p>
    </Section>
  );
}

// ── Section 5: Indicators + Trend ────────────────────────────────────────────

function SRSection({ levels, price }: { levels: SRLevel[]; price: number }) {
  const supports    = levels.filter(l => l.type === 'support').sort((a, b) => b.price - a.price).slice(0, 4);
  const resistances = levels.filter(l => l.type === 'resistance').sort((a, b) => a.price - b.price).slice(0, 4);
  return (
    <div className="mt-3">
      <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Support / Resistance Zones</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-red-400 text-xs mb-1">Resistance</p>
          {resistances.map(r => (
            <div key={r.price} className="flex justify-between text-xs py-0.5 border-b border-slate-800 gap-1">
              <span className="font-mono text-red-300">Rs. {fmt(r.price)}</span>
              <span className="text-slate-500">+{((r.price / price - 1) * 100).toFixed(1)}%</span>
              <span className="text-slate-600">str {r.strength}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-emerald-400 text-xs mb-1">Support</p>
          {supports.map(s => (
            <div key={s.price} className="flex justify-between text-xs py-0.5 border-b border-slate-800 gap-1">
              <span className="font-mono text-emerald-300">Rs. {fmt(s.price)}</span>
              <span className="text-slate-500">{((s.price / price - 1) * 100).toFixed(1)}%</span>
              <span className="text-slate-600">str {s.strength}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IndicatorsSection({ data }: { data: FullAnalysis }) {
  const { trend, indicators, price, srLevels } = data;
  const rsiColor = indicators.rsi14 > 70 ? 'text-red-400' : indicators.rsi14 < 30 ? 'text-amber-400' : 'text-emerald-400';
  const crossColor = trend.goldenCross ? 'bg-emerald-700 text-white' : trend.deathCross ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-300';

  return (
    <Section title="5. Key Technical Indicators & Trend" color="bg-sky-950 text-sky-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Weinstein Stage</p>
          <Badge label={trend.stage} color={trend.stage2 ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-200'} />
          <p className="text-slate-400 text-xs mt-1">{trend.note}</p>
          <div className="mt-2 space-y-1">
            {([['MA 20', trend.ma20, trend.aboveMa20], ['MA 50', trend.ma50, trend.aboveMa50], ['MA 150', trend.ma150, trend.aboveMa150], ['MA 200', trend.ma200, trend.aboveMa200]] as [string, number, boolean][]).map(([label, val, above]) => (
              <div key={label} className="flex justify-between items-baseline border-b border-slate-800 pb-1">
                <span className="text-slate-400">{label}</span>
                <span className="font-mono">Rs. {fmt(val)}</span>
                <span className={`text-xs ${above ? 'text-emerald-400' : 'text-red-400'}`}>{above ? 'ABOVE' : 'BELOW'}</span>
              </div>
            ))}
          </div>
          {/* Golden / Death Cross */}
          <div className="mt-3">
            <Badge label={trend.goldenCross ? 'Golden Cross' : trend.deathCross ? 'Death Cross' : 'No Cross'} color={crossColor} />
            <p className="text-slate-400 text-xs mt-1">{trend.crossType}</p>
          </div>
        </div>
        <div>
          <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Oscillators</p>
          <Row label="RSI (14)" value={<span className={rsiColor}>{indicators.rsi14}</span>} />
          <Row label="MACD Line"    value={indicators.macdLine} />
          <Row label="MACD Signal"  value={indicators.macdSignal} />
          <Row label="Histogram"    value={indicators.macdHistogram} valueClass={indicators.macdHistogram > 0 ? 'text-emerald-400' : 'text-red-400'} />
          <Row label="MACD Status"  value={indicators.macdCrossover} />
          <Row label="Stoch %K"     value={indicators.stoch.k} />
          <Row label="Stoch Status" value={indicators.stoch.signal} />
        </div>
      </div>

      <div className="mt-3">
        <p className="text-slate-500 uppercase text-xs mb-1 tracking-wide">Bollinger Bands (20, 2)</p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {([['Lower', indicators.bb.lower, 'text-red-300'], ['Middle', indicators.bb.middle, 'text-slate-300'], ['Upper', indicators.bb.upper, 'text-emerald-300']] as [string, number, string][]).map(([l, v, cls]) => (
            <div key={l} className="border border-slate-700 rounded py-1.5">
              <div className="text-slate-500">{l}</div>
              <div className={`font-mono font-semibold ${cls}`}>Rs. {fmt(v)}</div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-slate-400">BB Width: <span className={`font-mono ${indicators.bb.widthPct < 5 ? 'text-amber-400' : 'text-slate-100'}`}>{indicators.bb.widthPct}%</span></span>
          <span className="text-slate-300 text-right">{indicators.bb.position}</span>
        </div>
      </div>

      <Row label="ATR (14)" value={`Rs. ${fmt(indicators.atr14)}`} sub={`(${indicators.atrPct}% of price)`} />

      <SRSection levels={srLevels} price={price} />
    </Section>
  );
}

// ── Section 6: F&O ────────────────────────────────────────────────────────────

function FnOSection({ data }: { data: FullAnalysis }) {
  return (
    <Section title="6. Derivatives & F&O Analysis" color="bg-orange-950 text-orange-200">
      <div className="flex items-start gap-3">
        <Badge
          label={data.isFnO ? 'F&O: YES' : 'F&O: NO'}
          color={data.isFnO ? 'bg-orange-700 text-white' : 'bg-slate-600 text-slate-200'}
        />
        <p className="text-slate-300 text-xs leading-relaxed">{data.fnoStatus}</p>
      </div>
      {data.isFnO && (
        <div className="mt-3 border border-orange-900 rounded p-3 bg-orange-950/50 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-orange-300 mb-1">Check in your broker terminal:</p>
          <p>• PCR (Put-Call Ratio) — above 1.3 is bullish, below 0.7 is bearish</p>
          <p>• Max Pain Strike — price tends to gravitate here on expiry</p>
          <p>• Highest OI Call Strike — acts as resistance ceiling</p>
          <p>• Highest OI Put Strike — acts as support floor</p>
          <p>• IV (Implied Volatility) — rising IV on up-move = strong trend</p>
          <p>• OI Change — long build-up vs short covering distinction</p>
        </div>
      )}
    </Section>
  );
}

// ── Section 7: Trade Plan ─────────────────────────────────────────────────────

function TradePlanSection({ plan }: { plan: TradePlan }) {
  const actionColor = plan.action === 'BUY' ? 'bg-emerald-600 text-white' : plan.action === 'WATCH' ? 'bg-amber-600 text-white' : 'bg-red-800 text-white';
  return (
    <Section title="7. Synthesis & Trade Plan" color="bg-emerald-950 text-emerald-200">
      <div className="flex items-start gap-2 mb-3">
        <Badge label={plan.action} color={actionColor} />
        <p className="text-slate-300 text-xs leading-relaxed">{plan.rationale}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        {([
          { label: 'Entry',    value: `Rs. ${fmt(plan.entry)}`,    sub: '',              border: 'border-emerald-700' },
          { label: 'Stop Loss',value: `Rs. ${fmt(plan.stopLoss)}`, sub: `-${plan.riskPct}%`, border: 'border-red-700' },
          { label: 'Target 1', value: `Rs. ${fmt(plan.target1)}`,  sub: `+${plan.t1Pct}%`,  border: 'border-sky-700' },
          { label: 'Target 2', value: `Rs. ${fmt(plan.target2)}`,  sub: `+${plan.t2Pct}%`,  border: 'border-violet-700' },
          { label: 'Target 3', value: `Rs. ${fmt(plan.target3)}`,  sub: `+${plan.t3Pct}%`,  border: 'border-amber-700' },
          { label: 'R:R',      value: plan.rrRatio,                 sub: '',              border: 'border-slate-600' },
        ]).map(({ label, value, sub, border }) => (
          <div key={label} className={`border ${border} rounded p-2 text-center`}>
            <div className="text-slate-500 text-xs">{label}</div>
            <div className="font-mono font-semibold text-sm">{value}</div>
            {sub && <div className="text-xs text-slate-400">{sub}</div>}
          </div>
        ))}
      </div>
      <Row label="Holding Period" value={plan.holdingPeriod} />
    </Section>
  );
}

// ── Section 8: Fibonacci Time Zones ──────────────────────────────────────────

function CycleSection({ zones, totalBars }: { zones: number[]; totalBars: number }) {
  const fibNums = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  return (
    <Section title="8. Arc & Cycle Matrix — Fibonacci Time Zones" color="bg-indigo-950 text-indigo-200">
      <p className="text-slate-400 text-xs mb-2">
        Bars marked from the last significant swing low. Price turns or acceleration tend to cluster near these Fibonacci intervals.
      </p>
      <div className="flex flex-wrap gap-2">
        {zones.map((barIdx, i) => {
          const barsFromEnd = totalBars - 1 - barIdx;
          const past = barIdx < totalBars;
          return (
            <div key={i} className={`border rounded px-2 py-1 text-center ${past ? 'border-indigo-700 bg-indigo-950' : 'border-slate-600 bg-slate-800'}`}>
              <div className="text-xs text-indigo-400">Fib {fibNums[i] ?? '?'}</div>
              <div className="text-xs font-mono">
                {barsFromEnd >= 0 ? `${barsFromEnd}b ago` : `in ${-barsFromEnd}b`}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalysePage() {
  const [symbol,    setSymbol]    = useState('');
  const [timeframe, setTimeframe] = useState('1day');
  const [duration,  setDuration]  = useState('1month');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [data,      setData]      = useState<FullAnalysis | null>(null);

  async function runAnalysis() {
    if (!symbol.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const url = `/api/analyse?symbol=${encodeURIComponent(symbol.trim())}&timeframe=${timeframe}&duration=${duration}`;
      const res  = await fetch(url);
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
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-emerald-400">Single Stock Analysis</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Elliott Wave · Gann · Candlesticks · Volume · Indicators · F&O · Trade Plan · Fibonacci Cycles
        </p>
      </div>

      {/* Input form */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Stock Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && runAnalysis()}
            placeholder="e.g. RELIANCE, AIRTEL, ZOMATO, TATASTEEL, NIFTY, GOLD"
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500"
          />
          <p className="text-slate-600 text-xs mt-1">Common names work: AIRTEL, HUL, ZOMATO, LIC, NIFTY, GOLD, CRUDE</p>
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
        {error && <p className="text-red-400 text-sm bg-red-950/30 border border-red-800 rounded px-3 py-2">{error}</p>}
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-3">
          <PriceHeader data={data} />
          <ChartOverview data={data} />
          <GannSection levels={data.gann} />
          <PatternSection data={data} />
          <VolumeSection v={data.volume} />
          <IndicatorsSection data={data} />
          <FnOSection data={data} />
          <TradePlanSection plan={data.tradePlan} />
          <CycleSection zones={data.fibTimeZones} totalBars={data.recentBars.length + 10} />
        </div>
      )}
    </main>
  );
}
