'use client';
import React, { useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Copy, Check, ChevronDown, ChevronUp, AlertTriangle, Calendar, Shield } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
type TrafficLight = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'DEEP_RED' | 'BLUE';
type Direction = 'improving' | 'deteriorating' | 'neutral' | 'unavailable';
type Signal = 'BUY' | 'ADD' | 'HOLD' | 'TRIM' | 'AVOID' | 'HEDGE';

interface Indicator {
  name: string; latest: string; change1m: string; change3m: string;
  signal: TrafficLight; direction: Direction;
  yellowThreshold: string; orangeThreshold: string; redThreshold: string;
  whyItMatters: string; source: string; frequency: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
}
interface AllocationItem {
  asset: string; current: string; prev: string; change: string;
  reason: string; keyRisk: string; type: 'core' | 'tactical' | 'hedge' | 'avoid' | 'speculative';
}
interface ActionItem {
  asset: string; signal: Signal; range: string; trigger: string;
  invalidation: string; horizon: string; mainRisk: string; indiaRoute: string;
}
interface Alert {
  name: string; status: 'OFF' | 'WATCH' | 'ACTIVE' | 'CONFIRMED';
  triggeredPoints: string[]; action: string; watchNext: string; cancel: string;
}
interface Scenario {
  name: 'Base' | 'Bull' | 'Bear'; probability: number;
  description: string; triggers: string; scoreRange: string; implication: string;
}
interface Hedge {
  objective: string; instrument: string; underlying: string; maxAllocation: string;
  maxLoss: string; carryCost: string; entryTrigger: string; exitTrigger: string;
  expiry: string; doNotUseWhen: string;
}
interface RiskReport {
  reportDate: string; score: number; scorePrevWeek: number | null; scorePrevMonth: number | null;
  trafficLight: TrafficLight; regime: string; regimeConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  executiveSummary: string[];
  pillarScores: { ai: number; equity: number; credit: number; macro: number; crossAsset: number; india: number };
  pillars: Record<string, Indicator[]>;
  allocation: AllocationItem[]; actions: ActionItem[]; alerts: Alert[];
  scenarios: Scenario[]; hedges: Hedge[];
  upcomingEvents: { date: string; event: string; relevance: string }[];
  topPositive: string[]; topNegative: string[];
}

// ─── Factory ─────────────────────────────────────────────────────────────────
function mkInd(name: string, source: string, frequency: string, yT: string, oT: string, rT: string, why: string): Indicator {
  return {
    name, latest: '⚠ UPDATE REQUIRED', change1m: '—', change3m: '—',
    signal: 'YELLOW', direction: 'unavailable', confidence: 'UNAVAILABLE',
    yellowThreshold: yT, orangeThreshold: oT, redThreshold: rT,
    whyItMatters: why, source, frequency,
  };
}

