import type { OptionType, Action } from './strategy-utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Position {
  id:          string;
  symbol:      string;
  expiry:      string;
  strike:      number;
  optionType:  OptionType;
  action:      Action;
  lots:        number;
  lotSize:     number;
  entryPremium: number;
  currentLTP:  number;
  addedAt:     string;
}

export interface PositionPnL extends Position {
  pnlPerLot:  number;
  totalPnL:   number;
  pnlPct:     number;
  investment: number;
}

const STORAGE_KEY = 'positions_v1';

// ── Lot sizes ─────────────────────────────────────────────────────────────────

export const LOT_SIZES: Record<string, number> = {
  NIFTY: 50, BANKNIFTY: 30, FINNIFTY: 40, MIDCPNIFTY: 75,
  RELIANCE: 250, TCS: 150, INFY: 300, HDFCBANK: 550,
  ICICIBANK: 1375, SBIN: 1500, AXISBANK: 1200, WIPRO: 1500,
  BAJFINANCE: 125, BAJAJFINSV: 125, KOTAKBANK: 400, HDFC: 300,
  LT: 175, ITC: 1600, MARUTI: 100, TITAN: 175, SUNPHARMA: 350,
};

export function getLotSize(symbol: string): number {
  return LOT_SIZES[symbol.toUpperCase()] ?? 50;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export function loadPositions(): Position[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Position[]) : [];
  } catch { return []; }
}

export function savePositions(positions: Position[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export function addPosition(p: Omit<Position, 'id' | 'addedAt' | 'currentLTP'>): Position {
  const positions = loadPositions();
  const newPos: Position = {
    ...p,
    id:         `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    currentLTP: p.entryPremium,
    addedAt:    new Date().toISOString(),
  };
  savePositions([...positions, newPos]);
  return newPos;
}

export function updateLTP(id: string, ltp: number): void {
  const positions = loadPositions();
  savePositions(positions.map(p => p.id === id ? { ...p, currentLTP: ltp } : p));
}

export function removePosition(id: string): void {
  savePositions(loadPositions().filter(p => p.id !== id));
}

// ── P&L calculation ───────────────────────────────────────────────────────────

export function calcPositionPnL(p: Position): PositionPnL {
  const pnlPerUnit = p.action === 'BUY'
    ? p.currentLTP  - p.entryPremium
    : p.entryPremium - p.currentLTP;

  const pnlPerLot  = pnlPerUnit * p.lotSize;
  const totalPnL   = pnlPerLot * p.lots;
  const investment = p.entryPremium * p.lotSize * p.lots;
  const pnlPct     = investment !== 0 ? +(totalPnL / investment * 100).toFixed(2) : 0;

  return { ...p, pnlPerLot: +pnlPerLot.toFixed(2), totalPnL: +totalPnL.toFixed(2), pnlPct, investment: +investment.toFixed(2) };
}

export function calcPortfolioSummary(positions: PositionPnL[]) {
  const totalInvested = positions.reduce((a, p) => a + Math.abs(p.investment), 0);
  const totalPnL      = positions.reduce((a, p) => a + p.totalPnL, 0);
  const netPnLPct     = totalInvested > 0 ? +(totalPnL / totalInvested * 100).toFixed(2) : 0;
  return { totalInvested: +totalInvested.toFixed(2), totalPnL: +totalPnL.toFixed(2), netPnLPct };
}
