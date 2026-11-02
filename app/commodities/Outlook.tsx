'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, LineChart, Line, Legend } from 'recharts';
import ChartBox from '@/app/components/ChartBox';
import { cn } from '@/lib/utils';
import type { CommodityState } from '@/lib/commodities/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tip = { fontSize: 12, borderRadius: 8 };
const price = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 });
const signed = (v: number | null | undefined, unit = '%') => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}${unit}`);
export const SIGNAL_STYLE = { BUY: 'bg-emerald-600 text-white', SELL: 'bg-red-600 text-white', HOLD: 'bg-slate-500 text-white' } as const;

function Card({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 min-w-0', className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {note && <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

// Short-run signal breakdown and the 12-month scenario path.
export function Prediction({ c }: { c: CommodityState }) {
  const s = c.signal;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Short-run signal (1–7 days)" note="Rule-based score from −10 to +10. Inputs without a free source score zero and are marked n/a.">
          <div className="flex items-center gap-3">
            <span className={cn('rounded-md px-3 py-1 text-lg font-bold', SIGNAL_STYLE[s.label])}>{s.label}</span>
            <div>
              <div className="text-lg font-bold tabular-nums">{s.score > 0 ? '+' : ''}{s.score} <span className="text-xs font-normal text-muted-foreground">/ 10</span></div>
              <div className="text-xs text-muted-foreground">Confidence {s.confidence}% · 7-day range {price(s.range7d.low)}–{price(s.range7d.high)} {c.unit}</div>
            </div>
          </div>
          <table className="mt-3 w-full text-xs">
            <tbody className="divide-y divide-border/60">
              {s.components.map(x => (
                <tr key={x.name} className={cn(!x.available && 'text-muted-foreground')}>
                  <td className="py-1.5 pr-2 font-medium">{x.name}</td>
                  <td className="py-1.5 pr-2">{x.available ? x.detail : `n/a — ${x.detail}`}</td>
                  <td className={cn('py-1.5 text-right font-semibold tabular-nums', x.points > 0 ? 'text-emerald-600' : x.points < 0 ? 'text-red-600' : '')}>{x.points > 0 ? '+' : ''}{x.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted-foreground">BUY at +3 or more, SELL at −3 or less. Dollar, inventory and ETF moves score ±2; extreme speculator positioning ∓3 (contrarian). Not investment advice.</p>
        </Card>

        <Card title="12-month scenario path" note={`Monthly base case with a ±1σ range from one-year volatility. Drift = half the 10-year seasonal average + fundamental and macro tilts (fading after a quarter). Price in ${c.unit}.`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40"><tr>{['Month', 'Base', 'Range', 'vs now', 'Main driver', 'Key risk'].map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border/60">
                {c.forecast.map(f => (
                  <tr key={f.month}>
                    <td className="px-2 py-1.5 font-medium whitespace-nowrap">{f.month}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold">{price(f.base)}</td>
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap">{price(f.low)}–{price(f.high)}</td>
                    <td className={cn('px-2 py-1.5 tabular-nums', f.changePct >= 0 ? 'text-emerald-600' : 'text-red-600')}>{signed(f.changePct)}</td>
                    <td className="px-2 py-1.5">{f.driver}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{f.risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {c.code === 'ALUMINIUM' || c.code === 'ZINC'
              ? 'Surplus/deficit and China GDP have no free automated feed, so the model leans on LME stocks, the cash–3M spread and the dollar.'
              : 'Central-bank buying has no free automated feed, so the model leans on real yields, the dollar and speculator positioning.'} A transparent scenario, not a price target.
          </p>
        </Card>
    </div>
  );
}

// Seasonality, COT positioning, futures curve and premiums (Technical tab).
export function TechPanels({ c }: { c: CommodityState }) {
  const nextMonths = Array.from({ length: 12 }, (_, i) => {
    const m = (new Date(`${c.latest.date}T00:00:00Z`).getUTCMonth() + 1 + i) % 12;
    return { ...c.seasonal[m], label: MON[m] };
  });
  const cotData = (c.cot?.history ?? []).slice(-104).map(p => ({ date: p.date, spec: p.mmNet, comm: p.prodNet + p.swapNet }));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Seasonality — next 12 months" note="Average monthly return over the last 10 years; label shows how often the month was up.">
          <ChartBox h="h-60">
            {({ width, height }) => (
              <BarChart width={width} height={height} data={nextMonths} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={36} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tip} formatter={(v, _n, p) => [`${signed(Number(v))} avg · up ${(p.payload as { upPct: number }).upPct}% of ${(p.payload as { years: number }).years} yrs`, 'Return']} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar isAnimationActive={false} dataKey="avgRet">
                  {nextMonths.map(m => <Cell key={m.label} fill={m.avgRet >= 0 ? '#16a34a' : '#dc2626'} />)}
                </Bar>
              </BarChart>
            )}
          </ChartBox>
        </Card>

        {c.cot ? (
          <Card title="COT positioning — speculators vs commercials" note={`CFTC, weekly. Managed-money net long is at the ${c.cot.netPctile3y}th percentile of 3 years (≥90 crowded, ≤10 washed out). Report of ${c.cot.latest.date}.`}>
            <ChartBox h="h-60">
              {({ width, height }) => (
                <LineChart width={width} height={height} data={cotData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} tickFormatter={d => String(d).slice(0, 7)} />
                  <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip contentStyle={tip} formatter={v => Number(v).toLocaleString('en-US')} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Line isAnimationActive={false} dataKey="spec" name="Speculators (managed money net)" stroke="#6366f1" dot={false} strokeWidth={2} />
                  <Line isAnimationActive={false} dataKey="comm" name="Commercials (producer + swap net)" stroke="#d97706" dot={false} strokeWidth={2} />
                </LineChart>
              )}
            </ChartBox>
          </Card>
        ) : (
          <Card title="COT positioning" note="CFTC covers COMEX gold and silver. Zinc has no US futures market, and the US aluminium contract is the Midwest premium, so there is no comparable free COT series for LME base metals (LME's own COTR needs a data licence).">
            <div className="text-xs text-muted-foreground">Not available for {c.name}.</div>
          </Card>
        )}
      </div>

      <Card title="Futures curve and premiums">
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border border-border p-3">
            <div className="text-muted-foreground">{c.curve ? 'Term structure (annualised)' : 'LME cash–3M spread'}</div>
            {c.curve ? (
              <div className="mt-1"><span className="text-lg font-bold">{signed(c.curve.annualisedPct)}</span> <span className="capitalize">{c.curve.structure}</span>
                <div className="text-muted-foreground mt-0.5">{c.curve.front.symbol} {price(c.curve.front.price)} → {c.curve.next.symbol} {price(c.curve.next.price)}</div></div>
            ) : (
              <div className="mt-1"><span className="text-lg font-bold">{signed(c.history.at(-1)?.cash3mPct)}</span> {(c.history.at(-1)?.cash3mPct ?? 0) > 0 ? 'Backwardation (tight)' : 'Contango (ample)'}
                <div className="text-muted-foreground mt-0.5">Cash {price(c.history.at(-1)?.lmeCash ?? 0)} vs 3M {price(c.history.at(-1)?.lme3m ?? 0)} USD/t</div></div>
            )}
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-muted-foreground">MCX premium vs {c.curve ? 'COMEX' : 'LME'}</div>
            <div className="mt-1 font-semibold">Not available yet</div>
            <div className="text-muted-foreground mt-0.5">Needs the live MCX quote (possible through your Dhan API).</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-muted-foreground">{c.code === 'GOLD' || c.code === 'SILVER' ? 'SGE premium to London' : 'SHFE vs LME arbitrage'}</div>
            <div className="mt-1 font-semibold">Not available free</div>
            <div className="text-muted-foreground mt-0.5">{c.code === 'GOLD' || c.code === 'SILVER' ? 'Shanghai Gold Exchange pages are script-rendered.' : 'SHFE removed its stable public data endpoint.'}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