// ─── Data ────────────────────────────────────────────────────────────────────
const REPORT: RiskReport = {
  reportDate: '2026-09-30', score: 42, scorePrevWeek: null, scorePrevMonth: null,
  trafficLight: 'YELLOW',
  regime: 'AI Valuation Elevated — Fundamentals Holding But Capex ROI Scrutiny Rising',
  regimeConfidence: 'LOW',
  executiveSummary: [
    '⚠ FRAMEWORK BASELINE — Risk score of 42 (YELLOW) is a structural placeholder; all indicator values require manual weekly update before trading decisions.',
    '⚠ FRAMEWORK BASELINE — Regime confidence is LOW; the regime label reflects qualitative consensus as of August 2025, not live market data.',
    '⚠ FRAMEWORK BASELINE — Hyperscaler AI capex figures are from Q2 2025 reports; latest quarterly earnings must be pulled and entered.',
    '⚠ FRAMEWORK BASELINE — Equity valuation metrics (Nasdaq P/E, SOX/SPX ratio, breadth) require fresh Bloomberg/FactSet pull as of report date.',
    '⚠ FRAMEWORK BASELINE — Credit spread and VIX data (FRED, CBOE) require daily update; stale data will produce misleading signals.',
    '⚠ FRAMEWORK BASELINE — Macro indicators (CPI, PMI, real yields) lag by 1–4 weeks; confirm latest BLS/ISM/FRED releases before scoring.',
    '⚠ FRAMEWORK BASELINE — Cross-asset 3M momentum signals require current closing prices from Yahoo Finance for QQQ, BTC-USD, BZ=F, GC=F.',
    '⚠ FRAMEWORK BASELINE — India pillar (FPI flows, India VIX, Nifty IT relative, SIP data) requires daily NSDL/NSE/AMFI refresh.',
    '⚠ FRAMEWORK BASELINE — Asset allocation ranges are YELLOW-regime defaults; re-validate after populating all indicators.',
    '⚠ FRAMEWORK BASELINE — Run the weekly update prompt at the bottom of this page to populate real data and compute a live risk score.',
  ],
  pillarScores: { ai: 10, equity: 9, credit: 8, macro: 7, crossAsset: 4, india: 4 },
  pillars: {
    ai: [
      mkInd('Hyperscaler AI Capex (annualised, $B)', 'Quarterly earnings (MSFT/GOOGL/AMZN/META/ORCL)', 'Quarterly',
        '>$250B combined annualised', '>$300B or guidance cuts ≥10%', 'Guidance cut >20% or capex freeze',
        'The single largest leading indicator of AI infrastructure demand; a capex pause cascades into NVDA/AMD orders, data centre occupancy, and Indian IT deal pipelines.'),
      mkInd('Capex vs Revenue Growth (ratio)', 'Bloomberg / company filings', 'Quarterly',
        'Capex/Rev ratio >40%', '>50% or diverging from revenue trajectory', 'Capex rising while revenue growth decelerates materially',
        'A rising capex-to-revenue ratio without matching monetisation signals bubble conditions; the market will eventually re-rate AI multiples downward.'),
      mkInd('Cloud Revenue Growth YoY', 'Azure / AWS / GCP quarterly earnings', 'Quarterly',
        '<25% YoY', '<20% YoY', '<15% YoY or guidance below 18%',
        'Cloud growth is the monetisation proxy for AI capex; deceleration shows up as Indian IT deal deferrals and global SaaS multiple compression.'),
      mkInd('GPU / Semiconductor Revenue Growth', 'NVDA / AMD quarterly earnings', 'Quarterly',
        'NVDA guidance miss >5%', 'NVDA miss >10% or AMD share gains sharply', 'NVDA revenue decline QoQ; data centre segment down',
        'The GPU supply chain is the clearest real-time signal of AI demand; inventory build or booking cancellations precede any AI capex pullback by 1–2 quarters.'),
      mkInd('Data Centre Vacancy Rate', 'CBRE / JLL real estate reports', 'Quarterly',
        'Vacancy rising from historic lows', 'Vacancy >10% nationally / new supply outpacing take-up', 'Vacancy >15% or major developer cancellations',
        'Rising vacancy in primary hyperscale markets signals over-investment and compresses pricing power for power/land landlords.'),
      mkInd('AI VC Funding & IPO Pipeline ($B)', 'PitchBook / CB Insights', 'Monthly',
        'AI VC down >20% QoQ', 'Down >40% QoQ or seed-stage freeze', 'AI VC collapses >60% or major fund write-downs',
        'VC funding is a leading sentiment indicator; a pull-back in early-stage AI investment historically precedes public market de-rating by 6–9 months.'),
    ],
    equity: [
      mkInd('Nasdaq 100 Forward P/E', 'FactSet / Bloomberg', 'Daily',
        '>28× fwd P/E', '>32× fwd P/E', '>36× or P/E expands while EPS estimates cut',
        'The primary valuation anchor for tech; P/E above 32× coincides with elevated drawdown risk on any negative macro or earnings surprise.'),
      mkInd('SOX vs S&P 500 Relative Performance (3M)', 'Bloomberg / Yahoo Finance', 'Daily',
        'SOX +15% vs SPX', 'SOX +25% vs SPX', 'SOX +35% vs SPX or vertical blow-off',
        'Extreme semiconductor outperformance signals speculative positioning; mean-reversion can be violent and hits Indian IT companies with semis exposure.'),
      mkInd('S&P 500 Equal-Weight vs Cap-Weight (RSP/SPY)', 'Bloomberg / Yahoo Finance', 'Daily',
        'RSP/SPY declining for 8+ weeks', 'RSP/SPY at 52-week lows', 'RSP/SPY breaking multi-year support',
        'Breadth narrowing to mega-cap AI names is a classic late-cycle signal; Indian markets with FPI exposure mirror this concentration risk.'),
      mkInd('% S&P 500 Stocks Above 200-DMA', 'barchart.com', 'Daily',
        '<55%', '<45%', '<35%',
        'Breadth below 45% while index holds near highs is a major divergence warning; rapid decline to <35% often precedes forced selling that spills into EM.'),
      mkInd('AI/Tech ETF Flows (weekly, $B)', 'ETF.com / Bloomberg', 'Weekly',
        'Outflows for 2 consecutive weeks', 'Outflows >$2B/week for 4 weeks', 'Outflows >$5B/week or sector rotation confirmed',
        'Sustained institutional outflows from AI/tech ETFs signal de-risking; India FPI flows historically follow US tech flows with a 2–4 week lag.'),
      mkInd('Top-10 Weight in S&P 500 (%)', 'SSGA / Bloomberg', 'Monthly',
        '>32% top-10 weight', '>35%', '>38% or top-3 names >20%',
        'Index concentration above 35% makes the market vulnerable to index-level drawdowns from just 2–3 stocks; passive Indian funds with global sleeves absorb this shock directly.'),
    ],
    credit: [
      mkInd('US HY Credit Spread (OAS, bps)', 'ICE BofA / FRED', 'Daily',
        '>450 bps', '>550 bps', '>700 bps',
        'HY spreads are the best real-time risk-appetite barometer; widening above 550 bps triggers forced deleveraging in EM equities including India.'),
      mkInd('US IG Credit Spread (OAS, bps)', 'ICE BofA / FRED', 'Daily',
        '>130 bps', '>160 bps', '>200 bps',
        'IG spread widening signals balance-sheet stress in investment-grade tech companies; funding costs rise and capex plans get deferred.'),
      mkInd('VIX', 'CBOE', 'Daily',
        '>22', '>28', '>35',
        'VIX above 28 triggers India VIX spike and FPI equity outflows; above 35 correlates with Nifty drawdowns of 10%+ within 30 trading days.'),
      mkInd('MOVE Index (bond volatility)', 'Bloomberg', 'Daily',
        '>120', '>140', '>160',
        'Elevated bond volatility increases the discount rate for long-duration AI equities; MOVE above 140 with rising yields compresses Nasdaq and Indian IT valuations simultaneously.'),
      mkInd('DXY (USD Index)', 'Yahoo Finance (DX-Y.NYB)', 'Daily',
        'DXY >104', 'DXY >107', 'DXY >110',
        'USD strength pressures USD/INR, increases India\'s oil import bill, and signals risk-off capital flows back to the US — all negative for Indian equities.'),
      mkInd('US Yield Curve (10Y minus Fed Funds, bps)', 'FRED', 'Daily',
        'Inverted or <0 bps', 'Deeply inverted <-50 bps', 'Re-steepening from inversion >+50 bps rapidly',
        'Rapid re-steepening from inversion has historically preceded the sharpest equity drawdowns as rate cuts imply economic distress.'),
    ],
    macro: [
      mkInd('US 10Y Real Yield (TIPS, %)', 'FRED (DFII10)', 'Daily',
        '>2.0%', '>2.5%', '>3.0%',
        'Real yields above 2.5% are structurally negative for high-multiple AI equities; every 50 bps increase reduces the DCF value of a 30× P/E stock by ~15%.'),
      mkInd('US CPI YoY (%)', 'BLS / FRED', 'Monthly',
        '>3.5% YoY', '>4.0% YoY', '>5.0% or re-acceleration',
        'CPI re-acceleration delays Fed rate cuts, keeps real yields elevated, pressures AI equity multiples, and strengthens USD — triple headwind for Indian markets.'),
      mkInd('US ISM Manufacturing PMI', 'ISM', 'Monthly',
        '<48 (contraction)', '<46', '<44 or new orders below 42',
        'PMI below 46 signals broad corporate capex cuts; sustained below 44 has preceded every major risk-off episode since 2000.'),
      mkInd('Data Centre Power Cost ($/MWh)', 'EIA', 'Monthly',
        '>$80/MWh average US commercial', '>$100/MWh or 20% YoY increase', '>$120/MWh or power availability constraints',
        'Power cost is the key long-run constraint on AI data centre ROI; rising electricity prices compress margins for hyperscalers and may slow capex.'),
      mkInd('Copper Price ($/mt)', 'Yahoo Finance (HG=F)', 'Daily',
        'Down >15% from recent high', 'Down >25%', 'Down >35% or breakdown below 5Y support',
        'Copper is the broadest global growth barometer; a sharp decline signals demand destruction that historically precedes EM equity outflows including from India.'),
      mkInd('USD/INR', 'Yahoo Finance (USDINR=X)', 'Daily',
        '>84.5', '>86.0', '>88.0',
        'INR depreciation above 86 increases import inflation, constrains RBI easing, and signals FPI outflows — directly pressuring Nifty valuations.'),
    ],
    crossAsset: [
      mkInd('Nasdaq 100 (QQQ) vs 3M-ago (%)', 'Yahoo Finance (QQQ)', 'Daily',
        '<-5% over 3M', '<-12%', '<-20%',
        'QQQ 3M momentum is the primary AI bull/bear trend signal; a sustained >12% drawdown triggers institutional risk models and forces systematic selling.'),
      mkInd('Gold in INR vs 3M-ago (%)', 'MCX / Yahoo Finance', 'Daily',
        '>+8% over 3M (risk-off)', '>+15%', '>+25% (flight to safety confirmed)',
        'Gold outperforming strongly in INR signals risk-off positioning; a 15%+ 3M move coincides historically with Nifty stress periods.'),
      mkInd('US 10Y Treasury Yield vs 3M-ago (bps)', 'FRED', 'Daily',
        '>+50 bps over 3M', '>+80 bps', '>+100 bps rapid rise',
        'Rapid yield increases compress AI equity valuations; a 100 bps spike over 3 months is consistent with multiple compressions that cascade into EM outflows.'),
      mkInd('Bitcoin vs 3M-ago (%)', 'Yahoo Finance (BTC-USD)', 'Daily',
        '<-25% over 3M', '<-40%', '<-55% or exchange stress',
        'Bitcoin is the highest-beta risk-on asset; a 40%+ 3M decline signals broad de-risking that spills into growth equities and EM markets within 4–8 weeks.'),
      mkInd('Brent Crude vs 3M-ago (%)', 'Yahoo Finance (BZ=F)', 'Daily',
        '>+20% over 3M', '>+35%', '>+50% or supply shock',
        'A sharp oil spike of >35% compresses India\'s current account, weakens INR, forces fiscal tightening, and raises data centre energy costs.'),
      mkInd('Cross-Asset Signal Pattern', 'Derived from above 5 indicators', 'Weekly',
        '2 of 5 in ORANGE zone', '3 of 5 in ORANGE or 1 in RED', '3+ in RED or all pointing risk-off',
        'When most cross-asset indicators simultaneously deteriorate, correlations spike toward 1 and there is no diversification benefit — all assets fall together.'),
    ],
    india: [
      mkInd('FPI Net Equity Flows (INR Cr, MTD)', 'NSDL / SEBI website', 'Daily',
        'MTD outflows >-₹5,000 Cr', 'MTD outflows >-₹15,000 Cr', 'MTD outflows >-₹30,000 Cr',
        'FPI equity flows are the most direct transmission of global AI/tech risk into Indian markets; sustained large outflows precede Nifty drawdowns and INR weakness.'),
      mkInd('Nifty IT vs Nifty 50 Relative (3M, %)', 'NSE / Yahoo Finance', 'Daily',
        'Nifty IT underperforms Nifty by >5% over 3M', 'Underperforms by >10%', 'Underperforms by >15% or breaks 1Y relative lows',
        'The most direct India read on AI risk sentiment: when US tech de-rates, Indian IT faces multiple compression, deal review risk, and earnings downgrades simultaneously.'),
      mkInd('India VIX', 'NSE website', 'Daily',
        '>18', '>22', '>27',
        'India VIX above 22 signals heightened domestic uncertainty and correlates with FPI selling; above 27 has triggered forced stop-losses in institutional India equity books.'),
      mkInd('Nifty 50 P/E (trailing)', 'NSE website', 'Daily',
        '>22× trailing P/E', '>24×', '>26×',
        'Nifty P/E above 22× makes the index vulnerable to de-rating if earnings growth disappoints; combined with global AI risk-off, expensive valuations amplify the drawdown.'),
      mkInd('Indian IT Deal TCV (quarterly, $B)', 'Company press releases', 'Quarterly',
        'Deal TCV below $8B aggregate (top 4 IT)', 'Below $6B or guidance cuts', 'Below $4B or multiple profit warnings',
        'Deal TCV is the fundamental leading indicator for Indian IT revenue; a sharp fall signals AI capex caution translating into delayed or cancelled IT outsourcing decisions.'),
      mkInd('Domestic MF SIP Flows (INR Cr, monthly)', 'AMFI', 'Monthly',
        'SIP flows below ₹18,000 Cr/month', 'Below ₹14,000 Cr/month', '<₹10,000 Cr or outflows begin',
        'SIP inflows are the structural support for Indian equities; a decline signals retail confidence breakdown and removes the key buyer of last resort during FPI outflow episodes.'),
    ],
  },
  allocation: [
    { asset: 'INR Cash / Liquid Funds / T-Bills', current: '20–25%', prev: '15–20%', change: '+5%', type: 'core',
      reason: 'Raised as first defence against score elevation; liquid funds earn 7%+ real returns while preserving optionality for re-entry at lower prices.',
      keyRisk: 'Opportunity cost if AI risk score reverses sharply without re-entry discipline.' },
    { asset: 'Medium-Duration Indian G-Secs (5–10Y)', current: '5–8%', prev: '5–8%', change: 'unch', type: 'core',
      reason: 'Core ballast providing INR yield; benefits from RBI rate-cut cycle. Duration risk contained by maturity selection.',
      keyRisk: 'CPI re-acceleration blocking RBI cuts; global yield spike transmitting to India.' },
    { asset: 'Gold (INR — SGBs / MCX)', current: '8–12%', prev: '8–12%', change: 'unch', type: 'core',
      reason: 'Structural safe haven; performs in USD risk-off and INR depreciation simultaneously — a natural dual hedge for Indian investors.',
      keyRisk: 'USD strength reversal or sharp real yield decline reducing gold appeal.' },
    { asset: 'USD Cash / Short-Duration US Treasuries', current: '5–8%', prev: '3–5%', change: '+3%', type: 'tactical',
      reason: 'Added USD exposure as dual hedge: benefits from INR weakness and provides dry powder for global asset re-entry.',
      keyRisk: 'USD reversal if Fed cuts aggressively; currency conversion costs on re-entry.' },
    { asset: 'Global Equities (ex AI-concentrated)', current: '8–12%', prev: '10–15%', change: '-3%', type: 'tactical',
      reason: 'Trimmed modestly; retaining exposure to value, financials, energy outside AI concentration zone.',
      keyRisk: 'Global recession would hurt even value equities; correlation spikes in crises.' },
    { asset: 'Indian Equities (ex expensive AI beneficiaries)', current: '18–22%', prev: '20–25%', change: '-3%', type: 'core',
      reason: 'Reduced from max to mid-range; focus on banks, domestic consumption, infra. Avoid AI-beneficiary names at >30× P/E.',
      keyRisk: 'FPI-driven de-rating even in fundamentally cheap names during global risk-off.' },
    { asset: 'Indian IT Services', current: '3–5%', prev: '5–7%', change: '-2%', type: 'tactical',
      reason: 'Trimmed: AI disruption risk to traditional services model; deal pipeline uncertainty. Retain only where valuation offers margin of safety.',
      keyRisk: 'Accelerated AI adoption reducing offshore headcount demand faster than modelled.' },
    { asset: 'AI / Semis / Data Centre / Power Infrastructure', current: '5–8%', prev: '8–10%', change: '-3%', type: 'tactical',
      reason: 'Trimmed from peak: elevated valuations with capex ROI scrutiny rising. Prefer power infra (lower valuation) vs peak-multiple semiconductor names.',
      keyRisk: 'Second-leg AI rally before capex ROI evidence triggers further FOMO-driven trimming.' },
    { asset: 'Crypto (Bitcoin / ETH only)', current: '0–2%', prev: '0–2%', change: 'unch', type: 'speculative',
      reason: 'Maximum 2% speculative allocation; no leverage. Monitored as high-beta risk-on canary.',
      keyRisk: 'Regulatory event or exchange failure causing >50% drawdown before stop-loss triggers.' },
    { asset: 'Real Assets / REITs / InvITs', current: '5–8%', prev: '5–8%', change: 'unch', type: 'tactical',
      reason: 'India-listed InvITs (power, road, telecom) provide inflation-linked yield with lower equity beta.',
      keyRisk: 'Rising long bond yields compressing REIT valuations; InvIT distribution cut risk.' },
    { asset: 'Tactical Defined-Risk Hedges (options)', current: '2–3%', prev: '0%', change: '+2%', type: 'hedge',
      reason: 'Initiated standby put spread protection given YELLOW score approaching ORANGE. Maximum loss = premium paid.',
      keyRisk: 'Time decay (theta) and vol crush eroding premium if score stays static or falls.' },
  ],
  actions: [
    { asset: 'Nifty 50 / Broad India Equities', signal: 'HOLD', range: '18–22%',
      trigger: 'Score falls below 35 + FPI flows net positive MTD + India VIX below 15',
      invalidation: 'Score rises above 55 or FPI outflows exceed ₹30,000 Cr MTD',
      horizon: '3–6 months', mainRisk: 'AI-driven global risk-off triggering FPI exodus from India',
      indiaRoute: 'Nifty 50 ETF (Nippon/HDFC) or direct large-cap basket. Avoid mid/small at current valuations.' },
    { asset: 'Nifty IT / Indian IT Services', signal: 'TRIM', range: '3–5%',
      trigger: 'Nasdaq P/E compresses below 25× AND deal TCV reaccelerates above $9B quarterly',
      invalidation: 'AI disruption narrative accelerates; Infosys/TCS issue profit warning',
      horizon: '6–12 months', mainRisk: 'Structural headcount reduction from AI agents reducing offshore demand',
      indiaRoute: 'NIFTYIT ETF or direct. Prefer TCS/HCL over smaller peers given balance sheet strength.' },
    { asset: 'Indian Banks & Financials', signal: 'ADD', range: '8–10% within India equities',
      trigger: 'NIM stabilisation + credit cost guidance below 1.2% + RBI rate cut confirmed',
      invalidation: 'Credit cycle turns; GNPA rising >3% at system level',
      horizon: '12–18 months', mainRisk: 'Global credit event spilling into India funding markets; NBFCs most vulnerable',
      indiaRoute: 'Bank Nifty ETF or direct: HDFC Bank, ICICI Bank, Kotak. Avoid PSU banks at current valuations.' },
    { asset: 'Indian Domestic Defensives (FMCG / Pharma / Infra)', signal: 'ADD', range: '5–7% within India equities',
      trigger: 'AI risk score stays YELLOW; FPI selling accelerates into defensive sectors',
      invalidation: 'Valuation premium to broad market exceeds 40% without earnings upgrade',
      horizon: '6–12 months', mainRisk: 'Valuations already elevated; limited re-rating if global rates stay high',
      indiaRoute: 'Sector ETFs (NIFTYFARMA, NIFTYFMCG) or direct: Sun Pharma, HUL, Larsen & Toubro (infra).' },
    { asset: 'Indian Exporters (non-IT)', signal: 'HOLD', range: '3–5%',
      trigger: 'USD/INR above 86 + export order visibility improving',
      invalidation: 'INR strengthens sharply below 82; global recession crushing export demand',
      horizon: '6–12 months', mainRisk: 'Trade tariff escalation or global demand slowdown',
      indiaRoute: 'Gems, specialty chemicals, pharma exporters. Monitor USD/INR trigger carefully.' },
    { asset: 'Global Equities (ex-AI, ex-US tech)', signal: 'HOLD', range: '8–12%',
      trigger: 'AI score retreats below 30 + DXY weakens below 100',
      invalidation: 'Score above 60 or global recession confirmed',
      horizon: '6–12 months', mainRisk: 'Correlations spike to 1 during global risk-off; diversification fails when needed',
      indiaRoute: 'NIFTY international FOFs or direct IBKR. Prefer MSCI World Value/ex-US.' },
    { asset: 'AI / Semiconductors / Hyperscalers', signal: 'TRIM', range: '5–8%',
      trigger: 'Only ADD back if: AI P/E compresses to 20× AND capex ROI confirmed in 2 consecutive quarters',
      invalidation: 'Capex guidance cut >15% or NVDA revenue guidance miss >10%',
      horizon: '3–6 months', mainRisk: 'Second-leg rally before ROI evidence forces further FOMO-driven trimming',
      indiaRoute: 'Nasdaq 100 ETF (Mirae Asset) or direct IBKR for individual names. Limit AI/semis to 8% total.' },
    { asset: 'Gold (INR)', signal: 'HOLD', range: '8–12%',
      trigger: 'ADD if AI score reaches ORANGE (55+) or USD/INR breaks above 86',
      invalidation: 'Score drops below 25 (GREEN) and USD/INR below 82; rotate back to equities',
      horizon: '12–18 months', mainRisk: 'Sudden real yield spike crushing gold; rapid USD weakening without INR follow-through',
      indiaRoute: 'SGBs (preferred: zero storage cost, interest income), MCX Gold, or Gold ETFs (Nippon).' },
    { asset: 'INR T-Bills / G-Secs / Liquid Funds', signal: 'ADD', range: '20–25%',
      trigger: 'Already adding; increase to 25% upper band if score approaches 55',
      invalidation: 'Score drops below 30 + inflation sustainably below 4% + RBI cuts >50 bps',
      horizon: '3–6 months (tactical)', mainRisk: 'Opportunity cost; inflation surprise reducing real returns',
      indiaRoute: 'Nippon India Liquid Fund, ICICI Pru Short Term, or direct RBI Retail Direct for G-Secs.' },
    { asset: 'USD Short-Duration Treasuries', signal: 'ADD', range: '5–8%',
      trigger: 'Already adding; increase if DXY breaks 107 + INR weakens toward 87',
      invalidation: 'Fed delivers >75 bps cumulative cuts; USD weakens sharply',
      horizon: '3–6 months', mainRisk: 'Rapid Fed pivot causing USD/INR reversal below 82; locks in currency loss',
      indiaRoute: 'IBKR direct (BIL ETF / 3-month T-Bill ladder) or Zerodha international funds with USD exposure.' },
    { asset: 'Crypto (BTC / ETH)', signal: 'AVOID', range: '0–2% max existing',
      trigger: 'Only ADD if score drops to GREEN (<30) + BTC confirms 3M uptrend + portfolio at minimum cash allocation',
      invalidation: 'Any deterioration in score; VIX spike above 25',
      horizon: 'Speculative only', mainRisk: 'Exchange failure, regulatory ban, or 70%+ drawdown in global risk-off event',
      indiaRoute: 'CoinDCX (max 2% of portfolio). No leverage. Only BTC/ETH, no altcoins.' },
    { asset: 'Listed REITs / InvITs', signal: 'HOLD', range: '3–5%',
      trigger: 'ADD if 10Y G-Sec yield drops below 6.5% confirming RBI easing cycle',
      invalidation: 'Long bond yields spike above 7.5%; distribution cuts announced',
      horizon: '12–18 months', mainRisk: 'Interest rate sensitivity; NAV compression if yields rise',
      indiaRoute: 'Nexus Select Trust, Embassy REIT (office). IRB InvIT, Powergrid InvIT for infrastructure.' },
    { asset: 'Commodity / Hard Assets', signal: 'HOLD', range: '2–3%',
      trigger: 'ADD if copper breaks above 3M high + ISM manufacturing above 52',
      invalidation: 'Global recession confirmed; commodity demand destruction',
      horizon: '6–12 months', mainRisk: 'China demand shock; DXY strength compressing USD-denominated commodity prices',
      indiaRoute: 'MCX (copper, aluminium) or ICICI Pru Commodities Fund.' },
    { asset: 'Defined-Risk Index Hedge (put spread)', signal: 'HEDGE', range: '2–3% (premium outlay)',
      trigger: 'Active as standby now; activate fully if score crosses 55 (ORANGE)',
      invalidation: 'Score drops below 35; hedge becomes expensive with low probability of payoff',
      horizon: '1–3 months rolling', mainRisk: 'Time decay and vol crush if markets stay range-bound for >6 weeks',
      indiaRoute: 'Nifty 50 put spreads via NSE derivatives (buy ATM put, sell OTM put 5% below). Or MOFSL monthly options.' },
  ],
  alerts: [
    { name: 'AI Capex Excess Alert', status: 'WATCH',
      triggeredPoints: ['Hyperscaler combined capex above $250B annualised', 'Capex/Revenue ratio rising for 2+ consecutive quarters', 'Capex growing materially faster than cloud revenue'],
      action: 'Trim AI/semis to lower end of range (5%); raise cash 2%. Review all AI-exposed positions for valuation headroom.',
      watchNext: 'Q3 2026 earnings: Microsoft (Oct 29), Meta (Oct 29), Alphabet (Nov 4), Amazon (Nov 6) — capex guidance lines.',
      cancel: 'Two consecutive quarters of capex plateau or cut, with cloud revenue growth accelerating above 30% YoY.' },
    { name: 'AI Valuation / Breadth Alert', status: 'WATCH',
      triggeredPoints: ['Nasdaq 100 fwd P/E above 28×', 'RSP/SPY ratio declining for 8+ weeks', '% stocks above 200-DMA below 55%'],
      action: 'Halt any new additions to AI/tech sleeve. Review position sizing vs max allocation caps. Prepare defined-risk hedge activation.',
      watchNext: 'Weekly breadth update (Barchart), monthly FactSet earnings revision data, ETF flow reports.',
      cancel: 'Nasdaq P/E compresses below 24× on earnings growth (not price decline). Breadth recovers above 60%.' },
    { name: 'Credit / Liquidity Alert', status: 'OFF',
      triggeredPoints: ['US HY spread below 450 bps (no stress)', 'VIX below 20 (no fear)', 'MOVE below 115 (bond market calm)'],
      action: 'No action required. Maintain current allocation. Monitor weekly.',
      watchNext: 'Any FOMC statement surprise or credit event (leveraged loan default rate). Jackson Hole-type policy pivots.',
      cancel: 'Alert activates if HY spreads exceed 450 bps or VIX closes above 22 for 3 consecutive days.' },
    { name: 'India Transmission Alert', status: 'WATCH',
      triggeredPoints: ['FPI monthly flows near negative territory', 'Nifty IT underperforming Nifty 50 for 8+ weeks', 'India VIX trending upward from recent lows'],
      action: 'Reduce India equities toward lower end of range. Increase domestic defensives and gold. Activate INR hedge if USD/INR approaches 85.',
      watchNext: 'Daily NSDL FPI flow data, weekly NSE India VIX closing levels, Nifty IT vs Nifty 50 ratio chart.',
      cancel: 'FPI turns net buyer for 10+ consecutive trading sessions AND India VIX falls below 14.' },
    { name: 'Post-Crash Re-entry Alert', status: 'OFF',
      triggeredPoints: ['Score not yet in RED territory', 'No confirmed crash in AI/tech equities', 'Re-entry conditions not applicable'],
      action: 'Alert activates only after score reaches RED and then recovers. No current action.',
      watchNext: 'Monitor AI score weekly. Alert will activate when score falls from RED to YELLOW during recovery.',
      cancel: 'Not applicable — alert activates only after RED regime and recovery begins.' },
  ],
  scenarios: [
    { name: 'Base', probability: 55,
      description: 'AI capex holds but ROI scrutiny rises; markets range-bound with rotation away from AI-concentrated names. India IT sees modest deal growth. Nifty 50 delivers mid-single-digit returns.',
      triggers: 'Hyperscaler capex grows <15% YoY; cloud revenue decelerates to 20–25%; Fed holds or cuts once; INR stable 83–86; FPI flows marginally negative.',
      scoreRange: '35–50', implication: 'Hold current allocation. No major changes. Rotate within India equities toward banks and domestic consumption.' },
    { name: 'Bull', probability: 25,
      description: 'AI monetisation accelerates with clear revenue-per-dollar-capex proof points; second-leg rally in quality AI names; India IT re-rates on deal wins; Nifty 50 surges 20%+ on FPI re-entry.',
      triggers: 'Hyperscaler AI revenue grows >40% YoY with expanding margins; Nasdaq beats earnings by >10%; Fed cuts 75 bps+; USD weakens; FPI flows strongly positive into India.',
      scoreRange: '15–30', implication: 'Deploy cash into Indian equities and AI/semis. Add to Nifty IT. Reduce gold and hedges. Crypto max 2%.' },
    { name: 'Bear', probability: 20,
      description: 'Hyperscaler capex guidance cut sharply on ROI concerns; credit spreads widen; USD strengthens; FPI outflows from India accelerate; Nifty IT falls 20%+; INR weakens toward 88.',
      triggers: 'Any 2 of: NVDA revenue miss >15%, HY spreads >600 bps, VIX >35, FPI monthly outflows >₹40,000 Cr, Nifty IT breaks 52W lows.',
      scoreRange: '60–85', implication: 'Execute hedge playbook: raise cash to 30%, activate put spreads fully, cut AI/semis to 0%, buy USD, hold gold. Wait for RED→YELLOW score recovery before re-entry.' },
  ],
  hedges: [
    { objective: 'Drawdown protection vs Nifty 50 correction of 10–20%',
      instrument: 'Put Spread (buy ATM put, sell OTM put 8% below)', underlying: 'Nifty 50 Index (NSE derivatives)',
      maxAllocation: '1.5% of portfolio (max loss = premium paid)', maxLoss: 'Premium paid (defined risk)',
      carryCost: '0.5–1.0% per month of notional protected', entryTrigger: 'AI risk score crosses 55 (ORANGE regime)',
      exitTrigger: 'Score retreats below 40, or expiry, or 80% of max profit reached',
      expiry: 'Monthly / rolling 30-day cycles',
      doNotUseWhen: 'Score below 45 (carry cost not justified); VIX already above 30 (puts too expensive).' },
    { objective: 'INR depreciation hedge for foreign-asset holders or dollar-denominated liabilities',
      instrument: 'USD/INR Forward Buy or USD Short-Duration Treasury ETF (BIL)', underlying: 'USD/INR spot / US 3-month T-Bill',
      maxAllocation: '3% of portfolio', maxLoss: 'Opportunity cost of INR strengthening (no hard cap)',
      carryCost: 'Near zero or positive if USD yield > INR short rate', entryTrigger: 'USD/INR breaks above 85.5 on weekly close OR AI score reaches ORANGE',
      exitTrigger: 'USD/INR falls below 83.5 or Fed cuts materially weaken USD',
      expiry: 'Tactical — review monthly with AI score update',
      doNotUseWhen: 'INR strengthening trend confirmed; Fed aggressively cutting; DXY below 98.' },
  ],
  upcomingEvents: [
    { date: '2026-10-15', event: 'Q2 FY27 Indian IT results season begins (TCS, Infosys, Wipro, HCL)', relevance: 'Deal TCV, revenue guidance, AI impact on headcount — core India pillar inputs' },
    { date: '2026-10-16', event: 'US CPI September 2026 (BLS)', relevance: 'CPI re-acceleration would delay Fed cuts and pressure AI equity multiples' },
    { date: '2026-10-24', event: 'US GDP Q3 2026 advance estimate', relevance: 'Hard data on whether capex investment is translating into economic output' },
    { date: '2026-10-29', event: 'Microsoft Q1 FY27 earnings — Azure AI revenue, capex guidance', relevance: 'Primary capex signal; Azure acceleration/deceleration moves the entire AI thesis' },
    { date: '2026-10-29', event: 'Meta Q3 2026 earnings — Reality Labs + AI capex', relevance: 'AI capex run-rate update from Meta; any guidance cut would be a systemic signal' },
    { date: '2026-10-30', event: 'FOMC Meeting — rate decision and statement', relevance: 'Rate path determines real yield trajectory and USD direction — macro pillar inputs' },
    { date: '2026-11-04', event: 'Alphabet Q3 2026 earnings — GCP AI growth, data centre capex', relevance: 'Google Cloud growth rate is the third cloud revenue reading after Azure and AWS' },
    { date: '2026-11-06', event: 'Amazon Q3 2026 earnings — AWS AI infrastructure spend', relevance: 'AWS capex and AI revenue complete the hyperscaler capex picture for Q3 2026' },
  ],
  topPositive: [
    '⚠ PLACEHOLDER — e.g. "Cloud revenue growth holding above 25% — capex monetisation on track"',
    '⚠ PLACEHOLDER — e.g. "HY credit spreads stable at 380 bps — no systemic stress signal"',
    '⚠ PLACEHOLDER — e.g. "India VIX at 13.5 — domestic market calm; FPI marginally net positive MTD"',
    '⚠ PLACEHOLDER — e.g. "SIP inflows at ₹21,000 Cr — structural domestic bid intact"',
    '⚠ PLACEHOLDER — e.g. "Gold in INR up 6% over 3M — portfolio hedge working; not signalling extreme stress"',
  ],
  topNegative: [
    '⚠ PLACEHOLDER — e.g. "Nasdaq 100 fwd P/E at 30× — historically elevated; valuation risk high"',
    '⚠ PLACEHOLDER — e.g. "Capex/Revenue ratio rising for 3 consecutive quarters — ROI gap widening"',
    '⚠ PLACEHOLDER — e.g. "% S&P 500 stocks above 200-DMA fell to 48% — breadth diverging from index"',
    '⚠ PLACEHOLDER — e.g. "Nifty IT underperforming Nifty 50 by 8% over 3M — AI disruption concerns pricing in"',
    '⚠ PLACEHOLDER — e.g. "USD/INR at 85.2 — approaching ORANGE threshold; RBI intervention risk"',
  ],
};

