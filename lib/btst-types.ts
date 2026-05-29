import type { BtstResult } from './btst-engine';

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
}
