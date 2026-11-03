// ── Input types (mirror the API response shapes) ──────────────────────────────

export interface ScreenerInput {
  symbol:     string;
  company:    string;
  price:      number;
  score:      number;           // 0-12
  stage2:     boolean;
  rsVsNifty:  number | null;
  rsi:        number | null;
  vcp:        boolean;
  bbSqueeze:  boolean;
  tradeSetup: { action: 'BUY' | 'WATCH' | 'AVOID' };
}

export interface OptionsInput {
  symbol:            string;
  company:           string;
  price:             number;
  direction:         'CALL' | 'PUT';
  score:             number;    // 0-100
  confidence:        'Strong' | 'Moderate' | 'Watchlist';
  reasons:           string[];
  riskFlags:         string[];
}

export interface TriangleInput {
  symbol:             string;
  company:            string;
  price:              number;
  totalScore:         number;   // 0-12
  isAboveResistance:  boolean;
  breakoutDistPct:    number;
  rsiStatus:          string;
  macdStatus:         string;
}

export interface OIBuildupInput {
  symbol:      string;
  category:    'lb' | 'sb' | 'sc' | 'lu';
  changePct:   number;
  oiChangePct: number;
  oi:          number;
}

export interface OIScreenInput {
  symbol:       string;
  netOIChgPct:  number;
  ceOIChg:      number;
  peOIChg:      number;
  totalOI:      number;
}

// BTST — closing-breakout engine (9 components, bullish next-day signal)
export interface BtstInput {
  symbol:      string;
  company:     string;
  price:       number;
  score:       number;          // 0-100
  conviction:  'Very High' | 'High' | 'Medium' | 'Low';
  volumeRatio: number;
  changePct:   number;
  fnoSignal:   string;
}

// STBT — closing-breakdown engine (9 components, bearish next-day signal)
export interface StbtInput {
  symbol:      string;
  company:     string;
  price:       number;
  score:       number;
  conviction:  'Very High' | 'High' | 'Medium' | 'Low';
  volumeRatio: number;
  changePct:   number;
  fnoSignal:   string;
}

// Big Player Tracker screener — NSE trade size / delivery / volume footprint (−5…+5 daily, conviction composite)
export interface BigPlayerInput {
  symbol:      string;
  company:     string;
  price:       number;
  conviction:  number;          // + accumulation, − distribution (see lib/big-player.ts conviction())
  avg5:        number;
  acc10:       number;          // strong buying days in last 10
  dist10:      number;          // strong selling days in last 10
  deal5:       number;          // net named bulk/block deals, ₹ Cr, last 5 sessions
}

// Research Targets — in-house research reports
export interface ResearchInput {
  symbol:         string;
  company:        string;
  price:          number;
  stance:         'ACCUMULATE' | 'WATCH' | 'AVOID';
  target:         number | null;
  expectedReturn: number;        // % from live price to avg(base, bull) target
  horizon:        string;
}

// 24H News — high-impact (≥3/5) company news on covered stocks, last 24 hours
export interface NewsInput {
  symbol:    string;
  positive:  number;
  negative:  number;
  headline:  string;            // most impactful headline in the net direction
}

// Commodity Tracker — metal signal passed to strongly linked Indian stocks
export interface CommodityLinkInput {
  symbol:   string;
  company:  string;
  metal:    string;
  signal:   'BUY' | 'SELL';
  score:    number;             // metal signal −10…+10
  corr:     number;             // weekly correlation with the metal in ₹, 2 years
}

export interface SummaryInputs {
  screener:   ScreenerInput[];
  options:    OptionsInput[];
  triangle:   TriangleInput[];
  oiBuildup:  OIBuildupInput[];
  oiScreen:   OIScreenInput[];  // empty if no Dhan creds
  btst:       BtstInput[];      // empty if user hasn't run BTST scan today
  stbt:       StbtInput[];      // empty if user hasn't run STBT scan today
  bigPlayer?: BigPlayerInput[]; // |conviction| ≥ 2, turnover ≥ ₹5 Cr/day
  research?:  ResearchInput[];
  news?:      NewsInput[];      // empty when the news feed is older than 36 h
  commodity?: CommodityLinkInput[];
}

// ── Weight configuration — tune all scoring here ──────────────────────────────