// ─── Style Maps ───────────────────────────────────────────────────────────────
const TL_BG: Record<TrafficLight, string> = {
  GREEN: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  YELLOW: 'bg-amber-100 text-amber-800 border-amber-300',
  ORANGE: 'bg-orange-100 text-orange-800 border-orange-300',
  RED: 'bg-red-100 text-red-800 border-red-300',
  DEEP_RED: 'bg-rose-100 text-rose-800 border-rose-300',
  BLUE: 'bg-blue-100 text-blue-800 border-blue-300',
};
const TL_NUM: Record<TrafficLight, string> = {
  GREEN: 'text-emerald-600', YELLOW: 'text-amber-500', ORANGE: 'text-orange-500',
  RED: 'text-red-600', DEEP_RED: 'text-rose-700', BLUE: 'text-blue-600',
};
const SIG_STYLE: Record<Signal, string> = {
  BUY: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  ADD: 'bg-green-100 text-green-800 border-green-300',
  HOLD: 'bg-slate-100 text-slate-700 border-slate-300',
  TRIM: 'bg-amber-100 text-amber-800 border-amber-300',
  AVOID: 'bg-red-100 text-red-800 border-red-300',
  HEDGE: 'bg-purple-100 text-purple-800 border-purple-300',
};
const CONF_STYLE: Record<string, string> = {
  HIGH: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-300',
  LOW: 'bg-slate-100 text-slate-600 border-slate-300',
  UNAVAILABLE: 'bg-red-100 text-red-700 border-red-300',
};
const ALERT_STYLE: Record<string, string> = {
  OFF: 'bg-slate-100 text-slate-600 border-slate-300',
  WATCH: 'bg-amber-100 text-amber-700 border-amber-300',
  ACTIVE: 'bg-orange-100 text-orange-700 border-orange-300',
  CONFIRMED: 'bg-red-100 text-red-700 border-red-300',
};
const ALLOC_TYPE: Record<string, string> = {
  core: 'bg-blue-100 text-blue-700 border-blue-300',
  tactical: 'bg-purple-100 text-purple-700 border-purple-300',
  hedge: 'bg-amber-100 text-amber-700 border-amber-300',
  avoid: 'bg-red-100 text-red-700 border-red-300',
  speculative: 'bg-slate-100 text-slate-600 border-slate-300',
};
const PILLAR_TABS = [
  { key: 'ai', label: 'AI Fundamentals & Capex', max: 25 },
  { key: 'equity', label: 'Equity Valuation & Breadth', max: 20 },
  { key: 'credit', label: 'Credit & Liquidity', max: 20 },
  { key: 'macro', label: 'Macro, Rates & Energy', max: 15 },
  { key: 'crossAsset', label: 'Cross-Asset Confirmation', max: 10 },
  { key: 'india', label: 'India Transmission', max: 10 },
];

