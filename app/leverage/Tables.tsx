'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { completeWeeks, yearlySummary, regimeTable, biggestUnwinds, type LeverageHistory } from '@/lib/leverage';
import { Panel, fmtWeek, lakhCr, signed, tone, th, td } from './ui';

const pctChg = (a?: number | null, b?: number | null) => (a && b != null ? ((b - a) / a) * 100 : null);

function downloadCsv(h: LeverageHistory) {
  const cols = ['week', 'mtfDate', 'mtf', 'mtfNse', 'mtfBse', 'futDate', 'futStock', 'futIndex', 'fut', 'combined', 'mcap', 'mcapEstimated', 'levPct', 'nifty', 'nifty500'] as const;
  const rows = [cols.join(','), ...h.weeks.map(w => cols.map(c => w[c] ?? '').join(','))];
  const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `india-leverage-weekly-${h.weeks.at(-1)?.week ?? ''}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeverageTables({ history }: { history: LeverageHistory }) {
  const [rowsShown, setRowsShown] = useState(12);
  const weeks = useMemo(() => completeWeeks(history), [history]);
  const recent = useMemo(() => weeks.slice(-rowsShown - 1).map((w, i, arr) => ({ w, prev: i > 0 ? arr[i - 1] : null })).slice(1).reverse(), [weeks, rowsShown]);
  const years = useMemo(() => yearlySummary(history).reverse(), [history]);
  const regimes = useMemo(() => regimeTable(history), [history]);
  const unwinds = useMemo(() => biggestUnwinds(history, 10), [history]);
  const nowLev = weeks.at(-1)?.levPct ?? null;

  return (
    <div className="space-y-5">
      {/* ── Weekly data ──────────────────────────────────────────────────── */}
      <Panel title="Weekly data" note="Last trading day of each week. Change columns are week-on-week."
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setRowsShown(n => (n === 12 ? 52 : 12))} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
              {rowsShown === 12 ? 'Show 52 weeks' : 'Show 12 weeks'}
            </button>
            <button onClick={() => downloadCsv(history)} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted">
              <Download className="size-3" /> CSV (5 yrs)
            </button>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr>{['Week ending', 'MTF', 'Δ', 'Stock fut.', 'Index fut.', 'Futures OI', 'Δ', 'Combined', 'Δ', 'Mkt cap', '% of mcap', 'Nifty 50', 'Δ'].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {recent.map(({ w, prev }) => (
                <tr key={w.week} className="hover:bg-muted/30">
                  <td className={cn(td, 'font-medium')}>{fmtWeek(w.week)}</td>
                  <td className={td}>{lakhCr(w.mtf)}</td>
                  <td className={cn(td, tone(pctChg(prev?.mtf, w.mtf)))}>{signed(pctChg(prev?.mtf, w.mtf))}</td>
                  <td className={td}>{lakhCr(w.futStock)}</td>
                  <td className={td}>{lakhCr(w.futIndex)}</td>
                  <td className={td}>{lakhCr(w.fut)}</td>
                  <td className={cn(td, tone(pctChg(prev?.fut, w.fut)))}>{signed(pctChg(prev?.fut, w.fut))}</td>
                  <td className={cn(td, 'font-semibold')}>{lakhCr(w.combined)}</td>
                  <td className={cn(td, tone(pctChg(prev?.combined, w.combined)))}>{signed(pctChg(prev?.combined, w.combined))}</td>
                  <td className={td}>{lakhCr(w.mcap, 1)}{w.mcapEstimated && <span className="text-muted-foreground" title="Moved from the nearest NSE month-end figure by the Nifty 500"> *</span>}</td>
                  <td className={cn(td, 'font-semibold')}>{w.levPct?.toFixed(2)}%</td>
                  <td className={td}>{w.nifty?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '—'}</td>
                  <td className={cn(td, tone(pctChg(prev?.nifty, w.nifty)))}>{signed(pctChg(prev?.nifty, w.nifty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">* Market cap interpolated between NSE month-end figures.</p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── Regimes ────────────────────────────────────────────────────── */}
        <Panel title="Leverage regimes and what the Nifty did next"
          note="Weeks split into five equal groups by leverage % of market cap, with the Nifty 50's average return over the following weeks.">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr>{['Leverage band', 'Range', 'Weeks', 'Nifty +4W', '+13W', '+26W', '13W down'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {regimes.map(r => {
                  const current = nowLev != null && nowLev >= r.from && nowLev <= r.to;
                  return (
                    <tr key={r.label} className={cn('hover:bg-muted/30', current && 'bg-amber-50')}>
                      <td className={cn(td, 'font-medium')}>{r.label}{current && <span className="ml-1 text-[10px] font-semibold text-amber-700">NOW</span>}</td>
                      <td className={td}>{r.from.toFixed(2)}–{r.to.toFixed(2)}%</td>
                      <td className={td}>{r.weeks}</td>
                      <td className={cn(td, tone(r.fwd4))}>{signed(r.fwd4)}</td>
                      <td className={cn(td, tone(r.fwd13))}>{signed(r.fwd13)}</td>
                      <td className={cn(td, tone(r.fwd26))}>{signed(r.fwd26)}</td>
                      <td className={td}>{r.down13 != null ? `${r.down13}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Leverage has trended up for five years, so the higher bands are mostly recent weeks and the latest ones have no forward returns yet.
          </p>
        </Panel>

        {/* ── Unwinds ────────────────────────────────────────────────────── */}
        <Panel title="Biggest leverage unwinds" note="Largest week-on-week falls in combined leverage, with the Nifty 50 that week and over the next 4 weeks.">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr>{['Week ending', 'Change', '₹ Cr', 'Lev %', 'Nifty wk', 'Nifty +4W'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {unwinds.map(u => (
                  <tr key={u.week} className="hover:bg-muted/30">
                    <td className={cn(td, 'font-medium')}>{fmtWeek(u.week)}</td>
                    <td className={cn(td, 'text-red-600 font-semibold')}>{signed(u.chgPct)}</td>
                    <td className={td}>{Math.round(u.chgCr).toLocaleString('en-IN')}</td>
                    <td className={td}>{u.levPct.toFixed(2)}%</td>
                    <td className={cn(td, tone(u.niftyWk))}>{signed(u.niftyWk)}</td>
                    <td className={cn(td, tone(u.niftyNext4))}>{signed(u.niftyNext4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Futures OI drops around monthly expiry when positions aren&apos;t rolled, so some of these are roll-over effects rather than forced selling.
          </p>
        </Panel>
      </div>

      {/* ── Yearly ───────────────────────────────────────────────────────── */}
      <Panel title="Year by year" note="Leverage % of market cap through each calendar year; growth and Nifty return measured from the previous year's last week.">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr>{['Year', 'Weeks', 'Avg lev %', 'High', 'Low', 'MTF (yr end)', 'MTF growth', 'Futures OI (yr end)', 'Futures growth', 'Combined (yr end)', 'Nifty 50'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {years.map(y => (
                <tr key={y.year} className="hover:bg-muted/30">
                  <td className={cn(td, 'font-semibold')}>{y.year}{y.year === new Date().getFullYear() && <span className="ml-1 text-[10px] text-muted-foreground">YTD</span>}</td>
                  <td className={td}>{y.weeks}</td>
                  <td className={cn(td, 'font-semibold')}>{y.avgLev.toFixed(2)}%</td>
                  <td className={td}>{y.maxLev.toFixed(2)}%</td>
                  <td className={td}>{y.minLev.toFixed(2)}%</td>
                  <td className={td}>{lakhCr(y.mtfEnd)}</td>
                  <td className={cn(td, tone(y.mtfGrowth))}>{signed(y.mtfGrowth)}</td>
                  <td className={td}>{lakhCr(y.futEnd)}</td>
                  <td className={cn(td, tone(y.futGrowth))}>{signed(y.futGrowth)}</td>
                  <td className={td}>{lakhCr(y.combEnd)}</td>
                  <td className={cn(td, tone(y.niftyRet))}>{signed(y.niftyRet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
