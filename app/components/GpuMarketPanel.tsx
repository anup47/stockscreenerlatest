'use client';

import { useEffect, useState } from 'react';
import { Cpu, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GpuMarket, GpuVerdict } from '@/lib/gpu-market';

// Same palette as the Supply-Demand story categories.
const VERDICT: Record<GpuVerdict, { label: string; cls: string }> = {
  shortage:   { label: 'Shortage',   cls: 'bg-red-500/10 text-red-600 border-red-500/20' },
  oversupply: { label: 'Oversupply', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  balanced:   { label: 'Balanced',   cls: 'bg-slate-500/10 text-slate-500 border-slate-400/20' },
};

function Chg({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('tabular-nums font-medium', v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-muted-foreground')}>
      {v > 0 ? '+' : ''}{v.toFixed(1)}%
    </span>
  );
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26 - 1}`).join(' ');
  const up = values.at(-1)! >= values[0];
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={cn('h-7 w-24', className)} aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
        className={up ? 'stroke-emerald-500' : 'stroke-red-500'} />
    </svg>
  );
}

export default function GpuMarketPanel() {
  const [m, setM] = useState<GpuMarket | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/gpu-market')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(setM)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null; // the rest of the tab works without it
  if (!m) return <div className="h-40 rounded-xl border border-border bg-card animate-pulse" />;

  const v = VERDICT[m.verdict];
  const stats = [
    { label: '1 week', val: m.index.chg1w }, { label: '4 weeks', val: m.index.chg4w },
    { label: '13 weeks', val: m.index.chg13w }, { label: '1 year', val: m.index.chg52w },
  ];

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-foreground">AI Compute · GPU rental market</h2>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', v.cls)}>{v.label}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            {m.verdictNote} Live market read for the <span className="font-medium text-foreground">NVDA (AI Compute Proxy)</span> theme below;
            a turn to oversupply is the early warning for AI-capex beneficiaries.
          </p>
        </div>
        <div className="flex items-end gap-4">
          {stats.map(s => (
            <div key={s.label} className="text-right">
              <div className="text-sm"><Chg v={s.val} /></div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
          <div className="text-right">
            <Sparkline values={m.index.line.map(p => p.value)} />
            <div className="text-[10px] text-muted-foreground">Price index, 26 wks</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-xs min-w-[760px]">
          <thead className="bg-muted/40">
            <tr className="text-left text-muted-foreground">
              {['GPU', '$/GPU-hr', 'Providers', '4W', '13W', '1Y', 'Spot vs on-demand', '12M reserve discount', '26W trend'].map(h => (
                <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {m.models.map(g => (
              <tr key={g.slug} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{g.name}</td>
                <td className="px-3 py-2 tabular-nums">${g.price.toFixed(2)}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{g.providers}</td>
                <td className="px-3 py-2"><Chg v={g.chg4w} /></td>
                <td className="px-3 py-2"><Chg v={g.chg13w} /></td>
                <td className="px-3 py-2"><Chg v={g.chg52w} /></td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{g.spotPct != null ? `${g.spotPct}%` : '—'}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{g.reserve12mDiscount != null ? `−${g.reserve12mDiscount}%` : '—'}</td>
                <td className="px-3 py-1"><Sparkline values={g.spark} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-2.5 border-t border-border text-[10px] text-muted-foreground">
        Medians across cloud providers for the week of {m.asOf}{m.spotPct != null && <> · spot rents run at a median {m.spotPct}% of on-demand (higher = tighter market)</>}.
        Indicative, not bookable rates. Source:{' '}
        <a href={m.source.url} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
          {m.source.name} GPU price dataset <ExternalLink className="h-2.5 w-2.5" />
        </a>{' '}({m.source.license}).
      </p>
    </section>
  );
}
