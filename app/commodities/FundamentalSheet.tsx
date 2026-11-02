'use client';

import { useState } from 'react';
import { ArrowUp, ArrowDown, Minus, Download, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommodityState, DailyRow, Metric } from '@/lib/commodities/types';

const fmt = (v: number | null | undefined, unit = '') => {
  if (v == null) return '—';
  const d = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : 2;
  return `${v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })}${unit === '%' ? '%' : ''}`;
};

// Arrow direction = change; colour = what that change means for price (green bullish, red bearish).
function Change({ v, prev, bullishUp, compact = false }: { v: number | null; prev: number | null; bullishUp?: boolean; compact?: boolean }) {
  if (v == null || prev == null || v === prev) return <Minus className="size-3.5 text-muted-foreground" />;
  const up = v > prev;
  const good = bullishUp == null ? null : up === bullishUp;
  const cls = good == null ? 'text-slate-500' : good ? 'text-emerald-600' : 'text-red-600';
  const chg = prev !== 0 ? ((v - prev) / Math.abs(prev)) * 100 : null;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs tabular-nums', cls)}>
      {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      {!compact && chg != null && `${Math.abs(chg) < 0.01 ? '<0.01' : Math.abs(chg).toFixed(2)}%`}
    </span>
  );
}

function MetricRow({ m }: { m: Metric }) {
  return (
    <tr className={cn('align-top', !m.available && 'bg-muted/20')}>
      <td className="px-3 py-2">
        <div className={cn('text-[13px]', m.available ? 'text-foreground' : 'text-muted-foreground')}>{m.label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Source: {m.sourceUrl ? <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{m.source} <ExternalLink className="inline size-2.5" /></a> : m.source}
          {m.frequency && ` · ${m.frequency}`}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[13px] font-semibold whitespace-nowrap">
        {m.available ? fmt(m.value, m.unit) : <span className="text-[11px] font-normal text-muted-foreground">Not available free</span>}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{m.available && <Change v={m.value} prev={m.prev} bullishUp={m.higherIsBullish} />}</td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap hidden sm:table-cell">{m.asOf ?? ''}</td>
    </tr>
  );
}

function downloadCsv(c: CommodityState) {
  const cols: (keyof DailyRow)[] = ['date', 'price', 'inrParity', 'lmeCash', 'lme3m', 'cash3mPct', 'lmeStock', 'etfTonnes', 'usdInr', 'dxy', 'us10y', 'realYield'];
  const csv = [cols.join(','), ...c.history.map(r => cols.map(k => r[k] ?? '').join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: `${c.code.toLowerCase()}-fundamentals.csv` }).click();
  URL.revokeObjectURL(url);
}

export default function FundamentalSheet({ c }: { c: CommodityState }) {
  const [days, setDays] = useState(15);
  const precious = c.code === 'GOLD' || c.code === 'SILVER';
  const live = c.metrics.filter(m => m.available), missing = c.metrics.filter(m => !m.available);

  // Daily sheet columns relevant to this commodity, with the cell's day-on-day arrow.
  const cols: { key: keyof DailyRow; label: string; bullishUp?: boolean; unit?: string }[] = [
    { key: 'price', label: `Price (${c.unit})`, bullishUp: true },
    { key: 'inrParity', label: `₹ parity (${c.inrUnit})`, bullishUp: true },
    ...(precious
      ? [{ key: 'etfTonnes' as const, label: 'ETF (t)', bullishUp: true }]
      : [{ key: 'lme3m' as const, label: 'LME 3M', bullishUp: true }, { key: 'cash3mPct' as const, label: 'Cash–3M %', bullishUp: true, unit: '%' }, { key: 'lmeStock' as const, label: 'LME stock (t)', bullishUp: false }]),
    { key: 'usdInr', label: 'USD/INR' },
    { key: 'dxy', label: 'DXY', bullishUp: false },
    { key: 'us10y', label: 'US 10Y %', bullishUp: precious ? false : undefined },
    { key: 'realYield', label: 'Real yld %', bullishUp: precious ? false : undefined },
  ];
  const rows = c.history.slice(-days - 1);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/40 border-b border-border">
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Indicator</th>
              <th className="px-3 py-2 font-semibold text-right">Latest</th>
              <th className="px-3 py-2 font-semibold text-right">Day change</th>
              <th className="px-3 py-2 font-semibold hidden sm:table-cell">As of</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {live.map(m => <MetricRow key={m.key} m={m} />)}
            {missing.length > 0 && (
              <tr><td colSpan={4} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tracked but not available from a free automated source</td></tr>
            )}
            {missing.map(m => <MetricRow key={m.key} m={m} />)}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold">Daily sheet</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setDays(d => (d === 15 ? 60 : 15))} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">{days === 15 ? 'Show 60 days' : 'Show 15 days'}</button>
            <button onClick={() => downloadCsv(c)} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"><Download className="size-3" /> CSV</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>{['Date', ...cols.map(c => c.label)].map(h => <th key={h} className="px-2.5 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.slice(1).map((r, i) => {
                const p = rows[i];
                return (
                  <tr key={r.date} className="hover:bg-muted/30">
                    <td className="px-2.5 py-1.5 font-medium whitespace-nowrap">{r.date}</td>
                    {cols.map(col => (
                      <td key={col.key} className="px-2.5 py-1.5 tabular-nums whitespace-nowrap">
                        <span className="mr-1">{fmt(r[col.key] as number | null, col.unit)}</span>
                        <Change compact v={r[col.key] as number | null} prev={p[col.key] as number | null} bullishUp={col.bullishUp} />
                      </td>
                    ))}
                  </tr>
                );
              }).reverse()}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
          Sources: price — {c.priceSource}; LME — westmetall.com (LME official prices and stocks); ETF — iShares trust holdings (recorded daily from the day tracking began);
          USD/INR and DXY — Yahoo Finance; yields — US Treasury daily curves. Green/red arrows show whether the move is bullish or bearish for the metal; grey where the link is ambiguous.
        </p>
      </div>
    </div>
  );
}