const WEEKLY_PROMPT = `Run the weekly AI Unwind Risk Tracker update.

Use only data verified as of [DATE].
Update the six-pillar dashboard, compute the 0–100 AI Unwind Risk Score, classify the regime, and compare the result with the previous update.

Highlight only changes that are material. Provide:
1. Current risk score and traffic light,
2. Top five positive and negative changes,
3. Current asset-allocation ranges totaling 100%,
4. Specific actions: Buy, Add gradually, Hold, Trim, Avoid or Hedge,
5. Hedge recommendations only if Orange or Red,
6. India-specific implications for Nifty IT, broader Indian equities, INR, gold and foreign assets,
7. A list of the next data releases/earnings/events that could change the conclusion.`;

// ─── Sub-Components ───────────────────────────────────────────────────────────
const Badge = ({ cl, children }: { cl: string; children: ReactNode }) => (
  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border', cl)}>{children}</span>
);

const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-xl border border-border bg-card p-5">
    <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
    {children}
  </section>
);

function dirIcon(d: Direction) {
  if (d === 'improving') return <span className="text-emerald-600 font-bold">↑</span>;
  if (d === 'deteriorating') return <span className="text-red-500 font-bold">↓</span>;
  if (d === 'neutral') return <span className="text-slate-400">→</span>;
  return <span className="text-slate-400">—</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AIRiskPage() {
  const r = REPORT;
  const [tab, setTab] = useState('ai');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(WEEKLY_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pillarBars = [
    { key: 'ai', label: 'AI Capex', score: r.pillarScores.ai, max: 25 },
    { key: 'equity', label: 'Equity', score: r.pillarScores.equity, max: 20 },
    { key: 'credit', label: 'Credit', score: r.pillarScores.credit, max: 20 },
    { key: 'macro', label: 'Macro', score: r.pillarScores.macro, max: 15 },
    { key: 'crossAsset', label: 'Cross-Asset', score: r.pillarScores.crossAsset, max: 10 },
    { key: 'india', label: 'India', score: r.pillarScores.india, max: 10 },
  ];

  const indicators = r.pillars[tab] ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1440px] mx-auto px-4 py-6 space-y-5">

        {/* TOP BANNER */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">⚠ FRAMEWORK BASELINE</span> — All indicator values require manual update.
            Run the weekly update prompt at the bottom of this page to populate real data.
          </p>
        </div>

        {/* HEADER ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">AI Unwind Risk Score</p>
            <div className="flex items-baseline gap-2">
              <span className={cn('text-5xl font-black tabular-nums', TL_NUM[r.trafficLight])}>{r.score}</span>
              <span className="text-sm text-muted-foreground font-medium">/ 100</span>
            </div>
            <Badge cl={TL_BG[r.trafficLight]}>{r.trafficLight} — Rising Valuations / Early Warning</Badge>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Primary Regime</p>
            <p className="text-sm font-semibold text-foreground leading-snug">{r.regime}</p>
            <div className="flex items-center gap-2 mt-auto">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              <Badge cl={CONF_STYLE[r.regimeConfidence]}>{r.regimeConfidence}</Badge>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Score Trend</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Prev Week</span><span className="font-medium">{r.scorePrevWeek ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prev Month</span><span className="font-medium">{r.scorePrevMonth ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Trend</span><span className="text-amber-600 font-medium">Initializing</span></div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-auto">Report Date: {r.reportDate}</p>
          </div>
        </div>

        {/* SCORE BREAKDOWN */}
        <Sec title="Score Breakdown by Pillar">
          <div className="space-y-2.5">
            {pillarBars.map(pb => (
              <div key={pb.key} className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted-foreground shrink-0">{pb.label}</span>
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(pb.score / pb.max) * 100}%` }} />
                </div>
                <span className="w-16 text-xs font-semibold text-right tabular-nums text-foreground">{pb.score} / {pb.max}</span>
              </div>
            ))}
          </div>
        </Sec>

        {/* EXECUTIVE SUMMARY */}
        <div className="rounded-xl border border-border bg-card p-5">
          <button onClick={() => setExpanded(e => !e)} className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
            <span>Executive Summary</span>
            {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </button>
          <div className="mt-3">
            {expanded ? (
              <ul className="space-y-1.5">
                {r.executiveSummary.map((s, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="text-amber-500 shrink-0">•</span>{s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{r.executiveSummary[0]}</p>
            )}
          </div>
        </div>

        {/* SIX-PILLAR DASHBOARD */}
        <Sec title="Six-Pillar Indicator Dashboard">
          <div className="flex gap-1.5 flex-wrap border-b border-border pb-3 mb-4">
            {PILLAR_TABS.map(pt => (
              <button
                key={pt.key}
                onClick={() => setTab(pt.key)}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors border',
                  tab === pt.key
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-border/80'
                )}
              >
                {pt.label} <span className="opacity-60">({pt.max})</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1120px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Indicator', 'Latest', '1M Chg', '3M Chg', 'Signal', 'Dir', 'Thresholds (Y / O / R)', 'Why It Matters', 'Source', 'Frequency', 'Confidence'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {indicators.map((ind, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground max-w-[170px]">{ind.name}</td>
                    <td className="px-3 py-2.5 text-amber-600 font-semibold whitespace-nowrap">{ind.latest}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{ind.change1m}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{ind.change3m}</td>
                    <td className="px-3 py-2.5"><Badge cl={TL_BG[ind.signal]}>{ind.signal}</Badge></td>
                    <td className="px-3 py-2.5">{dirIcon(ind.direction)}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[160px]">
                      <div><span className="font-semibold text-amber-600">Y:</span> {ind.yellowThreshold}</div>
                      <div><span className="font-semibold text-orange-500">O:</span> {ind.orangeThreshold}</div>
                      <div><span className="font-semibold text-red-500">R:</span> {ind.redThreshold}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[200px]">{ind.whyItMatters}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[120px]">{ind.source}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{ind.frequency}</td>
                    <td className="px-3 py-2.5"><Badge cl={CONF_STYLE[ind.confidence]}>{ind.confidence}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        {/* ASSET ALLOCATION */}
        <Sec title="Asset Allocation — YELLOW Regime Defaults (Verify Before Acting)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Asset', 'Current Range', 'Prev Range', 'Change', 'Type', 'Rationale', 'Key Risk'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.allocation.map((a, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">{a.asset}</td>
                    <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">{a.current}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{a.prev}</td>
                    <td className={cn('px-3 py-2.5 font-semibold whitespace-nowrap',
                      a.change.startsWith('+') ? 'text-emerald-600' :
                      a.change.startsWith('-') ? 'text-red-500' : 'text-muted-foreground'
                    )}>{a.change}</td>
                    <td className="px-3 py-2.5"><Badge cl={ALLOC_TYPE[a.type]}>{a.type}</Badge></td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[220px]">{a.reason}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[180px]">{a.keyRisk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        {/* ACTION TABLE */}
        <Sec title="Action Table">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1120px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Asset', 'Signal', 'Range', 'Trigger', 'Invalidation', 'Horizon', 'Risk', 'India Route'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.actions.map((a, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground max-w-[160px]">{a.asset}</td>
                    <td className="px-3 py-2.5"><Badge cl={SIG_STYLE[a.signal]}>{a.signal}</Badge></td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{a.range}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[150px]">{a.trigger}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[130px]">{a.invalidation}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{a.horizon}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[130px]">{a.mainRisk}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[150px]">{a.indiaRoute}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        {/* ALERTS */}
        <Sec title="Regime Alert System">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {r.alerts.map((al, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground leading-snug">{al.name}</span>
                  <Badge cl={ALERT_STYLE[al.status]}>{al.status}</Badge>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Triggered by</p>
                  <ul className="space-y-0.5">{al.triggeredPoints.map((p, j) => <li key={j} className="text-[10px] text-muted-foreground">• {p}</li>)}</ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Action</p>
                  <p className="text-[10px] text-foreground">{al.action}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Watch Next</p>
                  <p className="text-[10px] text-muted-foreground">{al.watchNext}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Cancel If</p>
                  <p className="text-[10px] text-muted-foreground">{al.cancel}</p>
                </div>
              </div>
            ))}
          </div>
        </Sec>

        {/* HEDGE FRAMEWORK */}
        <Sec title="Hedge Framework (YELLOW: Optional / Standby)">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {r.hedges.map((h, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Shield className="size-3.5 text-purple-500 mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold text-foreground">{h.objective}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                  {([
                    ['Instrument', h.instrument], ['Underlying', h.underlying],
                    ['Max Allocation', h.maxAllocation], ['Max Loss', h.maxLoss],
                    ['Carry Cost', h.carryCost], ['Expiry', h.expiry],
                    ['Entry Trigger', h.entryTrigger], ['Exit Trigger', h.exitTrigger],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-muted-foreground font-semibold uppercase tracking-wide text-[9px]">{k}: </span>
                      <span className="text-foreground">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[10px] text-amber-700">
                  <span className="font-semibold">Do NOT use when: </span>{h.doNotUseWhen}
                </div>
              </div>
            ))}
          </div>
        </Sec>

        {/* SCENARIO MATRIX */}
        <Sec title="Scenario Matrix">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {r.scenarios.map((s) => {
              const palettes = {
                Base: { border: 'border-amber-300 bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400' },
                Bull: { border: 'border-emerald-300 bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400' },
                Bear: { border: 'border-red-300 bg-red-50', text: 'text-red-700', bar: 'bg-red-400' },
              };
              const p = palettes[s.name];
              return (
                <div key={s.name} className={cn('rounded-lg border p-4 space-y-3', p.border)}>
                  <div className="flex items-center justify-between">
                    <span className={cn('text-sm font-bold', p.text)}>{s.name} Case</span>
                    <span className={cn('text-2xl font-black', p.text)}>{s.probability}%</span>
                  </div>
                  <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', p.bar)} style={{ width: `${s.probability}%` }} />
                  </div>
                  <p className="text-xs text-foreground">{s.description}</p>
                  <div className="space-y-1 text-[10px]">
                    <p><span className="font-semibold text-muted-foreground">Triggers: </span>{s.triggers}</p>
                    <p><span className="font-semibold text-muted-foreground">Score Range: </span>{s.scoreRange}</p>
                    <p><span className="font-semibold text-muted-foreground">Implication: </span>{s.implication}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Sec>

        {/* TOP SIGNALS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Sec title="Top Positive Signals">
            <ul className="space-y-1.5">
              {r.topPositive.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-emerald-500 shrink-0 font-bold">↑</span>{s}
                </li>
              ))}
            </ul>
          </Sec>
          <Sec title="Top Negative Signals">
            <ul className="space-y-1.5">
              {r.topNegative.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-red-500 shrink-0 font-bold">↓</span>{s}
                </li>
              ))}
            </ul>
          </Sec>
        </div>

        {/* UPCOMING EVENTS */}
        <Sec title="Upcoming Events">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground w-32">Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Event</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Relevance to AI Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.upcomingEvents.map((e, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3 text-muted-foreground shrink-0" />{e.date}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{e.event}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{e.relevance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        {/* WEEKLY UPDATE PROMPT */}
        <Sec title="Weekly Update Prompt — Copy & Run in Claude / ChatGPT">
          <div className="relative">
            <pre className="rounded-lg bg-muted p-4 text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed pr-28">{WEEKLY_PROMPT}</pre>
            <button
              onClick={copy}
              className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              {copied ? 'Copied!' : 'Copy prompt'}
            </button>
          </div>
        </Sec>

        {/* DISCLAIMER */}
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
          <p className="text-[10px] text-muted-foreground">
            This is a probabilistic framework, not a crash prediction or investment guarantee. All thresholds are heuristic starting points
            and must be calibrated to your portfolio, risk tolerance, and local market conditions. Verify all indicator values before acting on any signal.
          </p>
        </div>

      </div>
    </div>
  );
}