export const SUMMARY_WEIGHTS = {
  // Long contributors
  screenerBuyHigh:      2.5,   // Screener BUY, score ≥ 8
  screenerBuyMed:       1.5,   // Screener BUY, score 5-7
  screenerWatch:        0.5,   // Screener WATCH
  optionsCallStrong:    3.0,
  optionsCallModerate:  2.0,
  optionsCallWatchlist: 1.0,
  triangleBreakout:     2.5,   // isAboveResistance
  triangleNear:         1.5,   // breakoutDistPct ≤ 3%
  oiLB:                 3.0,   // Long Buildup
  oiSC:                 1.5,   // Short Covering
  oiScreenBull:         2.0,   // netOIChgPct > 3
  btstVeryHigh:         3.0,   // BTST score ≥ 80
  btstHigh:             2.0,   // BTST score 65-79
  btstMedium:           1.0,   // BTST score 50-64

  // Short contributors
  optionsPutStrong:     3.0,
  optionsPutModerate:   2.0,
  optionsPutWatchlist:  1.0,
  oiSB:                 3.0,   // Short Buildup
  oiLU:                 2.0,   // Long Unwinding
  oiScreenBear:         2.0,   // netOIChgPct < -3
  stbtVeryHigh:         3.0,   // STBT score ≥ 80
  stbtHigh:             2.0,   // STBT score 65-79
  stbtMedium:           1.0,   // STBT score 50-64

  // Newer tabs (both directions unless noted)
  bigPlayerStrong:      2.5,   // Big Players conviction ≥ 3 (≤ −3 short)
  bigPlayer:            1.5,   // Big Players conviction ≥ 2 (≤ −2 short)
  researchHigh:         1.5,   // ACCUMULATE with expected return ≥ 30% (long only)
  researchMed:          1.0,   // ACCUMULATE with expected return ≥ 15% (long only)
  researchAvoid:        1.0,   // AVOID stance or price ≥ 5% above target (short only)
  newsNet:              1.0,   // net high-impact positive (negative) company news, last 24 h
  commodityLink:        1.0,   // metal BUY (SELL) signal, stock correlation ≥ 0.4

  // Conflict penalties
  penaltyOIvsPrice:     1.5,
  penaltyStrongBoth:    2.0,

  // Magnitude bonuses (proportional)
  oiMagnitudeMax:       1.0,   // up to +1 based on |oiChangePct| vs peers
  optionsScoreBonus:    0.5,   // up to +0.5 based on options score/100
} as const;

// Max possible scores (sum of all contributors + bonuses per direction)
const MAX_LONG  = 2.5 + 3.0 + 2.5 + 3.0 + 1.5 + 2.0 + 1.0 + 0.5 + 3.0   // = 19.0 (original tabs)
                + 2.5 + 1.5 + 1.0 + 1.0;                                 // + Big Players, Research, News, Commodity = 25.0
const MAX_SHORT = 3.0 + 3.0 + 2.0 + 2.0 + 0.5 + 3.0                     // = 15.5 (original tabs)
                + 2.5 + 1.0 + 1.0 + 1.0;                                 // + Big Players, Research, News, Commodity = 21.0

// ── Per-symbol evidence bag ───────────────────────────────────────────────────

interface Evidence {
  symbol:   string;
  company:  string;
  isIndex:  boolean;

  screener?:  ScreenerInput;
  options?:   OptionsInput;
  triangle?:  TriangleInput;
  oiBuildup?: OIBuildupInput;
  oiScreen?:  OIScreenInput;
  btst?:      BtstInput;
  stbt?:      StbtInput;
  bigPlayer?: BigPlayerInput;
  research?:  ResearchInput;
  news?:      NewsInput;
  commodity?: CommodityLinkInput;
}

// ── Output types ──────────────────────────────────────────────────────────────

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TabContribution {
  tab:       string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  metric:    string;
  weight:    number;
}

export interface SummaryPick {
  rank:             number;
  symbol:           string;
  company:          string;
  direction:        'LONG' | 'SHORT';
  isIndex:          boolean;
  rawScore:         number;
  displayScore:     number;       // 0.0-10.0
  confidence:       ConfidenceBand;
  supportingTabs:   number;
  opposingTabs:     number;
  badges:           string[];
  explanation:      string;
  contributions:    TabContribution[];
  positives:        string[];
  negatives:        string[];
  price:            number;
}

