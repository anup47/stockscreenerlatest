'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, LineStyle, type IChartApi, type Time } from 'lightweight-charts';
import { sma, rsi, macd, bollinger, monthlyPivots } from '@/lib/commodities/analytics';
import type { Bar } from '@/lib/commodities/types';
import { cn } from '@/lib/utils';

const RANGES = { '6M': 126, '1Y': 252, '3Y': 756 } as const;
type Toggle = 'sma' | 'bb' | 'pivots';

export default function TechChart({ bars, unit }: { bars: Bar[]; unit: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<keyof typeof RANGES>('1Y');
  const [show, setShow] = useState<Record<Toggle, boolean>>({ sma: true, bb: false, pivots: true });

  useEffect(() => {
    if (!el.current || bars.length < 30) return;
    const ohlc = bars.every(b => b.o != null && b.h != null && b.l != null);
    const closes = bars.map(b => b.c);
    const t = (i: number) => bars[i].d as Time;
    const line = (vals: (number | null)[]) => vals.flatMap((v, i) => (v == null ? [] : [{ time: t(i), value: v }]));

    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#475569', fontSize: 11, panes: { separatorColor: '#e2e8f0' } },
      grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 },
    });
    chart.current = c;

    const main = ohlc
      ? c.addSeries(CandlestickSeries, { upColor: '#16a34a', downColor: '#dc2626', wickUpColor: '#16a34a', wickDownColor: '#dc2626', borderVisible: false })
      : c.addSeries(LineSeries, { color: '#0f172a', lineWidth: 2 });
    main.setData(ohlc ? bars.map(b => ({ time: b.d as Time, open: b.o!, high: b.h!, low: b.l!, close: b.c })) : bars.map(b => ({ time: b.d as Time, value: b.c })));

    if (show.sma) ([[20, '#f59e0b'], [50, '#6366f1'], [200, '#0d9488']] as const).forEach(([n, color]) =>
      c.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: `${n}D` }).setData(line(sma(closes, n))));
    if (show.bb) {
      const bb = bollinger(closes);
      for (const v of [bb.upper, bb.lower]) c.addSeries(LineSeries, { color: '#94a3b8', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false }).setData(line(v));
    }
    const piv = show.pivots ? monthlyPivots(bars) : null;
    if (piv) ([['R2', piv.R2, '#dc2626'], ['R1', piv.R1, '#f87171'], ['P', piv.P, '#64748b'], ['S1', piv.S1, '#4ade80'], ['S2', piv.S2, '#16a34a']] as const)
      .forEach(([title, price, color]) => main.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title }));

    // RSI(14) in pane 1, MACD(12,26,9) in pane 2.
    const r = c.addSeries(LineSeries, { color: '#7c3aed', lineWidth: 1, priceLineVisible: false, title: 'RSI 14' }, 1);
    r.setData(line(rsi(closes)));
    r.createPriceLine({ price: 70, color: '#f87171', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
    r.createPriceLine({ price: 30, color: '#4ade80', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
    const m = macd(closes);
    c.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2)
      .setData(m.hist.flatMap((v, i) => (v == null ? [] : [{ time: t(i), value: v, color: v >= 0 ? '#86efac' : '#fca5a5' }])));
    c.addSeries(LineSeries, { color: '#2563eb', lineWidth: 1, priceLineVisible: false, title: 'MACD' }, 2).setData(line(m.line));
    c.addSeries(LineSeries, { color: '#f97316', lineWidth: 1, priceLineVisible: false, title: 'Signal' }, 2).setData(line(m.signal));
    const panes = c.panes();
    panes[1]?.setHeight(90);
    panes[2]?.setHeight(100);

    c.timeScale().setVisibleLogicalRange({ from: bars.length - RANGES[range], to: bars.length + 3 });
    return () => { c.remove(); chart.current = null; };
  }, [bars, show, range]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border overflow-hidden">
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map(k => (
            <button key={k} onClick={() => setRange(k)} className={cn('px-2.5 py-1 text-xs font-medium', range === k ? 'bg-foreground text-background' : 'hover:bg-muted')}>{k}</button>
          ))}
        </div>
        {([['sma', '20/50/200 DMA'], ['bb', 'Bollinger'], ['pivots', 'Pivots (S/R)']] as [Toggle, string][]).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={show[k]} onChange={() => setShow(s => ({ ...s, [k]: !s[k] }))} className="accent-emerald-600" /> {label}
          </label>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">{unit} · daily · panes: price, RSI 14, MACD (12,26,9)</span>
      </div>
      <div ref={el} className="h-[520px] w-full" />
    </div>
  );
}
