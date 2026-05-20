import type { OptionStrike } from './dhan-api';

// ── Max Pain ──────────────────────────────────────────────────────────────────

export function calcMaxPain(strikes: OptionStrike[]): number {
  let minPain = Infinity;
  let maxPainStrike = 0;
  for (const target of strikes) {
    const sp = target.strikePrice;
    let pain = 0;
    for (const s of strikes) {
      pain += Math.max(0, sp - s.strikePrice) * s.ce.oi;
      pain += Math.max(0, s.strikePrice - sp) * s.pe.oi;
    }
    if (pain < minPain) { minPain = pain; maxPainStrike = sp; }
  }
  return maxPainStrike;
}

// ── PCR ───────────────────────────────────────────────────────────────────────

export function calcPCR(strikes: OptionStrike[]): number {
  const putOI  = strikes.reduce((a, s) => a + s.pe.oi, 0);
  const callOI = strikes.reduce((a, s) => a + s.ce.oi, 0);
  return callOI > 0 ? +(putOI / callOI).toFixed(2) : 0;
}

export function calcStrikePCR(s: OptionStrike): number {
  return s.ce.oi > 0 ? +(s.pe.oi / s.ce.oi).toFixed(2) : 0;
}

// ── Delta OI ─────────────────────────────────────────────────────────────────

export interface DeltaOIRow {
  strikePrice: number;
  callDelta: number;
  callDeltaOI: number;
  putDelta: number;
  putDeltaOI: number;
  netDeltaOI: number;
}

export function calcDeltaOI(strikes: OptionStrike[]): DeltaOIRow[] {
  return strikes.map(s => {
    const callDeltaOI = +(s.ce.delta * s.ce.oi).toFixed(0);
    const putDeltaOI  = +(s.pe.delta * s.pe.oi).toFixed(0);
    return {
      strikePrice: s.strikePrice,
      callDelta:   +s.ce.delta.toFixed(3),
      callDeltaOI,
      putDelta:    +s.pe.delta.toFixed(3),
      putDeltaOI,
      netDeltaOI:  callDeltaOI + putDeltaOI,
    };
  });
}

// ── ATM detection ─────────────────────────────────────────────────────────────

export function findAtmIndex(strikes: OptionStrike[], spot: number): number {
  if (strikes.length === 0) return 0;
  if (spot <= 0) return Math.floor(strikes.length / 2);
  return strikes.reduce((best, s, idx) =>
    Math.abs(s.strikePrice - spot) < Math.abs(strikes[best].strikePrice - spot) ? idx : best, 0);
}

// ── OI Change classification ──────────────────────────────────────────────────

export type OISignal = 'Long Build-up' | 'Short Build-up' | 'Long Unwinding' | 'Short Covering' | 'Neutral';

export function classifyOIChange(oiChange: number, priceChange: number): OISignal {
  if (oiChange > 0 && priceChange > 0) return 'Long Build-up';
  if (oiChange > 0 && priceChange < 0) return 'Short Build-up';
  if (oiChange < 0 && priceChange > 0) return 'Long Unwinding';
  if (oiChange < 0 && priceChange < 0) return 'Short Covering';
  return 'Neutral';
}

// ── Top strikes by OI ─────────────────────────────────────────────────────────

export interface TopStrike {
  strikePrice: number;
  oi: number;
  oiChange: number;
  ltp: number;
}

export function topCallStrikes(strikes: OptionStrike[], n = 5): TopStrike[] {
  return [...strikes]
    .sort((a, b) => b.ce.oi - a.ce.oi)
    .slice(0, n)
    .map(s => ({ strikePrice: s.strikePrice, oi: s.ce.oi, oiChange: s.ce.oiChange, ltp: s.ce.ltp }));
}

export function topPutStrikes(strikes: OptionStrike[], n = 5): TopStrike[] {
  return [...strikes]
    .sort((a, b) => b.pe.oi - a.pe.oi)
    .slice(0, n)
    .map(s => ({ strikePrice: s.strikePrice, oi: s.pe.oi, oiChange: s.pe.oiChange, ltp: s.pe.ltp }));
}

// ── ATM zone PCR (nearest N strikes either side) ─────────────────────────────

export function calcATMZonePCR(strikes: OptionStrike[], atmStrike: number, range = 5): number {
  const sorted   = [...strikes].sort((a, b) => Math.abs(a.strikePrice - atmStrike) - Math.abs(b.strikePrice - atmStrike));
  const zone     = sorted.slice(0, range * 2 + 1);
  const putOI  = zone.reduce((a, s) => a + s.pe.oi, 0);
  const callOI = zone.reduce((a, s) => a + s.ce.oi, 0);
  return callOI > 0 ? +(putOI / callOI).toFixed(2) : 0;
}

// ── OI distribution % ─────────────────────────────────────────────────────────

export interface OIDistRow {
  strikePrice: number;
  callOI: number;
  callPct: number;
  putOI: number;
  putPct: number;
  isMaxPain: boolean;
}

export function calcOIDistribution(strikes: OptionStrike[], maxPainStrike: number): OIDistRow[] {
  const totalCall = strikes.reduce((a, s) => a + s.ce.oi, 0) || 1;
  const totalPut  = strikes.reduce((a, s) => a + s.pe.oi, 0) || 1;
  return strikes.map(s => ({
    strikePrice: s.strikePrice,
    callOI:  s.ce.oi,
    callPct: +((s.ce.oi / totalCall) * 100).toFixed(1),
    putOI:   s.pe.oi,
    putPct:  +((s.pe.oi / totalPut)  * 100).toFixed(1),
    isMaxPain: s.strikePrice === maxPainStrike,
  }));
}

// ── OI interpretation (top 10 active strikes) ────────────────────────────────

export interface OIInterpRow {
  strikePrice: number;
  side: 'CE' | 'PE';
  oi: number;
  oiChange: number;
  ltp: number;
  ltpChange: number;
  signal: OISignal;
}

export function calcOIInterpretation(strikes: OptionStrike[]): OIInterpRow[] {
  const rows: OIInterpRow[] = [];
  for (const s of strikes) {
    if (s.ce.oi > 0) {
      rows.push({
        strikePrice: s.strikePrice,
        side: 'CE',
        oi: s.ce.oi,
        oiChange: s.ce.oiChange,
        ltp: s.ce.ltp,
        ltpChange: 0,
        signal: classifyOIChange(s.ce.oiChange, s.ce.ltp),
      });
    }
    if (s.pe.oi > 0) {
      rows.push({
        strikePrice: s.strikePrice,
        side: 'PE',
        oi: s.pe.oi,
        oiChange: s.pe.oiChange,
        ltp: s.pe.ltp,
        ltpChange: 0,
        signal: classifyOIChange(s.pe.oiChange, s.pe.ltp),
      });
    }
  }
  return rows.sort((a, b) => b.oi - a.oi).slice(0, 10);
}