// ── Badge constants ───────────────────────────────────────────────────────────

const NSE_INDEX_SET = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']);

// ── Core scoring function ─────────────────────────────────────────────────────

function scoreEvidence(ev: Evidence, allOIBuildupChanges: number[]): {
  longRaw:   number;
  shortRaw:  number;
  contribs:  TabContribution[];
  positives: string[];
  negatives: string[];
} {
  const W = SUMMARY_WEIGHTS;
  let longRaw  = 0;
  let shortRaw = 0;
  const contribs:  TabContribution[] = [];
  const positives: string[] = [];
  const negatives: string[] = [];

  // ── Screener ────────────────────────────────────────────────────────────────
  if (ev.screener) {
    const s = ev.screener;
    if (s.tradeSetup.action === 'BUY') {
      const w = s.score >= 8 ? W.screenerBuyHigh : W.screenerBuyMed;
      longRaw += w;
      contribs.push({ tab: 'Screener', direction: 'LONG', metric: `Score ${s.score}/12 (${s.tradeSetup.action})`, weight: w });
      positives.push(`Stage 2 setup — score ${s.score}/12${s.vcp ? ', VCP pattern' : ''}${s.rsVsNifty != null && s.rsVsNifty > 0 ? `, RS vs Nifty +${s.rsVsNifty?.toFixed(1)}%` : ''}`);
    } else if (s.tradeSetup.action === 'WATCH') {
      longRaw += W.screenerWatch;
      contribs.push({ tab: 'Screener', direction: 'LONG', metric: `Score ${s.score}/12 (WATCH)`, weight: W.screenerWatch });
      positives.push(`Developing Stage 2 setup — score ${s.score}/12`);
    }
  }

  // ── Options Screen ──────────────────────────────────────────────────────────
  if (ev.options) {
    const o = ev.options;
    if (o.direction === 'CALL') {
      const w = o.confidence === 'Strong'    ? W.optionsCallStrong
              : o.confidence === 'Moderate'  ? W.optionsCallModerate
              : W.optionsCallWatchlist;
      const bonus = (o.score / 100) * W.optionsScoreBonus;
      longRaw += w + bonus;
      contribs.push({ tab: 'Very Short Term', direction: 'LONG', metric: `CALL ${o.confidence} (score ${o.score})`, weight: +(w + bonus).toFixed(2) });
      positives.push(`Options: ${o.confidence} CALL signal — ${o.reasons.slice(0, 2).join('; ')}`);
      if (o.riskFlags.length) negatives.push(`Options risk flags: ${o.riskFlags.slice(0, 2).join('; ')}`);
    } else {
      const w = o.confidence === 'Strong'    ? W.optionsPutStrong
              : o.confidence === 'Moderate'  ? W.optionsPutModerate
              : W.optionsPutWatchlist;
      const bonus = (o.score / 100) * W.optionsScoreBonus;
      shortRaw += w + bonus;
      contribs.push({ tab: 'Very Short Term', direction: 'SHORT', metric: `PUT ${o.confidence} (score ${o.score})`, weight: +(w + bonus).toFixed(2) });
      positives.push(`Options: ${o.confidence} PUT signal — ${o.reasons.slice(0, 2).join('; ')}`);
      if (o.riskFlags.length) negatives.push(`Options risk flags: ${o.riskFlags.slice(0, 2).join('; ')}`);
    }
  }

  // ── Triangle ────────────────────────────────────────────────────────────────
  if (ev.triangle) {
    const t = ev.triangle;
    if (t.isAboveResistance && t.totalScore >= 6) {
      longRaw += W.triangleBreakout;
      contribs.push({ tab: 'Triangle', direction: 'LONG', metric: `Breakout confirmed, score ${t.totalScore}/12`, weight: W.triangleBreakout });
      positives.push(`Triangle breakout confirmed — ${t.macdStatus} MACD, ${t.rsiStatus} RSI`);
    } else if (!t.isAboveResistance && t.breakoutDistPct <= 3 && t.totalScore >= 6) {
      longRaw += W.triangleNear;
      contribs.push({ tab: 'Triangle', direction: 'LONG', metric: `Near breakout ${t.breakoutDistPct.toFixed(1)}% away, score ${t.totalScore}/12`, weight: W.triangleNear });
      positives.push(`Triangle near-breakout — ${t.breakoutDistPct.toFixed(1)}% from resistance`);
    }
  }

  // ── OI Buildup ──────────────────────────────────────────────────────────────
  if (ev.oiBuildup) {
    const oi = ev.oiBuildup;
    const allAbs   = allOIBuildupChanges.filter(v => v > 0);
    const maxAbs   = allAbs.length ? Math.max(...allAbs) : 1;
    const magnitudeBonus = (Math.abs(oi.oiChangePct) / maxAbs) * W.oiMagnitudeMax;

    if (oi.category === 'lb') {
      const w = W.oiLB + magnitudeBonus;
      longRaw += w;
      contribs.push({ tab: 'OI Buildup', direction: 'LONG', metric: `Long Buildup — OI ${oi.oiChangePct >= 0 ? '+' : ''}${oi.oiChangePct.toFixed(1)}%, Price ${oi.changePct >= 0 ? '+' : ''}${oi.changePct.toFixed(2)}%`, weight: +w.toFixed(2) });
      positives.push(`Fresh Long Buildup — price up ${oi.changePct.toFixed(2)}%, futures OI up ${oi.oiChangePct.toFixed(1)}%`);
    } else if (oi.category === 'sc') {
      const w = W.oiSC + magnitudeBonus * 0.5;
      longRaw += w;
      contribs.push({ tab: 'OI Buildup', direction: 'LONG', metric: `Short Covering — OI ${oi.oiChangePct.toFixed(1)}%, Price +${oi.changePct.toFixed(2)}%`, weight: +w.toFixed(2) });
      positives.push(`Short Covering — price rising while shorts exit`);
    } else if (oi.category === 'sb') {
      const w = W.oiSB + magnitudeBonus;
      shortRaw += w;
      contribs.push({ tab: 'OI Buildup', direction: 'SHORT', metric: `Short Buildup — OI +${oi.oiChangePct.toFixed(1)}%, Price ${oi.changePct.toFixed(2)}%`, weight: +w.toFixed(2) });
      negatives.push(`Fresh Short Buildup — price falling ${oi.changePct.toFixed(2)}%, new short positions entering`);
    } else if (oi.category === 'lu') {
      const w = W.oiLU + magnitudeBonus * 0.5;
      shortRaw += w;
      contribs.push({ tab: 'OI Buildup', direction: 'SHORT', metric: `Long Unwinding — OI ${oi.oiChangePct.toFixed(1)}%, Price ${oi.changePct.toFixed(2)}%`, weight: +w.toFixed(2) });
      negatives.push(`Long Unwinding — longs exiting, price falling`);
    }
  }

  // ── OI Screen ───────────────────────────────────────────────────────────────
  if (ev.oiScreen) {
    const os = ev.oiScreen;
    if (os.netOIChgPct > 3) {
      longRaw += W.oiScreenBull;
      contribs.push({ tab: 'OI Screen', direction: 'LONG', metric: `Net OI Chg +${os.netOIChgPct.toFixed(1)}% (PE > CE buildup)`, weight: W.oiScreenBull });
      positives.push(`Option OI Screen: PE OI building faster than CE (+${os.netOIChgPct.toFixed(1)}%) — support signal`);
    } else if (os.netOIChgPct < -3) {
      shortRaw += W.oiScreenBear;
      contribs.push({ tab: 'OI Screen', direction: 'SHORT', metric: `Net OI Chg ${os.netOIChgPct.toFixed(1)}% (CE > PE buildup)`, weight: W.oiScreenBear });
      negatives.push(`Option OI Screen: CE OI building faster than PE (${os.netOIChgPct.toFixed(1)}%) — resistance signal`);
    }
  }

  // ── BTST — closing breakout engine (next-day long signal) ───────────────────
  if (ev.btst) {
    const b = ev.btst;
    const w = b.conviction === 'Very High' ? W.btstVeryHigh
            : b.conviction === 'High'      ? W.btstHigh
            : b.conviction === 'Medium'    ? W.btstMedium
            : 0;
    if (w > 0) {
      longRaw += w;
      contribs.push({
        tab: 'BTST', direction: 'LONG',
        metric: `${b.conviction} conviction, score ${b.score}/100, vol ${b.volumeRatio.toFixed(1)}x`,
        weight: w,
      });
      positives.push(
        `BTST breakout — ${b.conviction} conviction (score ${b.score}), volume ${b.volumeRatio.toFixed(1)}x avg` +
        (b.fnoSignal !== 'None' ? `, F&O: ${b.fnoSignal}` : ''),
      );
    }
  }

  // ── STBT — closing breakdown engine (next-day short signal) ─────────────────
  if (ev.stbt) {
    const s = ev.stbt;
    const w = s.conviction === 'Very High' ? W.stbtVeryHigh
            : s.conviction === 'High'      ? W.stbtHigh
            : s.conviction === 'Medium'    ? W.stbtMedium
            : 0;
    if (w > 0) {
      shortRaw += w;
      contribs.push({
        tab: 'STBT', direction: 'SHORT',
        metric: `${s.conviction} conviction, score ${s.score}/100, vol ${s.volumeRatio.toFixed(1)}x`,
        weight: w,
      });
      negatives.push(
        `STBT breakdown — ${s.conviction} conviction (score ${s.score}), volume ${s.volumeRatio.toFixed(1)}x avg` +
        (s.fnoSignal !== 'None' ? `, F&O: ${s.fnoSignal}` : ''),
      );
    }
  }

  // ── Big Players — institutional footprint over the last 5–20 sessions ───────
  if (ev.bigPlayer) {
    const b = ev.bigPlayer, abs = Math.abs(b.conviction);
    const w = abs >= 3 ? W.bigPlayerStrong : abs >= 2 ? W.bigPlayer : 0;
    const deals = b.deal5 ? `, net bulk/block deals ${b.deal5 > 0 ? '+' : ''}₹${b.deal5.toFixed(0)} Cr` : '';
    if (w > 0 && b.conviction > 0) {
      longRaw += w;
      contribs.push({ tab: 'Big Players', direction: 'LONG', metric: `Conviction +${b.conviction.toFixed(1)}, ${b.acc10} strong buying days in 10`, weight: w });
      positives.push(`Big players accumulating — conviction +${b.conviction.toFixed(1)}, 5-day avg ${b.avg5 >= 0 ? '+' : ''}${b.avg5.toFixed(1)}${deals}`);
    } else if (w > 0) {
      shortRaw += w;
      contribs.push({ tab: 'Big Players', direction: 'SHORT', metric: `Conviction ${b.conviction.toFixed(1)}, ${b.dist10} strong selling days in 10`, weight: w });
      negatives.push(`Big players distributing — conviction ${b.conviction.toFixed(1)}, 5-day avg ${b.avg5.toFixed(1)}${deals}`);
    }
  }

  // ── Research Targets ────────────────────────────────────────────────────────
  if (ev.research) {
    const r = ev.research, er = r.expectedReturn;
    const tgt = r.target != null ? ` to ₹${r.target.toLocaleString('en-IN')}` : '';
    if (r.stance === 'ACCUMULATE' && er >= 15) {
      const w = er >= 30 ? W.researchHigh : W.researchMed;
      longRaw += w;
      contribs.push({ tab: 'Targets', direction: 'LONG', metric: `${r.stance}, expected return +${er.toFixed(0)}% (${r.horizon})`, weight: w });
      positives.push(`Research: ${r.stance}${tgt}, +${er.toFixed(0)}% expected over ${r.horizon}`);
    } else if (r.stance === 'AVOID' || er <= -5) {
      shortRaw += W.researchAvoid;
      contribs.push({ tab: 'Targets', direction: 'SHORT', metric: r.stance === 'AVOID' ? 'Research stance AVOID' : `Price ${Math.abs(er).toFixed(0)}% above target`, weight: W.researchAvoid });
      negatives.push(r.stance === 'AVOID' ? 'Research stance is AVOID' : `Research: price already ${Math.abs(er).toFixed(0)}% above the blended target${tgt}`);
    }
  }

  // ── 24H News ────────────────────────────────────────────────────────────────
  if (ev.news) {
    const n = ev.news, net = n.positive - n.negative;
    if (net > 0) {
      longRaw += W.newsNet;
      contribs.push({ tab: '24H News', direction: 'LONG', metric: `${n.positive} positive vs ${n.negative} negative high-impact`, weight: W.newsNet });
      positives.push(`News: ${n.headline}`);
    } else if (net < 0) {
      shortRaw += W.newsNet;
      contribs.push({ tab: '24H News', direction: 'SHORT', metric: `${n.negative} negative vs ${n.positive} positive high-impact`, weight: W.newsNet });
      negatives.push(`News: ${n.headline}`);
    }
  }

  // ── Commodity link ──────────────────────────────────────────────────────────
  if (ev.commodity) {
    const c = ev.commodity, dir = c.signal === 'BUY' ? 'LONG' : 'SHORT';
    const metric = `${c.metal} ${c.signal} ${c.score > 0 ? '+' : ''}${c.score}, correlation ${c.corr.toFixed(2)}`;
    if (dir === 'LONG') { longRaw += W.commodityLink; positives.push(`Commodity: ${metric}`); }
    else { shortRaw += W.commodityLink; negatives.push(`Commodity: ${metric}`); }
    contribs.push({ tab: 'Commodities', direction: dir, metric, weight: W.commodityLink });
  }

  // ── Conflict penalties ───────────────────────────────────────────────────────
  const hasStrongLong  = longRaw  >= 3.0;
  const hasStrongShort = shortRaw >= 3.0;
  if (hasStrongLong && hasStrongShort) {
    longRaw  -= W.penaltyStrongBoth;
    shortRaw -= W.penaltyStrongBoth;
  } else if (longRaw > 0 && shortRaw > 0) {
    longRaw  -= W.penaltyOIvsPrice;
    shortRaw -= W.penaltyOIvsPrice;
  }

  return {
    longRaw:  Math.max(0, longRaw),
    shortRaw: Math.max(0, shortRaw),
    contribs,
    positives,
    negatives,
  };
}

