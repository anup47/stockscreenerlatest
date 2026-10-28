'use client';

import { useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, ComposedChart, Bar, Cell, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { completeWeeks, rollingCorrelation, levVsForward, pearson, type LeverageHistory } from '@/lib/leverage';
import { C, Panel, ChartBox, tickWeek, fmtWeek, tooltipStyle, axisTick, signed } from './ui';

const weekLabel = (l: unknown) => `Week ending ${fmtWeek(String(l))}`;

export default function MoreCharts({ history, range }: { history: LeverageHistory; range: number }) {
  const weeks = useMemo(() => completeWeeks(history), [history]);
  const view = useMemo(() => weeks.slice(-range), [weeks, range]);

  // Everything rebased to 100 at the first week shown, so growth rates compare directly.
  const rebased = useMemo(() => {
    const b = view[0];
    return view.map(w => ({
      week: w.week,
      nifty: w.nifty && b.nifty ? (w.nifty / b.nifty) * 100 : null,
      mtf: (w.mtf! / b.mtf!) * 100, fut: (w.fut! / b.fut!) * 100, combined: (w.combined! / b.combined!) * 100,
    }));
  }, [view]);

  const flows = useMemo(() => view.map((w, i) => {
    const p = i > 0 ? view[i - 1] : weeks[weeks.indexOf(w) - 1];
    return {
      week: w.week,
      chg: p ? (w.combined! - p.combined!) / 1000 : null,           // ₹ thousand crore
      nifty: p?.nifty && w.nifty ? ((w.nifty - p.nifty) / p.nifty) * 100 : null,
    };
  }), [view, weeks]);

  const split = useMemo(() => view.map(w => ({
    week: w.week,
    mtfNse: (w.mtfNse ?? 0) / 1e5, mtfBse: (w.mtfBse ?? 0) / 1e5,
    futStock: (w.futStock ?? 0) / 1e5, futIndex: (w.futIndex ?? 0) / 1e5,
  })), [view]);

  const corr = useMemo(() => {
    const first = view[0]?.week ?? '';
    return rollingCorrelation(history, 26).filter(r => r.week >= first);
  }, [history, view]);

  const scatter = useMemo(() => levVsForward(history, 13), [history]);
  const scatterCorr = pearson(scatter.map(s => s.levPct), scatter.map(s => s.fwd));
  const latestLev = weeks.at(-1)?.levPct;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Growth since start of range: leverage vs Nifty 50" note="All four series rebased to 100 at the first week shown.">
          <ChartBox>
            {({ width, height }) => (
              <LineChart width={width} height={height} data={rebased} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={axisTick} />
                <YAxis tick={axisTick} width={40} domain={['auto', 'auto']} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={weekLabel} formatter={v => Number(v).toFixed(1)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={100} stroke="#cbd5e1" />
                <Line isAnimationActive={false} dataKey="mtf" name="MTF" stroke={C.mtf} dot={false} strokeWidth={2} />
                <Line isAnimationActive={false} dataKey="fut" name="Futures OI" stroke={C.fut} dot={false} strokeWidth={2} />
                <Line isAnimationActive={false} dataKey="combined" name="Combined" stroke={C.combined} dot={false} strokeWidth={2} />
                <Line isAnimationActive={false} dataKey="nifty" name="Nifty 50" stroke={C.nifty} dot={false} strokeWidth={2} strokeDasharray="5 3" />
              </LineChart>
            )}
          </ChartBox>
        </Panel>

        <Panel title="Weekly change in leverage vs Nifty 50 return" note="Bars: week-on-week change in combined leverage (₹ thousand crore). Line: Nifty 50 weekly return (right axis).">
          <ChartBox>
            {({ width, height }) => (
              <ComposedChart width={width} height={height} data={flows} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={axisTick} />
                <YAxis yAxisId="chg" tick={axisTick} width={40} />
                <YAxis yAxisId="nifty" orientation="right" tick={axisTick} width={40} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={weekLabel}
                  formatter={(v, name) => (name === 'Nifty 50 return' ? signed(Number(v)) : `${Number(v) > 0 ? '+' : ''}₹${(Number(v) * 1000).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine yAxisId="chg" y={0} stroke="#94a3b8" />
                <Bar isAnimationActive={false} yAxisId="chg" dataKey="chg" name="Change in leverage">
                  {flows.map(f => <Cell key={f.week} fill={(f.chg ?? 0) >= 0 ? C.lev : C.mtf} />)}
                </Bar>
                <Line isAnimationActive={false} yAxisId="nifty" dataKey="nifty" name="Nifty 50 return" stroke={C.nifty} dot={false} strokeWidth={1.5} />
              </ComposedChart>
            )}
          </ChartBox>
        </Panel>

        <Panel title="MTF book by exchange" note="₹ lakh crore. NSE carries ~95% of the funded book.">
          <ChartBox h="h-64">
            {({ width, height }) => (
              <AreaChart width={width} height={height} data={split} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={axisTick} />
                <YAxis tick={axisTick} width={40} tickFormatter={v => Number(v).toFixed(1)} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={weekLabel} formatter={v => `₹${Number(v).toFixed(2)} lakh Cr`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area isAnimationActive={false} dataKey="mtfNse" name="NSE" stackId="m" stroke={C.mtf} fill={C.mtf} fillOpacity={0.7} />
                <Area isAnimationActive={false} dataKey="mtfBse" name="BSE" stackId="m" stroke={C.mtfBse} fill={C.mtfBse} fillOpacity={0.9} />
              </AreaChart>
            )}
          </ChartBox>
        </Panel>

        <Panel title="Futures OI: stock vs index" note="₹ lakh crore notional. Stock futures carry most of the derivative leverage.">
          <ChartBox h="h-64">
            {({ width, height }) => (
              <AreaChart width={width} height={height} data={split} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={axisTick} />
                <YAxis tick={axisTick} width={40} tickFormatter={v => Number(v).toFixed(1)} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={weekLabel} formatter={v => `₹${Number(v).toFixed(2)} lakh Cr`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area isAnimationActive={false} dataKey="futStock" name="Stock futures" stackId="f" stroke={C.fut} fill={C.fut} fillOpacity={0.7} />
                <Area isAnimationActive={false} dataKey="futIndex" name="Index futures" stackId="f" stroke={C.futIndex} fill={C.futIndex} fillOpacity={0.9} />
              </AreaChart>
            )}
          </ChartBox>
        </Panel>

        <Panel title="Rolling 26-week correlation: leverage vs Nifty 50" note="Correlation of weekly % changes. Above zero: leverage rises in rallies and falls in sell-offs.">
          <ChartBox h="h-64">
            {({ width, height }) => (
              <AreaChart width={width} height={height} data={corr} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={axisTick} />
                <YAxis tick={axisTick} width={40} domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={weekLabel} formatter={v => Number(v).toFixed(2)} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Area isAnimationActive={false} dataKey="corr" name="26-week correlation" stroke={C.combined} fill={C.combined} fillOpacity={0.08} strokeWidth={1.5} />
              </AreaChart>
            )}
          </ChartBox>
        </Panel>

        <Panel title="Leverage level vs Nifty 50's next 13 weeks"
          note={`Each dot is a week (full history). Correlation ${scatterCorr ?? '—'}${latestLev ? `; dashed line marks today's ${latestLev.toFixed(2)}%` : ''}.`}>
          <ChartBox h="h-64">
            {({ width, height }) => (
              <ScatterChart width={width} height={height} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" dataKey="levPct" name="Leverage % of mkt cap" tick={axisTick} domain={['auto', 'auto']} tickFormatter={v => `${Number(v).toFixed(1)}%`} />
                <YAxis type="number" dataKey="fwd" name="Nifty next 13W" tick={axisTick} width={40} tickFormatter={v => `${v}%`} />
                <ZAxis range={[18, 18]} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }}
                  formatter={(v, name) => (name === 'Leverage % of mkt cap' ? `${Number(v).toFixed(2)}%` : signed(Number(v)))} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                {latestLev && <ReferenceLine x={latestLev} stroke={C.lev} strokeDasharray="4 4" />}
                <Scatter isAnimationActive={false} data={scatter} fill={C.fut} fillOpacity={0.55} />
              </ScatterChart>
            )}
          </ChartBox>
        </Panel>
      </div>
    </div>
  );
}
