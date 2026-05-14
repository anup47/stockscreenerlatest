// ── Types ─────────────────────────────────────────────────────────────────────

export type OptionType = 'CE' | 'PE';
export type Action     = 'BUY' | 'SELL';

export interface StrategyLeg {
  id:         number;
  action:     Action;
  optionType: OptionType;
  strike:     number;
  premium:    number;
  lots:       number;
  lotSize:    number;
}

export interface PayoffRow {
  price:    number;
  pnl:      number;
  pnlPct:   number;
  status:   'profit' | 'loss' | 'breakeven';
}

export interface StrategyMetrics {
  maxProfit:   number | 'Unlimited';
  maxLoss:     number | 'Unlimited';
  breakevens:  number[];
  netPremium:  number;
  rrRatio:     string;
}

// ── Strategy templates ────────────────────────────────────────────────────────

export type StrategyName =
  | 'Long Call'
  | 'Long Put'
  | 'Bull Call Spread'
  | 'Bear Put Spread'
  | 'Long Straddle'
  | 'Long Strangle'
  | 'Iron Condor'
  | 'Covered Call'
  | 'Protective Put'
  | 'Bull Put Spread'
  | 'Bear Call Spread'
  | 'Long Butterfly';

export function buildLegs(strategy: StrategyName, spot: number, lotSize: number): StrategyLeg[] {
  const atm  = Math.round(spot / 50) * 50;
  const step = atm >= 20000 ? 100 : 50;
  let id = 1;
  const leg = (action: Action, optionType: OptionType, strike: number, premium = 0): StrategyLeg =>
    ({ id: id++, action, optionType, strike, premium, lots: 1, lotSize });

  switch (strategy) {
    case 'Long Call':       return [leg('BUY',  'CE', atm)];
    case 'Long Put':        return [leg('BUY',  'PE', atm)];
    case 'Bull Call Spread':return [leg('BUY',  'CE', atm), leg('SELL', 'CE', atm + step)];
    case 'Bear Put Spread': return [leg('BUY',  'PE', atm), leg('SELL', 'PE', atm - step)];
    case 'Long Straddle':   return [leg('BUY',  'CE', atm), leg('BUY',  'PE', atm)];
    case 'Long Strangle':   return [leg('BUY',  'CE', atm + step), leg('BUY', 'PE', atm - step)];
    case 'Iron Condor':     return [
      leg('SELL', 'PE', atm - step),
      leg('BUY',  'PE', atm - step * 2),
      leg('SELL', 'CE', atm + step),
      leg('BUY',  'CE', atm + step * 2),
    ];
    case 'Covered Call':    return [leg('SELL', 'CE', atm + step)];
    case 'Protective Put':  return [leg('BUY',  'PE', atm - step)];
    case 'Bull Put Spread': return [leg('SELL', 'PE', atm), leg('BUY', 'PE', atm - step)];
    case 'Bear Call Spread':return [leg('SELL', 'CE', atm), leg('BUY', 'CE', atm + step)];
    case 'Long Butterfly':  return [
      leg('BUY',  'CE', atm - step),
      leg('SELL', 'CE', atm, 0),
      leg('SELL', 'CE', atm, 0),
      leg('BUY',  'CE', atm + step),
    ];
    default: return [];
  }
}

// ── Payoff at expiry ──────────────────────────────────────────────────────────

export function legPayoffAtExpiry(leg: StrategyLeg, price: number): number {
  const { action, optionType, strike, premium, lots, lotSize } = leg;
  const intrinsic = optionType === 'CE'
    ? Math.max(0, price - strike)
    : Math.max(0, strike - price);

  const pnlPerUnit = action === 'BUY'
    ? intrinsic - premium
    : premium - intrinsic;

  return pnlPerUnit * lots * lotSize;
}

export function totalPayoff(legs: StrategyLeg[], price: number): number {
  return legs.reduce((sum, leg) => sum + legPayoffAtExpiry(leg, price), 0);
}

export function generatePayoffTable(legs: StrategyLeg[], spot: number): PayoffRow[] {
  const netPremium = calcNetPremium(legs);
  const rows: PayoffRow[] = [];
  const step = spot >= 20000 ? 500 : spot >= 5000 ? 200 : 100;
  const range = spot >= 20000 ? 5000 : 2000;

  for (let price = Math.max(0, spot - range); price <= spot + range; price += step) {
    const pnl    = totalPayoff(legs, price);
    const pnlPct = netPremium !== 0 ? +(pnl / Math.abs(netPremium) * 100).toFixed(1) : 0;
    rows.push({
      price,
      pnl:    +pnl.toFixed(2),
      pnlPct,
      status: Math.abs(pnl) < 0.01 ? 'breakeven' : pnl > 0 ? 'profit' : 'loss',
    });
  }
  return rows;
}

// ── Net premium / cost ────────────────────────────────────────────────────────

export function calcNetPremium(legs: StrategyLeg[]): number {
  return legs.reduce((sum, leg) => {
    const cost = leg.premium * leg.lots * leg.lotSize;
    return sum + (leg.action === 'BUY' ? -cost : cost);
  }, 0);
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export function calcMetrics(legs: StrategyLeg[], spot: number): StrategyMetrics {
  const netPremium = calcNetPremium(legs);
  const rows = generatePayoffTable(legs, spot);
  const pnls = rows.map(r => r.pnl);

  const maxPnl = Math.max(...pnls);
  const minPnl = Math.min(...pnls);

  // Check if edges are still moving (open-ended)
  const firstPnl = pnls[0];
  const lastPnl  = pnls[pnls.length - 1];
  const maxProfit: number | 'Unlimited' = lastPnl > maxPnl * 0.9 || firstPnl > maxPnl * 0.9 ? 'Unlimited' : +maxPnl.toFixed(2);
  const maxLoss:   number | 'Unlimited' = lastPnl < minPnl * 0.9 || firstPnl < minPnl * 0.9 ? 'Unlimited' : +minPnl.toFixed(2);

  // Breakevens: sign changes in payoff
  const breakevens: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].pnl * rows[i].pnl <= 0) {
      breakevens.push(Math.round((rows[i - 1].price + rows[i].price) / 2));
    }
  }

  let rrRatio = '—';
  if (typeof maxProfit === 'number' && typeof maxLoss === 'number' && maxLoss < 0) {
    const rr = +(maxProfit / Math.abs(maxLoss)).toFixed(2);
    rrRatio = `1 : ${rr}`;
  }

  return { maxProfit, maxLoss, breakevens, netPremium: +netPremium.toFixed(2), rrRatio };
}
