'use client';

// Shared formatting and layout pieces for the Leverage tab.
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Series colours, used consistently across KPIs, charts, tables and the heatmap legend.
export const C = {
  mtf: '#0d9488', mtfBse: '#5eead4', fut: '#6366f1', futIndex: '#a5b4fc',
  combined: '#111827', lev: '#d97706', nifty: '#64748b', up: '#16a34a', down: '#dc2626',
};

export const crore = (v: number | null | undefined) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')} Cr`);
export const lakhCr = (v: number | null | undefined, d = 2) => (v == null ? '—' : `₹${(v / 1e5).toFixed(d)} lakh Cr`);
export const fmtWeek = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const tickWeek = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
export const signed = (v: number | null | undefined, unit = '%', d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}${unit}`);
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-emerald-700' : 'text-red-600');

export const tooltipStyle = { fontSize: 12, borderRadius: 8, borderColor: 'hsl(var(--border))' };
export const axisTick = { fontSize: 11 };

export function Panel({ title, note, children, className, action }: { title: string; note?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 shadow-sm min-w-0', className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {note && <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

// Measures its own box after layout and hands the chart exact pixel dimensions. Recharts'
// ResponsiveContainer can size itself before a grid column settles and then overflow it.
export function ChartBox({ h = 'h-72', children }: { h?: string; children: (size: { width: number; height: number }) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize(s => (s && s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <div ref={ref} className={cn(h, 'w-full min-w-0 overflow-hidden')}>{size && size.width > 0 && children(size)}</div>;
}

export const th = 'px-2.5 py-2 text-left text-[11px] font-semibold text-muted-foreground whitespace-nowrap';
export const td = 'px-2.5 py-1.5 tabular-nums whitespace-nowrap';