function inferBadges(ev: Evidence, longRaw: number, shortRaw: number, supportingTabs: number): string[] {
  const badges: string[] = [];
  if (ev.oiBuildup?.category === 'lb') badges.push('Fresh Long Buildup');
  if (ev.oiBuildup?.category === 'sc') badges.push('Short Covering');
  if (ev.oiBuildup?.category === 'sb') badges.push('Fresh Short Buildup');
  if (ev.oiBuildup?.category === 'lu') badges.push('Long Unwinding');
  if (ev.btst && (ev.btst.conviction === 'Very High' || ev.btst.conviction === 'High'))
    badges.push('BTST Setup');
  if (ev.stbt && (ev.stbt.conviction === 'Very High' || ev.stbt.conviction === 'High'))
    badges.push('STBT Breakdown');
  if (ev.bigPlayer && ev.bigPlayer.conviction >= 3)  badges.push('Big Player Accumulation');
  if (ev.bigPlayer && ev.bigPlayer.conviction <= -3) badges.push('Big Player Distribution');
  if (ev.research?.stance === 'ACCUMULATE' && ev.research.expectedReturn >= 30) badges.push('Research Upside');
  if (supportingTabs >= 3) badges.push('Multi-Tab Confirmed');
  const isHighConflict = longRaw > MAX_LONG * 0.4 && shortRaw > MAX_SHORT * 0.4;
  if (isHighConflict)                   badges.push('High Conflict');
  else if (longRaw > 0 && shortRaw > 0) badges.push('Mixed Signals');
  return badges;
}

