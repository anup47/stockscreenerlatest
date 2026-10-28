'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ReferenceLine, ComposedChart,
} from 'recharts';
import { Gauge, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyseLeverage, percentileRank, type LeverageHistory, type LeverageWeek, type Change } from '@/lib/leverage';
import { C, crore, lakhCr, fmtWeek, tickWeek, signed, tooltipStyle, Panel, ChartBox } from './ui';
import MoreCharts from './MoreCharts';
import LeverageTables from './Tables';

const RANGES = { '1Y': 52, '3Y': 156, '5Y': 9999 } as const;
type RangeKey = keyof typeof RANGES;

function ChangeChips({ c, unit = '%', digits = 1, invert = false }: { c: Change; unit?: string; digits?: number; invert?: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {(['wow', 'mom', 'yoy'] as const).map(k => {
        const v = c[k];
        // Rising leverage is the risk direction, so up is amber and down is green.
        const tone = v == null || v === 0 ? 'text-muted-foreground' : (v > 0) !== invert ? 'text-amber-700' : 'text-emerald-700';
        return (
          <span key={k} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
            <span className="text-muted-foreground mr-1">{k.toUpperCase()}</span>
            <span className={cn('font-semibold tabular-nums', tone)}>{signed(v, unit, digits)}</span>
          </span>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, sub, color, children }: { label: string; value: string; sub?: string; color: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: color }} />{label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
}

function Insight({ q, tone, children }: { q: string; tone: 'high' | 'low' | 'neutral'; children: React.ReactNode }) {
  const bar = { high: 'border-l-amber-500', low: 'border-l-emerald-500', neutral: 'border-l-slate-300' }[tone];
  return (
    <div className={cn('rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm', bar)}>
      <p className="text-sm font-semibold text-foreground">{q}</p>
      <div className="mt-1.5 space-y-1.5 text-[13px] leading-relaxed text-foreground/80">{children}</div>
    </div>
  );
}

// Cool → warm scale for the heatmap: percentile 0 = lowest leverage of the period, 100 = highest.
function heat(p: number) {
  const stops = [[224, 242, 254], [253, 230, 138], [220, 38, 38]];
  const t = Math.max(0, Math.min(1, p / 100)) * 2, i = Math.min(1, Math.floor(t)), f = t - i;
  const [a, b] = [stops[i], stops[i + 1]];
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(',')})`;
}


export default function LeveragePage() {
  const [h, setH] = useState<LeverageHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('5Y');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/leverage', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setH(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const a = useMemo(() => (h ? analyseLeverage(h) : null), [h]);
  const complete = useMemo(() => (h?.weeks ?? []).filter(w => w.combined != null && w.levPct != null), [h]);
  const series = useMemo(() => complete.slice(-RANGES[range]).map(w => ({
    ...w,
    mtfL: w.mtf! / 1e5, futL: w.fut! / 1e5, combL: w.combined! / 1e5,
    mtfShare: (w.mtf! / w.combined!) * 100, futShare: (w.fut! / w.combined!) * 100,
  })), [complete, range]);

  // Heatmap colour = rank within these 52 weeks, so week-to-week shifts stay visible even when the
  // whole year sits near 5-year highs; the 5-year percentile is in each cell's tooltip.
  const heatRows = useMemo(() => {
    const last52 = complete.slice(-52);
    const rows: { label: string; f: (w: LeverageWeek) => number; fmt: (v: number) => string }[] = [
      { label: 'MTF book', f: w => w.mtf!, fmt: v => lakhCr(v) },
      { label: 'Futures OI', f: w => w.fut!, fmt: v => lakhCr(v) },
      { label: 'Combined', f: w => w.combined!, fmt: v => lakhCr(v) },
      { label: '% of mkt cap', f: w => w.levPct!, fmt: v => `${v.toFixed(2)}%` },
    ];
    return rows.map(r => {
      const all = complete.map(r.f);
      const year = last52.map(r.f);
      const lo = Math.min(...year), hi = Math.max(...year);
      return {
        ...r,
        cells: last52.map(w => {
          const v = r.f(w);
          return { week: w.week, v, p: hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50, p5y: percentileRank(all, v) };
        }),
      };
    });
  }, [complete]);

  const stale = h ? Date.now() - Date.parse(h.generatedAt) > 3 * 864e5 : false;

  if (loading && !h) return <div className="max-w-[1500px] mx-auto px-4 py-6"><div className="h-64 rounded-xl border border-border bg-card animate-pulse" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1500px] mx-auto px-4 py-6 space-y-5">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Gauge className="size-5 text-emerald-600" /> MTF + F&amp;O Leverage Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Borrowed and derivative exposure in Indian equities: the NSE + BSE margin-trading book plus futures open interest, against total market cap.
              {a && <> Week ending {fmtWeek(a.latest.week)}.</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stale && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border bg-amber-50 text-amber-700 border-amber-200"
                title="Built by a scheduled task on the office PC; it pauses while that PC is off.">
                <AlertTriangle className="size-3" /> Data not refreshed since {fmtWeek(h!.generatedAt.slice(0, 10))}
              </span>
            )}
            <div className="flex rounded-md border border-border overflow-hidden">
              {(Object.keys(RANGES) as RangeKey[]).map(k => (
                <button key={k} onClick={() => setRange(k)}
                  className={cn('px-3 py-1.5 text-xs font-medium', range === k ? 'bg-foreground text-background' : 'hover:bg-muted')}>
                  {k}
                </button>
              ))}
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted disabled:opacity-40">
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>

        {(error || !a) && (
          <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {error ?? 'Not enough history yet.'} The series is built by the hourly job on the office PC; it appears after its first run.
          </div>
        )}

        {a && h && (<>
          {/* ── KPIs ─────────────────────────────────────────────────────────── */}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
            <Kpi label="Total MTF book" value={crore(a.latest.mtf)} color={C.mtf}
              sub={`NSE ${crore(a.latest.mtfNse)} · BSE ${crore(a.latest.mtfBse)}`}>
              <ChangeChips c={a.change.mtf} />
            </Kpi>
            <Kpi label="Futures OI notional" value={crore(a.latest.fut)} color={C.fut}
              sub={`Stock ${lakhCr(a.latest.futStock)} · Index ${lakhCr(a.latest.futIndex)}`}>
              <ChangeChips c={a.change.fut} />
            </Kpi>
            <Kpi label="Combined leverage" value={crore(a.latest.combined)} color={C.combined}
              sub={`${lakhCr(a.latest.combined)} · above ${a.rank.combined}% of weeks in ${a.years} yrs`}>
              <ChangeChips c={a.change.combined} />
            </Kpi>
            <Kpi label="% of total market cap" value={`${a.latest.levPct!.toFixed(2)}%`} color={C.lev}
              sub={`of ${lakhCr(a.latest.mcap)} NSE market cap · above ${a.rank.levPct}% of weeks`}>
              <ChangeChips c={a.change.levPctPts} unit=" pp" digits={2} />
            </Kpi>
          </div>

          {/* ── Insights ─────────────────────────────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Insight q="Is leverage at a 5-year high or low?" tone={a.rank.levPct >= 80 ? 'high' : a.rank.levPct <= 20 ? 'low' : 'neutral'}>
              <p>
                Leverage is <b>{a.latest.levPct!.toFixed(2)}% of market cap</b>, higher than {a.rank.levPct}% of the last {complete.length} weeks
                {a.rank.levPct >= 95 ? ' — at or near a 5-year high.' : a.rank.levPct <= 5 ? ' — at or near a 5-year low.' : '.'}
              </p>
              <p>
                5-year range: high <b>{a.extremes.levHigh.levPct!.toFixed(2)}%</b> ({fmtWeek(a.extremes.levHigh.week)}), low <b>{a.extremes.levLow.levPct!.toFixed(2)}%</b> ({fmtWeek(a.extremes.levLow.week)}).
                In rupees, the combined {lakhCr(a.latest.combined)} compares with a peak of {lakhCr(a.extremes.combHigh.combined)} ({fmtWeek(a.extremes.combHigh.week)}).
              </p>
            </Insight>

            <Insight q="Is MTF growing faster than F&O?" tone={(a.growth.mtf52w ?? 0) > (a.growth.fut52w ?? 0) ? 'high' : 'neutral'}>
              <p>
                {(a.growth.mtf52w ?? 0) > (a.growth.fut52w ?? 0) ? 'Yes.' : 'No.'} Over a year the MTF book is <b>{signed(a.growth.mtf52w)}</b> against futures OI <b>{signed(a.growth.fut52w)}</b>;
                over 13 weeks, {signed(a.growth.mtf13w)} vs {signed(a.growth.fut13w)}.
              </p>
              <p>
                MTF now makes up <b>{a.growth.mtfShareNow.toFixed(1)}%</b> of combined leverage{a.growth.mtfShare1y != null && <>, up from {a.growth.mtfShare1y.toFixed(1)}% a year ago</>}.
                MTF is delivery-based, mostly retail borrowing held for weeks or months; futures positions roll monthly, so a rising MTF share means stickier leverage that unwinds through margin calls rather than expiry.
              </p>
            </Insight>

            <Insight q={`What happened when leverage crossed ${a.threshold.level.toFixed(2)}% of market cap?`} tone={a.latest.levPct! >= a.threshold.level ? 'high' : 'neutral'}>
              <p>
                {a.threshold.level.toFixed(2)}% is the {a.threshold.pct}th percentile of the period; leverage is {a.latest.levPct! >= a.threshold.level ? <b>above it now</b> : 'below it now'}.
                {a.threshold.episodes.length
                  ? <> After the {a.threshold.episodes.length} fresh crossing{a.threshold.episodes.length > 1 ? 's' : ''}, the Nifty 50 averaged <b>{signed(a.threshold.avgFwd.fwd4)}</b> over 4 weeks,
                      <b> {signed(a.threshold.avgFwd.fwd13)}</b> over 13 and <b>{signed(a.threshold.avgFwd.fwd26)}</b> over 26, against {signed(a.threshold.baseFwd.fwd4)} / {signed(a.threshold.baseFwd.fwd13)} / {signed(a.threshold.baseFwd.fwd26)} for all weeks.</>
                  : ' It has not freshly crossed this level within the period.'}
              </p>
              {a.threshold.episodes.length > 0 && (
                <table className="w-full text-xs tabular-nums">
                  <thead><tr className="text-muted-foreground text-left"><th className="font-medium py-0.5">Crossed</th><th className="font-medium">Lev %</th><th className="font-medium">Nifty +4W</th><th className="font-medium">+13W</th><th className="font-medium">+26W</th></tr></thead>
                  <tbody>
                    {a.threshold.episodes.map(e => (
                      <tr key={e.week}><td className="py-0.5">{fmtWeek(e.week)}</td><td>{e.levPct.toFixed(2)}%</td><td>{signed(e.fwd4)}</td><td>{signed(e.fwd13)}</td><td>{signed(e.fwd26)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[11px] text-muted-foreground">
                Small sample: leverage has trended up for five years, so high-percentile crossings cluster in recent years. Treat this as context, not a signal.
              </p>
            </Insight>

            <Insight q="How does leverage move with the Nifty 50?" tone="neutral">
              <p>
                Week-to-week, combined leverage and the Nifty 50 move together with a correlation of <b>{a.correlation.weekly ?? '—'}</b> ({a.correlation.weeks} weeks)
                {a.correlation.weekly != null && (a.correlation.weekly > 0.2 ? ': leverage builds in rallies and unwinds in falls, which amplifies both.' : ': only loosely linked week to week.')}
              </p>
              <p>
                The level of leverage against the Nifty&apos;s next 13 weeks correlates at <b>{a.correlation.levelVsFwd13 ?? '—'}</b>
                {a.correlation.levelVsFwd13 != null && (a.correlation.levelVsFwd13 < -0.1 ? ': higher leverage has tended to precede weaker returns, though the link is modest.' : a.correlation.levelVsFwd13 > 0.1 ? ': higher leverage has tended to precede stronger returns.' : ': no meaningful link to forward returns.')}
              </p>
            </Insight>
          </div>

          {/* ── Chart 1: levels ──────────────────────────────────────────────── */}
          <Panel title="MTF, futures OI and combined leverage" note="₹ lakh crore, weekly (last trading day of each week).">
            <ChartBox h="h-72">
              {({ width, height }) => (
                <LineChart width={width} height={height} data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={v => v.toFixed(1)} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={l => `Week ending ${fmtWeek(String(l))}`} formatter={v => `₹${Number(v).toFixed(2)} lakh Cr`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="mtfL" name="MTF book" stroke={C.mtf} dot={false} strokeWidth={2} />
                  <Line isAnimationActive={false} type="monotone" dataKey="futL" name="Futures OI" stroke={C.fut} dot={false} strokeWidth={2} />
                  <Line isAnimationActive={false} type="monotone" dataKey="combL" name="Combined" stroke={C.combined} dot={false} strokeWidth={2.5} />
                </LineChart>
              )}
            </ChartBox>
          </Panel>

          {/* ── Chart 2: % of market cap ─────────────────────────────────────── */}
          <Panel title="Leverage as % of total market cap" note={`Combined leverage ÷ NSE market cap, with the Nifty 50 (right axis). Dashed line: the ${a.threshold.pct}th-percentile level used above.`}>
            <ChartBox h="h-72">
              {({ width, height }) => (
                <ComposedChart width={width} height={height} data={series} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="levFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.lev} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.lev} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="lev" tick={{ fontSize: 11 }} width={44} tickFormatter={v => `${v.toFixed(1)}%`} domain={['auto', 'auto']} />
                  <YAxis yAxisId="nifty" orientation="right" tick={{ fontSize: 11 }} width={48} domain={['auto', 'auto']} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={l => `Week ending ${fmtWeek(String(l))}`}
                    formatter={(v, name) => (name === 'Nifty 50' ? Math.round(Number(v)).toLocaleString('en-IN') : `${Number(v).toFixed(2)}%`)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine yAxisId="lev" y={a.threshold.level} stroke={C.lev} strokeDasharray="4 4" />
                  <Area isAnimationActive={false} yAxisId="lev" type="monotone" dataKey="levPct" name="Leverage % of mkt cap" stroke={C.lev} fill="url(#levFill)" strokeWidth={2} />
                  <Line isAnimationActive={false} yAxisId="nifty" type="monotone" dataKey="nifty" name="Nifty 50" stroke={C.nifty} dot={false} strokeWidth={1.5} />
                </ComposedChart>
              )}
            </ChartBox>
          </Panel>

          {/* Full-width rows: 262 weekly bars need the width, and a chart beside another can keep
              the full-row width it measured before the grid split, spilling over its neighbour. */}
          <div className="space-y-5">
            {/* ── Chart 3: dominance ─────────────────────────────────────────── */}
            <Panel title="MTF vs futures OI dominance" note="Share of combined leverage each week.">
              <ChartBox h="h-64">
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={series} barCategoryGap={0} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="week" tickFormatter={tickWeek} minTickGap={40} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={46} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={l => `Week ending ${fmtWeek(String(l))}`} formatter={v => `${Number(v).toFixed(1)}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar isAnimationActive={false} dataKey="mtfShare" name="MTF" stackId="s" fill={C.mtf} />
                    <Bar isAnimationActive={false} dataKey="futShare" name="Futures OI" stackId="s" fill={C.fut} />
                  </BarChart>
                )}
              </ChartBox>
            </Panel>

            {/* ── Chart 4: heatmap ───────────────────────────────────────────── */}
            <Panel title="Leverage intensity — last 52 weeks" note={`Pale = the year's lowest week, red = its highest. Hover a cell for where it sits in ${a.years} years of history (this year: ${a.rank.levPct >= 80 ? 'near the top' : 'mid-range'}).`}>
              <div className="space-y-1.5">
                {heatRows.map(r => (
                  <div key={r.label} className="grid grid-cols-[88px_1fr] items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{r.label}</span>
                    <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${r.cells.length}, minmax(0, 1fr))` }}>
                      {r.cells.map(c => (
                        <div key={c.week} className="h-7 rounded-[2px]" style={{ background: heat(c.p) }}
                          title={`${fmtWeek(c.week)} · ${r.fmt(c.v)} · higher than ${Math.round(c.p5y)}% of the last ${a.years} years`} />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-[88px_1fr] gap-2 pt-1">
                  <span />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{heatRows[0]?.cells[0] && tickWeek(heatRows[0].cells[0].week)}</span>
                    <span className="flex items-center gap-1">low <span className="h-2 w-16 rounded" style={{ background: `linear-gradient(90deg, ${heat(0)}, ${heat(50)}, ${heat(100)})` }} /> high</span>
                    <span>{heatRows[0]?.cells.at(-1) && tickWeek(heatRows[0].cells.at(-1)!.week)}</span>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <MoreCharts history={h} range={RANGES[range]} />
          <LeverageTables history={h} />

          {/* ── Sources ──────────────────────────────────────────────────────── */}
          <footer className="text-[11px] text-muted-foreground space-y-1">
            <p>
              <b>Method.</b> Combined leverage = MTF funded book (NSE + BSE) + futures OI notional (Σ open interest × settlement price across stock and index futures on NSE;
              options and BSE derivatives are excluded). Market cap is NSE&apos;s official month-end figure and latest daily reading, with weeks in between moved by the Nifty 500.
              Built {fmtWeek(h.generatedAt.slice(0, 10))} by a scheduled job on the office PC.
            </p>
            <p className="flex flex-wrap gap-x-3">
              <span>MTF data: <a className="underline" href="https://indiamtf.com" target="_blank" rel="noopener noreferrer">IndiaMTF.com <ExternalLink className="inline size-2.5" /></a></span>
              <span>Futures OI: NSE F&amp;O bhavcopy</span>
              <span>Market cap: NSE</span>
              <span>Nifty 50 / 500: Yahoo Finance</span>
            </p>
          </footer>
        </>)}
      </div>
    </div>
  );
}
