export interface OIScreenerRow {
  symbol:      string;
  expiry:      string;
  ceOI:        number;
  peOI:        number;
  ceOIChg:     number;
  peOIChg:     number;
  netOIChg:    number;
  netOIChgPct: number;
  totalOI:     number;
}

export interface SymbolDebug {
  sym:     string;
  expiry:  string;
  status:  'ok' | 'api-error' | 'zero-oi' | 'no-strikes' | 'no-scrip';
  error?:  string;
  strikes?: number;
  totalOI?: number;
}
