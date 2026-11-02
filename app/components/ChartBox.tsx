'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Measures its own box after layout and hands a chart exact pixel dimensions. Recharts'
// ResponsiveContainer can size itself before a grid column settles and then overflow it.
export default function ChartBox({ h = 'h-72', children }: { h?: string; children: (size: { width: number; height: number }) => React.ReactNode }) {
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
