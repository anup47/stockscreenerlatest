export interface BacktestTrade {
  date:       string;
  symbol:     string;
  company:    string;
  score:      number;
  conviction: 'Very High' | 'High' | 'Medium' | 'Low';
  entryClose: number;
  nextClose:  number;
  returnPct:  number;
  isWin:      boolean;
}

export interface ConvictionStats {
  conviction:  string;
  trades:      number;
  wins:        number;
  winRate:     number;
  avgReturn:   number;
  totalReturn: number;
}

export interface BacktestStats {
  totalTrades:   number;
  winTrades:     number;
  lossTrades:    number;
  winRate:       number;
  avgReturn:     number;
  totalReturn:   number;
  avgWin:        number;
  avgLoss:       number;
  profitFactor:  number;
  maxConsecWins: number;
  maxConsecLoss: number;
  byConviction:  ConvictionStats[];
  recentTrades:  BacktestTrade[];
}

type Conviction = 'Very High' | 'High' | 'Medium' | 'Low';

export function computeBacktestStats(trades: BacktestTrade[]): BacktestStats {
  if (!trades.length) {
    return {
      totalTrades: 0, winTrades: 0, lossTrades: 0,
      winRate: 0, avgReturn: 0, totalReturn: 0,
      avgWin: 0, avgLoss: 0, profitFactor: 0,
      maxConsecWins: 0, maxConsecLoss: 0,
      byConviction: [], recentTrades: [],
    };
  }

  const wins   = trades.filter(t => t.isWin);
  const losses = trades.filter(t => !t.isWin);
  const sum    = (arr: BacktestTrade[]) => arr.reduce((s, t) => s + t.returnPct, 0);

  const avgWin    = wins.length   ? sum(wins)   / wins.length   : 0;
  const avgLoss   = losses.length ? sum(losses) / losses.length : 0;
  const grossWin  = Math.abs(avgWin  * wins.length);
  const grossLoss = Math.abs(avgLoss * losses.length);
  const profitFactor = grossLoss > 0
    ? grossWin / grossLoss
    : grossWin > 0 ? 99.9 : 0;

  // max consecutive wins/losses, sorted chronologically then by score within a day
  const sorted = [...trades].sort((a, b) =>
    a.date.localeCompare(b.date) || b.score - a.score,
  );
  let maxConsecWins = 0, maxConsecLoss = 0, cur = 0, lastSign = 0;
  for (const t of sorted) {
    const sign = t.isWin ? 1 : -1;
    if (sign === lastSign) { cur++; }
    else { cur = 1; lastSign = sign; }
    if (sign ===  1) maxConsecWins = Math.max(maxConsecWins, cur);
    if (sign === -1) maxConsecLoss = Math.max(maxConsecLoss, cur);
  }

  const CONVICTIONS: Conviction[] = ['Very High', 'High', 'Medium', 'Low'];
  const byConviction: ConvictionStats[] = CONVICTIONS
    .map(c => {
      const ct = trades.filter(t => t.conviction === c);
      const cw = ct.filter(t => t.isWin);
      return {
        conviction:  c as string,
        trades:      ct.length,
        wins:        cw.length,
        winRate:     ct.length ? (cw.length / ct.length) * 100 : 0,
        avgReturn:   ct.length ? sum(ct) / ct.length : 0,
        totalReturn: sum(ct),
      };
    })
    .filter(c => c.trades > 0);

  const recentTrades = [...trades]
    .sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score)
    .slice(0, 20);

  return {
    totalTrades:  trades.length,
    winTrades:    wins.length,
    lossTrades:   losses.length,
    winRate:      (wins.length / trades.length) * 100,
    avgReturn:    sum(trades) / trades.length,
    totalReturn:  sum(trades),
    avgWin, avgLoss, profitFactor,
    maxConsecWins, maxConsecLoss,
    byConviction, recentTrades,
  };
}