function calcConfidence(supportingTabs: number, totalTabsWithData: number, isHighConflict: boolean, hasStrongSignal: boolean): ConfidenceBand {
  if (totalTabsWithData === 0) return 'LOW';
  const breadth = supportingTabs / totalTabsWithData;
  let score = breadth;
  if (isHighConflict) score *= 0.4;
  if (hasStrongSignal) score = Math.min(1, score * 1.3);
  if (score >= 0.65) return 'HIGH';
  if (score >= 0.38) return 'MEDIUM';
  return 'LOW';
}

function generateExplanation(ev: Evidence, direction: 'LONG' | 'SHORT', positives: string[], negatives: string[]): string {
  const parts: string[] = [];
  if (direction === 'LONG') {
    if (ev.screener?.tradeSetup.action === 'BUY')
      parts.push(`${ev.symbol} is in a Stage 2 uptrend with a ${ev.screener.score}/12 screener score`);
    if (ev.triangle?.isAboveResistance)
      parts.push(`confirmed triangle breakout`);
    else if (ev.triangle && ev.triangle.breakoutDistPct <= 3)
      parts.push(`approaching triangle resistance (${ev.triangle.breakoutDistPct.toFixed(1)}% away)`);
    if (ev.btst && ev.btst.conviction !== 'Low')
      parts.push(`${ev.btst.conviction.toLowerCase()} BTST breakout setup (score ${ev.btst.score}, vol ${ev.btst.volumeRatio.toFixed(1)}x)`);
    if (ev.oiBuildup?.category === 'lb')
      parts.push(`fresh long buildup in futures (OI +${ev.oiBuildup.oiChangePct.toFixed(1)}%)`);
    if (ev.oiBuildup?.category === 'sc')
      parts.push(`short covering underway in futures`);
    if (ev.options?.direction === 'CALL')
      parts.push(`${ev.options.confidence.toLowerCase()} call signal from options screener`);
    if (ev.oiScreen && ev.oiScreen.netOIChgPct > 3)
      parts.push(`PE OI building faster than CE in option chain`);
    if (ev.bigPlayer && ev.bigPlayer.conviction >= 2)
      parts.push(`big players accumulating (conviction +${ev.bigPlayer.conviction.toFixed(1)})`);
    if (ev.research?.stance === 'ACCUMULATE' && ev.research.expectedReturn >= 15)
      parts.push(`research target implies +${ev.research.expectedReturn.toFixed(0)}%`);
    if (ev.news && ev.news.positive > ev.news.negative)
      parts.push(`positive high-impact news in the last 24 h`);
    if (ev.commodity?.signal === 'BUY')
      parts.push(`${ev.commodity.metal.toLowerCase()} signal is BUY`);
  } else {
    if (ev.stbt && ev.stbt.conviction !== 'Low')
      parts.push(`${ev.stbt.conviction.toLowerCase()} STBT breakdown setup (score ${ev.stbt.score}, vol ${ev.stbt.volumeRatio.toFixed(1)}x)`);
    if (ev.oiBuildup?.category === 'sb')
      parts.push(`fresh short buildup in futures (OI +${ev.oiBuildup.oiChangePct.toFixed(1)}%)`);
    if (ev.oiBuildup?.category === 'lu')
      parts.push(`long unwinding in futures`);
    if (ev.options?.direction === 'PUT')
      parts.push(`${ev.options.confidence.toLowerCase()} put signal from options screener`);
    if (ev.oiScreen && ev.oiScreen.netOIChgPct < -3)
      parts.push(`CE OI building faster than PE — resistance signal`);
    if (ev.bigPlayer && ev.bigPlayer.conviction <= -2)
      parts.push(`big players distributing (conviction ${ev.bigPlayer.conviction.toFixed(1)})`);
    if (ev.research && (ev.research.stance === 'AVOID' || ev.research.expectedReturn <= -5))
      parts.push(ev.research.stance === 'AVOID' ? `research stance is AVOID` : `price is above the research target`);
    if (ev.news && ev.news.negative > ev.news.positive)
      parts.push(`negative high-impact news in the last 24 h`);
    if (ev.commodity?.signal === 'SELL')
      parts.push(`${ev.commodity.metal.toLowerCase()} signal is SELL`);
  }
  const pos = parts.join(', ');
  const neg = negatives.length ? ` Caution: ${negatives[0].toLowerCase()}.` : '';
  return pos
    ? `${pos.charAt(0).toUpperCase()}${pos.slice(1)}.${neg}`
    : `${ev.symbol} has moderate ${direction.toLowerCase()} evidence from ${positives.length} signal(s).${neg}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildSummary(inputs: SummaryInputs): { longs: SummaryPick[]; shorts: SummaryPick[] } {
  const evMap = new Map<string, Evidence>();

  const ensure = (sym: string, company = '', isIndex = NSE_INDEX_SET.has(sym)) => {
    if (!evMap.has(sym)) evMap.set(sym, { symbol: sym, company, isIndex });
    return evMap.get(sym)!;
  };

  for (const s of inputs.screener)  ensure(s.symbol, s.company).screener  = s;
  for (const o of inputs.options)   ensure(o.symbol, o.company).options   = o;
  for (const t of inputs.triangle)  ensure(t.symbol, t.company).triangle  = t;
  for (const b of inputs.oiBuildup) {
    const ev = ensure(b.symbol, evMap.get(b.symbol)?.company ?? b.symbol);
    ev.oiBuildup = b;
  }
  for (const os of inputs.oiScreen) {
    const ev = ensure(os.symbol, evMap.get(os.symbol)?.company ?? os.symbol);
    ev.oiScreen = os;
  }
  for (const b of inputs.btst) {
    const ev = ensure(b.symbol, b.company);
    ev.btst = b;
  }
  for (const s of inputs.stbt) {
    const ev = ensure(s.symbol, s.company);
    ev.stbt = s;
  }
  for (const b of inputs.bigPlayer ?? []) ensure(b.symbol, b.company).bigPlayer = b;
  for (const r of inputs.research ?? [])  ensure(r.symbol, r.company).research  = r;
  for (const n of inputs.news ?? [])      ensure(n.symbol, evMap.get(n.symbol)?.company ?? n.symbol).news = n;
  for (const c of inputs.commodity ?? []) ensure(c.symbol, c.company).commodity = c;

  const allOIChanges = inputs.oiBuildup.map(b => Math.abs(b.oiChangePct));

  const longs:  SummaryPick[] = [];
  const shorts: SummaryPick[] = [];

  for (const ev of evMap.values()) {
    const { longRaw, shortRaw, contribs, positives, negatives } = scoreEvidence(ev, allOIChanges);
    if (longRaw === 0 && shortRaw === 0) continue;

    const tabsWithData = [
      ev.screener, ev.options, ev.triangle, ev.oiBuildup, ev.oiScreen, ev.btst, ev.stbt,
      ev.bigPlayer, ev.research, ev.news, ev.commodity,
    ].filter(Boolean).length;

    const buildPick = (direction: 'LONG' | 'SHORT', rawScore: number): SummaryPick => {
      const supporting = contribs.filter(c => c.direction === direction || c.direction === 'NEUTRAL').length;
      const opposing   = contribs.filter(c => (direction === 'LONG' ? c.direction === 'SHORT' : c.direction === 'LONG')).length;
      const isHighConflict = longRaw > MAX_LONG * 0.4 && shortRaw > MAX_SHORT * 0.4;
      const hasStrong  = rawScore >= 3.0;
      const badges     = inferBadges(ev, longRaw, shortRaw, supporting);
      const confidence = calcConfidence(supporting, tabsWithData, isHighConflict, hasStrong);
      const displayScore = Math.min(10, +(rawScore / (direction === 'LONG' ? MAX_LONG : MAX_SHORT) * 10).toFixed(1));
      const explanation  = generateExplanation(ev, direction, positives, negatives);
      return {
        rank: 0, symbol: ev.symbol, company: ev.company, direction, isIndex: ev.isIndex,
        rawScore: +rawScore.toFixed(3), displayScore,
        confidence, supportingTabs: supporting, opposingTabs: opposing,
        badges, explanation, contributions: contribs,
        positives: direction === 'LONG' ? positives : negatives,
        negatives: direction === 'LONG' ? negatives : positives,
        price: ev.screener?.price ?? ev.options?.price ?? ev.triangle?.price ?? ev.btst?.price ?? ev.stbt?.price ?? ev.bigPlayer?.price ?? ev.research?.price ?? 0,
      };
    };

    if (longRaw > 0)  longs.push(buildPick('LONG',  longRaw));
    if (shortRaw > 0) shorts.push(buildPick('SHORT', shortRaw));
  }

  const rank = (arr: SummaryPick[]) => {
    arr.sort((a, b) => b.rawScore - a.rawScore);
    arr.forEach((p, i) => { p.rank = i + 1; });
    return arr;
  };

  return { longs: rank(longs), shorts: rank(shorts) };
}
