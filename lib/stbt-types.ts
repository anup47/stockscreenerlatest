import type { StbtResult } from './stbt-engine';

export interface StbtHistoryScan {
  results:     StbtResult[];
  total:       number;
  niftyChange: number;
}

export interface StbtScreenData {
  results:       StbtResult[];
  total:         number;
  scanned:       number;
  niftyChange:   number;
  fetchedAt:     string;
  elapsedMs:     number;
  error?:        string;
  history?:      Record<string, StbtHistoryScan>;
  historyDates?: string[];
}
