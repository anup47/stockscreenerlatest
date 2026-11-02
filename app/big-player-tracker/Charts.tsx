'use client';

import { useEffect, useRef } from 'react';
import { createChart, createSeriesMarkers, CandlestickSeries, LineSeries, HistogramSeries, ColorType, LineStyle, type IChartApi, type Time, type SeriesMarker } from 'lightweight-charts';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import ChartBox from '@/app/components/ChartBox';
import type { DayResult, Verdict } from '@/lib/big-player';

export interface Bar { d: string; o: number; h: number; l: number; c: number; v: number }

export const VERDICT_COLOR: Record<Verdict, string> = {
  'BIG PLAYER BOUGHT': '#16a34a', 'BIG PLAYER SOLD': '#dc2626', 'RETAIL BUYING / FOMO': '#f59e0b', 'RETAIL CHURN': '#eab308', 'MIXED / NO CLEAR PLAYER': '#94a3b8',
};

const baseOptions = {
  autoSize: true,
  layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#475569', fontSize: 11 },
  grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false },
  crosshair: { mode: 0 },
} as const;

function useChart(build: (c: IChartApi) => void, deps: unknown[]) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, baseOptions);
    build(c);
    return () => c.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return el;
}

// Chart 1: candles + 20DMA, volume coloured by the candle (up = buyers' day), markers on tagged days.
export function PriceVolumeChart({ bars, rows, days }: { bars: Bar[]; rows: DayResult[]; days: number }) {
  const el = useChart(c => {
    const t = (d: string) => d as Time;
    const price = c.addSeries(CandlestickSeries, { upColor: '#16a34a', downColor: '#dc2626', wickUpColor: '#16a34a', wickDownColor: '#dc2626', borderVisible: false });
    price.setData(bars.map(b => ({ time: t(b.d), open: b.o, high: b.h, low: b.l, close: b.c })));
    price.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.28 } });

    const dma = bars.flatMap((b, i) => (i < 19 ? [] : [{ time: t(b.d), value: bars.slice(i - 19, i + 1).reduce((a, x) => a + x.c, 0) / 20 }]));
    c.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: '20 DMA' }).setData(dma);

    const vol = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'volume' } });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.76, bottom: 0 } });
    vol.setData(bars.map(b => ({ time: t(b.d), value: b.v, color: b.c >= b.o ? '#86efac' : '#fca5a5' })));

    const markers = rows.flatMap((r): SeriesMarker<Time>[] =>
      r.verdict === 'BIG PLAYER BOUGHT' ? [{ time: t(r.d), position: 'belowBar', shape: 'arrowUp', color: '#16a34a', text: 'Big buy' }]
      : r.verdict === 'BIG PLAYER SOLD' ? [{ time: t(r.d), position: 'aboveBar', shape: 'arrowDown', color: '#dc2626', text: 'Big sell' }]
      : r.verdict.startsWith('RETAIL') ? [{ time: t(r.d), position: 'aboveBar', shape: 'circle', color: '#f59e0b', text: 'R' }]
      : []);
    createSeriesMarkers(price, markers);
    c.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - days - 25), to: bars.length + 1 });
  }, [bars, rows, days]);
  return <div ref={el} className="h-[340px] sm:h-[420px] w-full" />;
}

// Chart 3: volume vs its 20-day average, coloured by the day's verdict; dashed line at the 1.5× rule.
export function VolumeRatioChart({ rows }: { rows: DayResult[] }) {
  const el = useChart(c => {
    const s = c.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(2)}×` } });
    s.setData(rows.map(r => ({ time: r.d as Time, value: r.volRatio, color: VERDICT_COLOR[r.verdict] })));
    s.createPriceLine({ price: 1.5, color: '#0f172a', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '1.5×' });
    s.createPriceLine({ price: 1, color: '#94a3b8', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
    c.timeScale().fitContent();
  }, [rows]);
  return <div ref={el} className="h-64 w-full" />;
}

// Chart 2: each day as a dot — many small trades sit bottom-right (retail), few large ones top-left (big players).
export function TradeSizeScatter({ rows }: { rows: DayResult[] }) {
  const groups = Object.entries(VERDICT_COLOR).map(([v, color]) => ({ v, color, data: rows.filter(r => r.verdict === v).map(r => ({ x: r.trades, y: r.avgTradeSize, d: r.d, z: 1 })) })).filter(g => g.data.length);
  const last = rows.at(-1);
  const avg = (f: (r: DayResult) => number) => rows.reduce((a, r) => a + f(r), 0) / Math.max(1, rows.length);
  const fmt = (v: number) => (v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(Math.round(v)));
  return (
    <ChartBox h="h-64">
      {({ width, height }) => (
        <ScatterChart width={width} height={height} margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
          <CartesianGrid stroke="#f1f5f9" />
          <XAxis type="number" dataKey="x" name="Trades" tickFormatter={fmt} tick={{ fontSize: 10 }} domain={['auto', 'auto']}
            label={{ value: 'Number of trades', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#64748b' }} />
          <YAxis type="number" dataKey="y" name="Shares per trade" tick={{ fontSize: 10 }} width={44} domain={['auto', 'auto']} />
          <ZAxis dataKey="z" range={[60, 60]} />
          <ReferenceLine x={avg(r => r.trades)} stroke="#cbd5e1" strokeDasharray="4 4" />
          <ReferenceLine y={avg(r => r.avgTradeSize)} stroke="#cbd5e1" strokeDasharray="4 4" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
            const p = payload?.[0]?.payload as { x: number; y: number; d: string } | undefined;
            const r = p && rows.find(x => x.d === p.d);
            return r ? (
              <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                <div className="font-semibold">{r.d}</div>
                <div>{r.trades.toLocaleString('en-IN')} trades · {r.avgTradeSize.toLocaleString('en-IN')} shares/trade</div>
                <div style={{ color: VERDICT_COLOR[r.verdict] }}>{r.verdict}</div>
              </div>
            ) : null;
          }} />
          {groups.map(g => <Scatter key={g.v} name={g.v} data={g.data} fill={g.color} isAnimationActive={false} />)}
          {last && <Scatter name="Latest" data={[{ x: last.trades, y: last.avgTradeSize, d: last.d, z: 1 }]} fill="none" stroke="#0f172a" strokeWidth={2} shape="circle" isAnimationActive={false} />}
        </ScatterChart>
      )}
    </ChartBox>
  );
}
