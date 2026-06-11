import type { BtstResult } from './btst-engine';
import type { BacktestStats } from './backtest-engine';

export type { BacktestStats };

export interface HistoryScan {
  results:     BtstResult[];
  total:       number;
  niftyChange: number;
}

export interface BtstScreenData {
  results:      BtstResult[];
  total:        number;
  scanned:      number;
  niftyChange:  number;
  fetchedAt:    string;
  elapsedMs:    number;
  error?:       string;
  history?:     Record<string, HistoryScan>;
  historyDates?: string[];
  backtest?:    BacktestStats;
}
