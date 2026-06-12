'use client';

import { useState } from 'react';
import { ChevronDown, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BacktestStats } from '@/lib/backtest-engine';

function pct(n: number, dec = 2): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(dec)}%`;
}

function StatBox({
  label, value, sub, positive,
}: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="bg-muted/60 rounded-lg p-2.5 text-center">
      <p className="text-muted-foreground text-[10px] mb-1 uppercase tracking-wide">{label}</p>
      <p className={cn(
        'text-sm font-bold font-mono tabular-nums',
        positive === undefined ? 'text-foreground'
          : positive ? 'text-emerald-600' : 'text-red-500',
      )}>
        {value}
      </p>
      {sub && <p className="text-muted-foreground text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function ReliabilityBar({ winRate }: { winRate: number }) {
  const filled = Math.round(winRate / 10);
  const color  = winRate >= 60 ? 'bg-emerald-500' : winRate >= 50 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={cn('w-1.5 h-1.5 rounded-sm', i < filled ? color : 'bg-muted-foreground/20')} />
      ))}
    </div>
  );
}

export function BacktestPanel({ stats, title = 'Backtest (90D)' }: { stats: BacktestStats; title?: string }) {
  const [open,        setOpen]        = useState(false);
  const [showTrades,  setShowTrades]  = useState(false);

  if (!stats.totalTrades) return null;

  const winRateColor =
    stats.winRate >= 60 ? 'text-emerald-600'
    : stats.winRate >= 50 ? 'text-amber-600'
    : 'text-red-500';

  return (
    <div className="bg-muted/30 border border-border rounded-xl overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left gap-3"
      >
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <BarChart2 className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-bold text-foreground whitespace-nowrap">{title}</span>
          <span className="text-[10px] text-muted-foreground">{stats.totalTrades} trades</span>
          <span className={cn('text-[10px] font-semibold whitespace-nowrap', winRateColor)}>
            Win {stats.winRate.toFixed(1)}%
          </span>
          <span className={cn('text-[10px] font-semibold whitespace-nowrap',
            stats.avgReturn >= 0 ? 'text-emerald-600' : 'text-red-500'
          )}>
            Avg {pct(stats.avgReturn, 2)}
          </span>
          <span className={cn('text-[10px] font-semibold whitespace-nowrap',
            stats.totalReturn >= 0 ? 'text-emerald-600' : 'text-red-500'
          )}>
            Total {pct(stats.totalReturn, 1)}
          </span>
        </div>
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Summary stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatBox
              label="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              sub={`${stats.winTrades}W / ${stats.lossTrades}L`}
              positive={stats.winRate >= 50}
            />
            <StatBox
              label="Avg Return / Trade"
              value={pct(stats.avgReturn, 2)}
              positive={stats.avgReturn >= 0}
            />
            <StatBox
              label="Total Return"
              value={pct(stats.totalReturn, 1)}
              sub={`${stats.totalTrades} trades`}
              positive={stats.totalReturn >= 0}
            />
            <StatBox
              label="Profit Factor"
              value={stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
              positive={stats.profitFactor >= 1}
            />
          </div>

          {/* Secondary stats */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              Avg win:{' '}
              <span className="text-emerald-600 font-semibold">{pct(stats.avgWin, 2)}</span>
            </span>
            <span>
              Avg loss:{' '}
              <span className="text-red-500 font-semibold">{pct(stats.avgLoss, 2)}</span>
            </span>
            <span>
              Max consec wins:{' '}
              <span className="text-foreground font-semibold">{stats.maxConsecWins}</span>
            </span>
            <span>
              Max consec losses:{' '}
              <span className="text-foreground font-semibold">{stats.maxConsecLoss}</span>
            </span>
          </div>

          {/* Setup breakdown by conviction */}
          {stats.byConviction.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                Setup Breakdown
              </p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Setup / Conviction</th>
                    <th className="text-right py-1.5 pr-3 font-medium text-muted-foreground">Trades</th>
                    <th className="text-right py-1.5 pr-3 font-medium text-muted-foreground">Win %</th>
                    <th className="text-right py-1.5 pr-3 font-medium text-muted-foreground">Avg Ret</th>
                    <th className="text-right py-1.5 pr-2 font-medium text-muted-foreground">Total</th>
                    <th className="text-left py-1.5 pl-2 font-medium text-muted-foreground">Reliability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {stats.byConviction.map(c => (
                    <tr key={c.conviction}>
                      <td className="py-1.5 pr-3 font-semibold text-foreground">{c.conviction}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{c.trades}</td>
                      <td className={cn('py-1.5 pr-3 text-right tabular-nums font-semibold',
                        c.winRate >= 60 ? 'text-emerald-600' : c.winRate >= 50 ? 'text-amber-600' : 'text-red-500'
                      )}>
                        {c.winRate.toFixed(1)}%
                      </td>
                      <td className={cn('py-1.5 pr-3 text-right tabular-nums',
                        c.avgReturn >= 0 ? 'text-emerald-600' : 'text-red-500'
                      )}>
                        {pct(c.avgReturn, 2)}
                      </td>
                      <td className={cn('py-1.5 pr-2 text-right tabular-nums',
                        c.totalReturn >= 0 ? 'text-emerald-600' : 'text-red-500'
                      )}>
                        {pct(c.totalReturn, 1)}
                      </td>
                      <td className="py-1.5 pl-2">
                        <ReliabilityBar winRate={c.winRate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent trades toggle */}
          {stats.recentTrades.length > 0 && (
            <>
              <button
                onClick={() => setShowTrades(s => !s)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={cn('size-3 transition-transform', showTrades && 'rotate-180')} />
                {showTrades ? 'Hide' : 'Show'} last {stats.recentTrades.length} trades
              </button>

              {showTrades && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[520px] border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left  py-1.5 pr-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-left  py-1.5 pr-3 font-medium text-muted-foreground">Symbol</th>
                        <th className="text-right py-1.5 pr-3 font-medium text-muted-foreground">Score</th>
                        <th className="text-left  py-1.5 pr-3 font-medium text-muted-foreground">Conviction</th>
                        <th className="text-right py-1.5 pr-3 font-medium text-muted-foreground">Entry ₹</th>
                        <th className="text-right py-1.5 pr-3 font-medium text-muted-foreground">Exit ₹</th>
                        <th className="text-right py-1.5      font-medium text-muted-foreground">Return</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {stats.recentTrades.map((t, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="py-1 pr-3 text-muted-foreground font-mono">{t.date}</td>
                          <td className="py-1 pr-3 font-semibold">{t.symbol}</td>
                          <td className="py-1 pr-3 text-right tabular-nums font-mono">{t.score}</td>
                          <td className="py-1 pr-3 text-muted-foreground">{t.conviction}</td>
                          <td className="py-1 pr-3 text-right tabular-nums font-mono">
                            {t.entryClose.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums font-mono">
                            {t.nextClose.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={cn('py-1 text-right tabular-nums font-mono font-semibold',
                            t.isWin ? 'text-emerald-600' : 'text-red-500'
                          )}>
                            {pct(t.returnPct, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
