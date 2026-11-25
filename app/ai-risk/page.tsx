'use client';
import React, { useState, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { gpuRiskSignal, type GpuMarket } from '@/lib/gpu-market';
import { Copy, Check, AlertTriangle, Calendar, Shield } from 'lucide-react';
import AiDcLive from './AiDcLive';

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
// The only indicator fed live (from /api/gpu-market); the rest are updated weekly by hand.
const GPU_RENT_IND = 'GPU Rental Price Index (cloud compute)';

function gpuIndicatorPatch(g: GpuMarket): Partial<Indicator> {
  const { signal, direction } = gpuRiskSignal(g);
  const fmt = (x: number | null) => (x == null ? 'n/a' : `${x > 0 ? '+' : ''}${x}%`);
  const h100 = g.models.find(m => m.slug === 'nvidia-h100');
  return {
    latest: `${fmt(g.index.chg52w)} YoY${h100 ? ` · H100 $${h100.price}/GPU-hr` : ''} (wk ${g.asOf})`,
    change1m: fmt(g.index.chg4w),
    change3m: fmt(g.index.chg13w),
    signal, direction, confidence: 'HIGH',
  };
}

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
  reportDate: '2026-11-25', score: 46, scorePrevWeek: null, scorePrevMonth: 44,
  trafficLight: 'YELLOW',
  regime: 'US AI / Semis Price Correction on Strong Fundamentals — India Decoupling on Record FPI Inflows',
  regimeConfidence: 'MEDIUM',
  executiveSummary: [
    'VERIFIED Nov 24–25, 2026. Score 46/100 YELLOW (+2 vs Oct 2 update at 44). Still below the 55 ORANGE line. The risk has moved from rates/INR (Oct) to a US AI-equity correction with capex outrunning cash flow.',
    'AI DEMAND STRONGER, NOT WEAKER: NVIDIA Q3 FY27 revenue $115.8B (+103% YoY, beat ~$109B), Q4 guide $130B. Azure +48%, AWS +39% (fastest in ~5 yrs), Google Cloud +103%. CBRE primary-market data-centre vacancy 1.4% (record low). GPU rents +18% over 13 weeks.',
    'BUT PRICES CORRECTED: SOXX −18% in 3M and −36% from high; Nasdaq 100 −14% from high; S&P 500 closed below its 200-DMA (first since April); VIX 28.6 (was 16.4). NVIDIA CEO resigned ~Nov 12 and was reinstated Nov 23.',
    'CAPEX EXCESS ALERT NOW ACTIVE: Q3 capex — Amazon $77.3B (+120%), Alphabet $51.4B (+114%, FCF −$9.1B), Microsoft $45.2B, Meta $34.9B, Oracle $28.5B (Aug qtr) ≈ $237B in one quarter. Amazon and Alphabet both say 2027 capex goes meaningfully higher. Capex is growing 2–3× faster than cloud revenue.',
    'POLICY TIGHTER: Fed hiked 25 bp in Sept to 3.75–4.00% and held Oct 28 with two dissents for another hike. RBI hiked to 5.50% (Oct 7). India CPI 6.09% (Oct) — above the 6% band. US CPI Sep 3.7% YoY; Oct +0.4% m/m (BLS did not publish Oct YoY).',
    'CREDIT STARTING TO WIDEN, NOT STRESSED: US HY OAS 376 bp (Nov 20) — +42 bp in one week but below the 450 bp YELLOW line. IG OAS 98 bp. US 10Y real yield eased to 2.77% from 2.93%.',
    'INDIA DECOUPLING: FPIs bought a record ~₹99,000 Cr in Nov to Nov 17 (NSDL, via Business Standard) after −₹34,843 Cr in Oct. Nifty +11.7% in 1M, 3.7% off its high. USD/INR improved to 92.90 from 96.30. Nifty IT in line with Nifty over 3M (−0.8 pt).',
    'LIQUIDATION IN RISK ASSETS: Bitcoin −31% 3M; gold −22% 3M in USD (−20.5% in INR) after a +75% run; copper −16.5% 3M; Brent back to ~$87 from ~$116 a month ago despite Hormuz disruption.',
    'ALLOCATION: India equities raised to 22–26% (add gradually); INR cash 22–26% (yields up after RBI hike); cut G-Sec duration and REITs/InvITs; AI/semis held at 6–8% — do not chase, do not panic-sell; hedges stay on standby (score < 55).',
    'KEY EVENTS: US Q3 GDP 2nd est (Nov 25), RBI MPC (Dec 2–4), US payrolls (Dec 4), FOMC (Dec 8–9), US CPI (Dec 10), Oracle/Broadcom (~Dec 10), Micron (~Dec 15), India CPI (Dec 14), US–China truce expiry (Jan 10). Next update: after FOMC, ~Dec 10.',
  ],
  pillarScores: { ai: 9, equity: 10, credit: 7, macro: 10, crossAsset: 5, india: 5 },
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
      mkInd(GPU_RENT_IND, 'GetDeploying weekly GPU price dataset (CC BY 4.0), live', 'Weekly',
        'Index down YoY, or −5% in 4 weeks', 'Down >15% YoY or >10% in 13 weeks', 'Down >30% YoY or >20% in 13 weeks (compute glut)',
        'Median on-demand rent across ~100 cloud GPU models and 88 providers. Rents fall when installed capacity outruns real usage — the most direct, weekly read on AI over-build, well before it shows up in hyperscaler capex guidance.'),
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
    { asset: 'INR Cash / Liquid Funds / T-Bills', current: '22–26%', prev: '20–25%', change: '+1.5%', type: 'core',
      reason: 'RBI hike to 5.50% lifts liquid/T-bill yields; dry powder for adding to India and AI names if the US correction deepens.',
      keyRisk: 'Opportunity cost if the AI correction reverses quickly (NVDA beat + CEO reinstated).' },
    { asset: 'Medium-Duration Indian G-Secs (5–10Y)', current: '4–6%', prev: '5–8%', change: '-1.5%', type: 'core',
      reason: 'Cut duration: RBI is in "calibrated tightening" and India CPI (6.09%) is above the tolerance band — bond prices face more hikes.',
      keyRisk: 'Faster-than-expected inflation fall would make short duration underperform.' },
    { asset: 'Gold (INR — SGBs / MCX / ETFs)', current: '8–12%', prev: '8–12%', change: 'unch', type: 'core',
      reason: 'Held, not added: gold −20.5% in INR over 3M after a +75% run; still the best hedge against an INR relapse or a Hormuz escalation.',
      keyRisk: 'Further liquidation as real yields stay near 2.8% and INR strengthens.' },
    { asset: 'USD Cash / Short-Duration US Treasuries', current: '6–8%', prev: '5–8%', change: '+0.5%', type: 'tactical',
      reason: 'US T-bills yield ~3.9% with the Fed at 3.75–4.00%; ready capital for buying US AI names on a confirmed bottom.',
      keyRisk: 'INR keeps strengthening (92.9 now) — currency loss on USD holdings.' },
    { asset: 'Global Equities (ex AI-concentrated)', current: '9–13%', prev: '8–12%', change: '+1%', type: 'tactical',
      reason: 'Equal-weight S&P has beaten cap-weight by 7.6% in 8 weeks — breadth is rotating away from mega-cap AI; S&P forward P/E reset to 17.1×.',
      keyRisk: 'A credit event would pull every equity market down together.' },
    { asset: 'Indian Equities (ex expensive AI beneficiaries)', current: '22–26%', prev: '18–22%', change: '+4%', type: 'core',
      reason: 'Record FPI buying, Nifty trailing P/E ~20.7×, INR recovering. Add in 3 tranches over 4–6 weeks; banks and domestic cyclicals first.',
      keyRisk: 'RBI hiking further into 6%+ CPI; FPI flows reverse if US volatility spikes again.' },
    { asset: 'Indian IT Services', current: '3–5%', prev: '3–5%', change: 'unch', type: 'tactical',
      reason: 'TCS TCV $9.6B and HCLTech bookings +27% are solid, but Infosys cut FY27 guidance to 1–2% and Wipro bookings fell 45%. Stock-specific, not a sector buy.',
      keyRisk: 'AI-led pricing deflation in services; US tech budget cuts if the correction deepens.' },
    { asset: 'AI / Semis / Data Centre / Power Infrastructure', current: '6–8%', prev: '5–8%', change: '+0.5%', type: 'tactical',
      reason: 'Fundamentals beat (NVDA, cloud, record-low vacancy) while prices fell 18–36%. Hold; add only when VIX < 22 and SOXX reclaims its 50-DMA.',
      keyRisk: 'Capex/FCF strain (Alphabet FCF negative) becomes the market story and multiples compress further.' },
    { asset: 'Crypto (Bitcoin / ETH only)', current: '0–2%', prev: '0–2%', change: 'unch', type: 'speculative',
      reason: 'BTC −31% in 3M — the highest-beta risk asset is signalling de-risking. No new money.',
      keyRisk: 'Further forced selling; exchange or regulatory stress.' },
    { asset: 'Real Assets / REITs / InvITs', current: '4–6%', prev: '5–8%', change: '-1.5%', type: 'tactical',
      reason: 'Trimmed: rate-sensitive yield assets lose appeal while RBI is hiking and G-Sec yields rise.',
      keyRisk: 'Missing a rally if RBI pivots early in 2027.' },
    { asset: 'Tactical Defined-Risk Hedges (options)', current: '1–3%', prev: '2–3%', change: '-0.5%', type: 'hedge',
      reason: 'Standby only — score 46 is below the 55 ORANGE trigger. India VIX 17.7 keeps put premium affordable if needed.',
      keyRisk: 'Theta decay on any standing puts while the score stays YELLOW.' },
  ],
  actions: [
    { asset: 'Nifty 50 / Broad India Equities', signal: 'ADD', range: '22–26% (add gradually, 3 tranches)',
      trigger: 'FPI net buying continues (Nov record) + USD/INR stays below 94 + India VIX below 20',
      invalidation: 'FPI flows turn negative for 2 weeks, or RBI signals more than one further hike',
      horizon: '6–12 months', mainRisk: 'US volatility (VIX 28.6) re-triggering FPI selling; India CPI above 6%',
      indiaRoute: 'Nifty 50 ETF or large-cap basket; prefer private banks, capital goods, domestic consumption.' },
    { asset: 'Nifty IT / Indian IT Services', signal: 'HOLD', range: '3–5%',
      trigger: 'ADD if Q3 FY27 (Jan) shows TCV > $9B at TCS and Infosys holds its cut guidance',
      invalidation: 'Another guidance cut at Infosys/HCLTech, or Accenture (~Dec 16) cuts its outlook',
      horizon: '6–12 months', mainRisk: 'AI-driven pricing pressure on legacy services',
      indiaRoute: 'Prefer TCS and HCLTech (bookings strength) over Wipro (bookings −45%).' },
    { asset: 'Indian Banks & Financials', signal: 'ADD', range: '8–10% within India equities',
      trigger: 'Rate hikes support NIMs; credit costs stable; FPI buying concentrated in financials',
      invalidation: 'GNPA rising >3% system-wide or deposit-rate war compressing NIMs',
      horizon: '12–18 months', mainRisk: 'Growth slowdown from tighter RBI policy hitting loan growth',
      indiaRoute: 'Bank Nifty ETF or HDFC Bank, ICICI Bank, Kotak, SBI.' },
    { asset: 'Indian Domestic Defensives (FMCG / Pharma)', signal: 'HOLD', range: '5–7% within India equities',
      trigger: 'Rotate into them only if FPI flows reverse',
      invalidation: 'Valuation premium over Nifty exceeds 40% without earnings upgrades',
      horizon: '6–12 months', mainRisk: 'Food inflation (8.94%) squeezing FMCG margins',
      indiaRoute: 'NIFTYPHARMA / NIFTYFMCG ETFs or Sun Pharma, HUL.' },
    { asset: 'Global Equities (ex-AI, equal-weight / value)', signal: 'ADD', range: '9–13% (add gradually)',
      trigger: 'RSP/SPY keeps rising (equal weight outperforming) + HY OAS below 450 bp',
      invalidation: 'HY OAS above 450 bp or VIX above 35',
      horizon: '6–12 months', mainRisk: 'Correlations jump to 1 in a broad sell-off',
      indiaRoute: 'International FoFs or IBKR: RSP, MSCI World ex-US / value ETFs.' },
    { asset: 'AI / Semiconductors / Hyperscalers', signal: 'HOLD', range: '6–8%',
      trigger: 'ADD gradually only when VIX < 22 AND SOXX closes above its 50-DMA (do not catch the knife)',
      invalidation: 'Hyperscaler capex guidance cut >15%, or HY OAS > 450 bp',
      horizon: '6–12 months', mainRisk: 'Market punishes negative FCF from capex (Alphabet, Amazon) with further de-rating',
      indiaRoute: 'Nasdaq 100 FoF or IBKR. Prefer NVDA/TSM (cash-generative) over capex-heavy hyperscalers.' },
    { asset: 'Gold (INR)', signal: 'HOLD', range: '8–12%',
      trigger: 'ADD below 8% only if USD/INR breaks back above 95 or Hormuz escalates',
      invalidation: 'Real yields above 3% and INR below 90 — trim to 6–8%',
      horizon: '12–18 months', mainRisk: 'Continued liquidation after the 2025–26 run-up',
      indiaRoute: 'SGBs (secondary market), Gold ETFs, MCX Gold.' },
    { asset: 'INR T-Bills / Liquid Funds', signal: 'HOLD', range: '22–26%',
      trigger: 'Deploy into India equities in tranches as the ADD triggers above are met',
      invalidation: 'Score falls below 35 — redeploy down to 15–20%',
      horizon: '3–6 months', mainRisk: 'Opportunity cost in a fast rally',
      indiaRoute: 'Liquid / money-market funds, 91–364 day T-bills via RBI Retail Direct.' },
    { asset: 'Medium-Duration G-Secs', signal: 'TRIM', range: '4–6%',
      trigger: 'RBI in tightening mode; India CPI above 6%',
      invalidation: 'CPI back below 5% and RBI stance returns to neutral — rebuild to 6–8%',
      horizon: '3–6 months', mainRisk: 'Early RBI pivot',
      indiaRoute: 'Shift from 5–10Y gilt funds to short-duration / floating-rate funds.' },
    { asset: 'USD Short-Duration Treasuries', signal: 'HOLD', range: '6–8%',
      trigger: 'Use as dry powder for US AI names on the ADD trigger',
      invalidation: 'USD/INR below 90 — consider reducing',
      horizon: '3–6 months', mainRisk: 'INR strengthening further',
      indiaRoute: 'IBKR (BIL / 3-month T-bill ladder) via LRS.' },
    { asset: 'Crypto (BTC / ETH)', signal: 'AVOID', range: '0–2% max existing',
      trigger: 'Only reconsider when BTC regains its 3M uptrend and VIX < 20',
      invalidation: '—',
      horizon: 'Speculative only', mainRisk: 'Further deleveraging (BTC −31% 3M)',
      indiaRoute: 'No new purchases.' },
    { asset: 'Listed REITs / InvITs', signal: 'TRIM', range: '4–6%',
      trigger: 'Rising Indian yields after the RBI hike',
      invalidation: '10Y G-Sec yield falls back below 6.5%',
      horizon: '6–12 months', mainRisk: 'Distribution cuts if rates keep rising',
      indiaRoute: 'Keep the highest-quality infra InvITs (PowerGrid, IRB); trim office REITs.' },
    { asset: 'Commodities / Hard Assets', signal: 'AVOID', range: '0–2%',
      trigger: 'Copper −16.5% 3M, Brent −25% 1M — wait for stabilisation',
      invalidation: 'Copper reclaims its 3M high with ISM above 55',
      horizon: '3–6 months', mainRisk: 'Hormuz escalation reverses oil sharply higher',
      indiaRoute: 'No new positions.' },
    { asset: 'Defined-Risk Index Hedge (put spread)', signal: 'HEDGE', range: '1–3% standby (not active)',
      trigger: 'Activate only if score crosses 55 (ORANGE)',
      invalidation: 'Score below 40',
      horizon: '1–3 months rolling', mainRisk: 'Theta decay',
      indiaRoute: 'Nifty put spread via NSE options — prepare strikes, do not buy yet.' },
  ],
  alerts: [
    { name: 'AI Capex Excess Alert', status: 'ACTIVE',
      triggeredPoints: ['Five hyperscalers spent ≈ $237B capex in one quarter (≈ $950B annualised)', 'Capex growth (+80% to +120%) is 2–3× cloud revenue growth (+39% to +103%)', 'Alphabet free cash flow negative (−$9.1B); Amazon and Alphabet guide 2027 capex higher'],
      action: 'Keep AI/semis at 6–8%; prefer cash-generative suppliers (NVDA, TSM) over capex-heavy hyperscalers. No adds until the VIX/SOXX triggers are met.',
      watchNext: 'Oracle (~Dec 10) capex and FCF; Micron (~Dec 15) guidance; Q4 calls (late Jan) for 2027 capex numbers.',
      cancel: 'Cloud revenue growth catches up with capex growth, or hyperscalers return to positive FCF.' },
    { name: 'AI Valuation / Breadth Alert', status: 'WATCH',
      triggeredPoints: ['S&P 500 below its 200-DMA for the first time since April', 'Only ~53–56% of S&P stocks above their 200-DMA (Nov 23)', 'Top-10 weight in S&P 500 still ~37%'],
      action: 'No new AI additions this week. Valuations have reset (S&P fwd P/E 17.1×), so this is a price alert, not a bubble alert.',
      watchNext: 'S&P reclaiming its 200-DMA; % above 200-DMA back over 60%; FactSet Dec 4 update.',
      cancel: 'S&P back above its 200-DMA for 2 weeks with breadth above 60%.' },
    { name: 'Credit / Liquidity Alert', status: 'WATCH',
      triggeredPoints: ['VIX 28.6 — above the 22 trigger for more than 3 days', 'HY OAS +42 bp in a week to 376 bp', 'IG OAS widened to 98 bp from ~84 bp'],
      action: 'No allocation change yet. If HY OAS passes 450 bp, cut AI/semis to 5% and activate the Nifty put spread.',
      watchNext: 'Daily HY OAS (FRED), VIX, FOMC Dec 9 statement.',
      cancel: 'VIX back below 20 and HY OAS below 330 bp.' },
    { name: 'India Transmission Alert', status: 'OFF',
      triggeredPoints: ['FPIs record net buyers in November (≈ ₹99,000 Cr to Nov 17)', 'Nifty IT in line with Nifty over 3M', 'India VIX 17.7 — below the 18 trigger, but up 64% in 3M'],
      action: 'No India de-risking needed. Watch RBI (Dec 2–4) — the domestic risk is now inflation and rates, not FPI outflows.',
      watchNext: 'NSDL daily FPI flows, RBI MPC Dec 2–4, India CPI Dec 14.',
      cancel: '—' },
    { name: 'Post-Crash Re-entry Alert', status: 'OFF',
      triggeredPoints: ['Score has not reached RED', 'US AI correction (SOXX −36% from high) has not become a credit event', 'Re-entry rules not yet applicable'],
      action: 'Prepare a buy list of US AI names for the VIX < 22 / SOXX 50-DMA trigger.',
      watchNext: 'VIX and SOXX 50-DMA.',
      cancel: 'Not applicable.' },
  ],
  scenarios: [
    { name: 'Base', probability: 55,
      description: 'The US AI correction stabilises as earnings keep beating; capex/FCF worries cap multiples. India keeps outperforming on FPI inflows, but RBI tightening limits upside.',
      triggers: 'Fed holds Dec 9; HY OAS stays below 450 bp; Oracle/Micron confirm demand; FPI flows stay positive.',
      scoreRange: '40–52', implication: 'Follow this allocation: add India gradually, hold AI/semis, keep hedges on standby.' },
    { name: 'Bull', probability: 20,
      description: 'NVIDIA governance clears, VIX falls below 20 and AI leaders recover the November losses; India extends gains with INR strengthening.',
      triggers: 'VIX < 20; SOXX back above 50-DMA; US CPI cools; Fed signals no more hikes.',
      scoreRange: '25–38', implication: 'Deploy cash into AI/semis (to 8–10%) and India equities; reduce gold and hedges.' },
    { name: 'Bear', probability: 25,
      description: 'Capex-funded negative FCF triggers a credit repricing of hyperscalers/AI suppliers; Fed hikes again in December; FPI flows reverse.',
      triggers: 'Any 2 of: HY OAS > 450 bp, VIX > 35, Fed hike Dec 9, hyperscaler capex cut >15%, FPI weekly outflows > ₹15,000 Cr.',
      scoreRange: '56–75', implication: 'ORANGE playbook: activate Nifty put spread, cut AI/semis to 3–5%, raise INR cash to 30%, hold gold and USD.' },
  ],
  hedges: [
    { objective: 'Drawdown protection vs Nifty 50 correction of 10–20% (STANDBY — not active at score 46)',
      instrument: 'Put Spread (buy ATM put, sell OTM put 8% below)', underlying: 'Nifty 50 Index (NSE derivatives)',
      maxAllocation: '1.5% of portfolio (max loss = premium paid)', maxLoss: 'Premium paid (defined risk)',
      carryCost: '0.5–1.0% per month of notional protected', entryTrigger: 'AI risk score crosses 55 (ORANGE), or HY OAS > 450 bp',
      exitTrigger: 'Score retreats below 40, or expiry, or 80% of max profit reached',
      expiry: 'Monthly / rolling 30-day cycles',
      doNotUseWhen: 'Score below 55 (now 46); India VIX already above 25 (puts too expensive).' },
    { objective: 'INR depreciation hedge for foreign-asset holders (STANDBY)',
      instrument: 'USD/INR Forward Buy or USD Short-Duration Treasury ETF (BIL)', underlying: 'USD/INR spot / US 3-month T-Bill',
      maxAllocation: '3% of portfolio', maxLoss: 'Opportunity cost of INR strengthening (no hard cap)',
      carryCost: 'Near zero (US T-bill ~3.9% vs INR T-bill ~5.5%)', entryTrigger: 'USD/INR weekly close above 95, or score reaches ORANGE',
      exitTrigger: 'USD/INR below 90',
      expiry: 'Tactical — review with each update',
      doNotUseWhen: 'FPI inflows strong and INR trending stronger (the case now: 92.90, from 96.30).' },
  ],
  upcomingEvents: [
    { date: '2026-11-25', event: 'US Q3 GDP second estimate (BEA)', relevance: 'Advance print was +3.4% — confirms whether AI capex is lifting growth' },
    { date: '2026-12-02', event: 'RBI MPC (Dec 2–4) — decision Dec 4', relevance: 'Another hike after 5.50% would cap Indian equity upside; a pause supports the ADD call' },
    { date: '2026-12-04', event: 'US November jobs report; FactSet Earnings Insight', relevance: 'Labour strength drives the Dec FOMC hike/hold decision' },
    { date: '2026-12-09', event: 'FOMC decision (Dec 8–9)', relevance: 'Two members already voted to hike — a hike would push the score toward ORANGE' },
    { date: '2026-12-10', event: 'US November CPI; Oracle FY27 Q2 (~Dec 10, unconfirmed); Broadcom (~Dec 10)', relevance: 'Oracle capex/FCF and Broadcom AI revenue test the capex-excess alert' },
    { date: '2026-12-14', event: 'India November CPI', relevance: 'Above 6% again = more RBI tightening risk' },
    { date: '2026-12-15', event: 'Micron FQ1 (~Dec 15, unconfirmed; guided $61.5B)', relevance: 'Memory demand is the cleanest read on AI hardware orders' },
    { date: '2026-12-16', event: 'Accenture Q1 FY27 (~Dec 16, unconfirmed)', relevance: 'Lead indicator for Indian IT demand and pricing' },
    { date: '2027-01-08', event: 'US December jobs report', relevance: 'Sets up the Jan 26–27 FOMC' },
    { date: '2027-01-10', event: 'US–China trade truce and Section 301 exclusions expire', relevance: 'Tariff escalation would hit semis supply chains and risk appetite' },
    { date: '2027-01-12', event: 'Indian IT Q3 FY27 results begin (TCS typically 2nd week of Jan; dates not yet announced)', relevance: 'TCV and guidance decide the Nifty IT HOLD vs ADD call' },
  ],
  topPositive: [
    'AI demand beat everywhere: NVIDIA Q3 revenue $115.8B (+103%) vs ~$109B expected, Q4 guide $130B; Azure +48%, AWS +39%, Google Cloud +103%; data-centre vacancy 1.4% (record low).',
    'India decoupled: record FPI buying (~₹99,000 Cr in Nov to Nov 17 vs −₹34,843 Cr in Oct); Nifty +11.7% in 1M; USD/INR 92.90 from 96.30.',
    'Valuations reset: S&P 500 forward P/E 17.1× (from 19.0× on Sep 30, below its 10Y avg 19.1×) because prices fell while EPS estimates rose 4.4%; Nifty trailing P/E ~20.7×.',
    'Breadth is broadening, not collapsing: equal-weight S&P beat cap-weight by 7.6% in 8 weeks — the sell-off is concentrated in mega-cap AI.',
    'Real yield eased to 2.77% (from 2.93%); Brent ~$87 (from ~$116 a month ago) despite Hormuz — lower oil helps India\'s INR and inflation.',
  ],
  topNegative: [
    'US AI equities in correction: SOXX −18% in 3M (−36% from high), Nasdaq 100 −14% from high, S&P below its 200-DMA; VIX 28.6 (from 16.4).',
    'Capex outrunning cash: ≈ $237B of hyperscaler capex in one quarter; Alphabet FCF −$9.1B; Amazon capex +120% vs AWS revenue +39%; 2027 capex guided higher still.',
    'Policy tightening on both sides: Fed hiked to 3.75–4.00% (Sept) with two Oct dissents for more; RBI hiked to 5.50%; India CPI 6.09% breached the 6% band.',
    'Risk-asset liquidation: Bitcoin −31% 3M, gold −22% 3M (USD), copper −16.5% 3M; HY OAS +42 bp in one week to 376 bp.',
    'Indian IT still fragile: Infosys cut FY27 guidance to 1–2% CC; Wipro bookings −45%; Nifty IT 19% below its high. NVIDIA CEO resignation/reinstatement adds governance noise.',
  ],
};

// ─── Live Data Patch (verified Nov 20–25, 2026) ──────────────────────────────
const LIVE: Record<string, Partial<Indicator>> = {
  'Hyperscaler AI Capex (annualised, $B)':     { latest: '≈ $237B in Q3 2026 alone (AMZN $77.3B, GOOGL $51.4B, MSFT $45.2B, META $34.9B, ORCL $28.5B) ≈ $950B annualised; 2027 guided higher', change1m: '—', change3m: '↑ +80% to +120% YoY', signal: 'RED', direction: 'deteriorating', confidence: 'HIGH' },
  'Capex vs Revenue Growth (ratio)':           { latest: 'Capex +80–120% YoY vs cloud revenue +39–103%; Alphabet FCF −$9.1B', change1m: '—', change3m: 'diverging', signal: 'ORANGE', direction: 'deteriorating', confidence: 'HIGH' },
  'Cloud Revenue Growth YoY':                  { latest: 'Azure +48%, AWS +39.3%, Google Cloud +103% (Q3 2026); MSFT commercial RPO $677B (+73%)', change1m: '—', change3m: '↑ accelerating', signal: 'GREEN', direction: 'improving', confidence: 'HIGH' },
  'GPU / Semiconductor Revenue Growth':        { latest: 'NVDA Q3 FY27 $115.8B (+103%), DC $107.6B, beat; Q4 guide $130B. AMD Q3 $13.4B (+45%), beat', change1m: '—', change3m: '↑', signal: 'GREEN', direction: 'improving', confidence: 'HIGH' },
  'Data Centre Vacancy Rate':                  { latest: '1.4% primary N. America markets (CBRE H1 2026, record low); N. Virginia ~0.2%; 80%+ of 7.5 GW under construction preleased', change1m: '—', change3m: '—', signal: 'GREEN', direction: 'neutral', confidence: 'HIGH' },
  'AI VC Funding & IPO Pipeline ($B)':         { latest: 'Q3 2026 global VC ~$159B (−25% QoQ, Crunchbase; CB Insights $187B), ~64% AI. Anthropic IPO $81.3B at $83 (Nov 18); other AI IPOs deferred', change1m: '—', change3m: '−25% QoQ', signal: 'YELLOW', direction: 'deteriorating', confidence: 'MEDIUM' },
  'Nasdaq 100 Forward P/E':                    { latest: 'Not verified this week. S&P 500 fwd P/E 17.1× (FactSet Nov 20; 19.0× Sep 30; 10Y avg 19.1×)', change1m: '↓', change3m: '↓ compressed', signal: 'GREEN', direction: 'improving', confidence: 'MEDIUM' },
  'SOX vs S&P 500 Relative Performance (3M)': { latest: 'SOXX −18.2% vs SPY −5.7% (3M) = −12.5 pts; SOXX −36% from 52W high', change1m: '−12.0%', change3m: '−18.2%', signal: 'GREEN', direction: 'deteriorating', confidence: 'HIGH' },
  'S&P 500 Equal-Weight vs Cap-Weight (RSP/SPY)': { latest: 'RSP/SPY +7.6% over 8 weeks; 90th percentile of 1Y range — breadth broadening', change1m: '+3.4%', change3m: '+1.8%', signal: 'GREEN', direction: 'improving', confidence: 'HIGH' },
  '% S&P 500 Stocks Above 200-DMA':            { latest: '~53–56% (Nov 23); ~46–50% at Nov 20 low; 63% on Oct 29. S&P itself below its 200-DMA', change1m: '↓ from 63%', change3m: '↓', signal: 'YELLOW', direction: 'deteriorating', confidence: 'MEDIUM' },
  'AI/Tech ETF Flows (weekly, $B)':            { latest: 'Mixed: SOXX −$4.1B on Nov 10 (one day); tech funds +$10.3B week to Nov 18; leveraged SOXL +$2.7B (dip-buying)', change1m: '—', change3m: '—', signal: 'YELLOW', direction: 'neutral', confidence: 'LOW' },
  'Top-10 Weight in S&P 500 (%)':              { latest: '~37.0% (SPY, Nov 12) — down from ~41% at end-2025', change1m: '↓', change3m: '↓', signal: 'ORANGE', direction: 'improving', confidence: 'MEDIUM' },
  'US HY Credit Spread (OAS, bps)':           { latest: '376 bp (Nov 20) — +42 bp in a week (334 on Nov 16)', change1m: '↑', change3m: '↑ from ~312', signal: 'GREEN', direction: 'deteriorating', confidence: 'HIGH' },
  'US IG Credit Spread (OAS, bps)':           { latest: '98 bp (Nov 20); 90 bp Nov 16; ~84 bp Sep 30', change1m: '↑', change3m: '↑', signal: 'GREEN', direction: 'deteriorating', confidence: 'HIGH' },
  'VIX':                                       { latest: '28.6 (Nov 24) — from 18.4 a month ago, 14.5 three months ago', change1m: '+56%', change3m: '+97%', signal: 'ORANGE', direction: 'deteriorating', confidence: 'HIGH' },
  'MOVE Index (bond volatility)':             { latest: '~96–98 (Nov 18, unverified); Oct high ~114', change1m: '↓', change3m: '—', signal: 'GREEN', direction: 'improving', confidence: 'LOW' },
  'DXY (USD Index)':                           { latest: '104.05 (Nov 24) — at 52W high', change1m: '+2.0%', change3m: '+4.9%', signal: 'YELLOW', direction: 'deteriorating', confidence: 'HIGH' },
  'US Yield Curve (10Y minus Fed Funds, bps)': { latest: '≈ +104 bp (10Y 4.92% − Fed Funds midpoint 3.875%) — positively sloped, not a post-inversion re-steepening', change1m: '—', change3m: '—', signal: 'GREEN', direction: 'neutral', confidence: 'HIGH' },
  'US 10Y Real Yield (TIPS, %)':              { latest: '2.77% (Nov 20) — down from 2.93% (Sep 30)', change1m: '↓', change3m: '↓', signal: 'ORANGE', direction: 'improving', confidence: 'HIGH' },
  'US CPI YoY (%)':                            { latest: 'Sep 3.7% YoY (core 2.6%); Oct +0.4% m/m — BLS published no Oct YoY (shutdown gap); gasoline +37% YoY', change1m: '—', change3m: '↑', signal: 'YELLOW', direction: 'deteriorating', confidence: 'MEDIUM' },
  'US ISM Manufacturing PMI':                  { latest: '55.5 (Oct) vs 54.5 (Sep) — expansion; prices index 75.2 (inflationary)', change1m: '+1.0', change3m: '—', signal: 'GREEN', direction: 'improving', confidence: 'HIGH' },
  'Data Centre Power Cost ($/MWh)':           { latest: 'US commercial avg 14.47¢/kWh = $144.7/MWh (Aug 2026, EIA), +4.3% YoY. Level thresholds are pre-2022 — judged on YoY change', change1m: '—', change3m: '+4.3% YoY', signal: 'YELLOW', direction: 'deteriorating', confidence: 'MEDIUM' },
  'Copper Price ($/mt)':                       { latest: '$5.51/lb (~$12,150/mt) Nov 24 — −19% from 52W high', change1m: '−15.4%', change3m: '−16.5%', signal: 'YELLOW', direction: 'deteriorating', confidence: 'HIGH' },
  'USD/INR':                                   { latest: '92.90 (Nov 24) — improved from 96.30 on Oct 2; still above the old 88 RED line', change1m: '−2.1% (INR stronger)', change3m: '−2.7%', signal: 'RED', direction: 'improving', confidence: 'HIGH' },
  'Nasdaq 100 (QQQ) vs 3M-ago (%)':           { latest: '$651 (Nov 23) — −8.4% 3M; −14.3% from 52W high', change1m: '−7.6%', change3m: '−8.4%', signal: 'YELLOW', direction: 'deteriorating', confidence: 'HIGH' },
  'Gold in INR vs 3M-ago (%)':                { latest: '−20.5% in INR over 3M (gold $3,627, −22% in USD) — liquidation, not a flight to safety', change1m: '−12.2%', change3m: '−20.5%', signal: 'GREEN', direction: 'neutral', confidence: 'HIGH' },
  'US 10Y Treasury Yield vs 3M-ago (bps)':    { latest: '4.92% (Nov 23) — +28 bp over 3M (4.64%); −7 bp over 1M', change1m: '−7 bp', change3m: '+28 bp', signal: 'GREEN', direction: 'improving', confidence: 'HIGH' },
  'Bitcoin vs 3M-ago (%)':                    { latest: '$59,570 (Nov 24) — −30.9% 3M; −31% from high', change1m: '−23.0%', change3m: '−30.9%', signal: 'YELLOW', direction: 'deteriorating', confidence: 'HIGH' },
  'Brent Crude vs 3M-ago (%)':                { latest: '$86.68 (Nov 24) — −1.3% 3M but −25% 1M (from ~$116) despite Hormuz disruption', change1m: '−25.2%', change3m: '−1.3%', signal: 'GREEN', direction: 'improving', confidence: 'HIGH' },
  'Cross-Asset Signal Pattern':               { latest: '0/5 ORANGE; 2/5 YELLOW (QQQ, BTC); but QQQ, BTC, gold and copper all falling together = deleveraging', change1m: '—', change3m: '—', signal: 'YELLOW', direction: 'deteriorating', confidence: 'MEDIUM' },
  'FPI Net Equity Flows (INR Cr, MTD)':       { latest: 'Nov MTD ≈ +₹99,158 Cr to Nov 17 (record month, NSDL via Business Standard); Oct −₹34,843 Cr', change1m: '↑ sharp reversal', change3m: '—', signal: 'GREEN', direction: 'improving', confidence: 'MEDIUM' },
  'Nifty IT vs Nifty 50 Relative (3M, %)':   { latest: 'Nifty IT +3.8% vs Nifty +4.6% (3M) = −0.8 pt; Nifty IT −19% from 52W high', change1m: '−0.7% vs +11.7%', change3m: '−0.8 pt', signal: 'GREEN', direction: 'improving', confidence: 'HIGH' },
  'India VIX':                                { latest: '17.70 (Nov 23) — just under the 18 YELLOW line; up 64% in 3M', change1m: '+12.3%', change3m: '+64.5%', signal: 'GREEN', direction: 'deteriorating', confidence: 'HIGH' },
  'Nifty 50 P/E (trailing)':                  { latest: '~20.6–20.8× (Nov 16–19; IndexPE / NSE Indices via Wright Research)', change1m: '↑ with price', change3m: '—', signal: 'GREEN', direction: 'neutral', confidence: 'MEDIUM' },
  'Indian IT Deal TCV (quarterly, $B)':        { latest: 'Q2 FY27: TCS $9.6B, Infosys large deals $5.2B (FY27 guide cut to 1–2% CC), HCLTech $3.3B (+27%), Wipro $2.6B (−45%)', change1m: '—', change3m: 'mixed', signal: 'YELLOW', direction: 'neutral', confidence: 'MEDIUM' },
  'Domestic MF SIP Flows (INR Cr, monthly)':  { latest: '≈ ₹32,160 Cr (Oct 2026), +8.9% YoY; Sep record ₹32,490 Cr', change1m: '−1%', change3m: '—', signal: 'GREEN', direction: 'neutral', confidence: 'MEDIUM' },
};
// Apply live data to REPORT indicators
Object.values(REPORT.pillars).forEach(inds => inds.forEach(ind => {
  const patch = LIVE[ind.name]; if (patch) Object.assign(ind, patch);
}));

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
  const [copied, setCopied] = useState(false);
  const [gpu, setGpu] = useState<GpuMarket | null>(null);

  useEffect(() => {
    fetch('/api/gpu-market')
      .then(res => (res.ok ? res.json() : null))
      .then(setGpu)
      .catch(() => {});
  }, []);

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

  const indicators = (r.pillars[tab] ?? []).map(ind =>
    ind.name === GPU_RENT_IND && gpu ? { ...ind, ...gpuIndicatorPatch(gpu) } : ind);

  const ageDays = Math.floor((Date.now() - new Date(`${r.reportDate}T00:00:00+05:30`).getTime()) / 86_400_000);
  const stale = ageDays > 14;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1440px] mx-auto px-4 py-6 space-y-5">

        <AiDcLive />

        {/* MANUAL MACRO REPORT — hand-entered; folded away once it is out of date */}
        <details id="macro-report" open={!stale} className="group rounded-xl border border-border bg-card/40">
          <summary className="flex cursor-pointer list-none [&::-webkit-details-marker]:hidden flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Macro risk report (manual)</span>
            <span className="text-xs text-muted-foreground">AI Unwind Risk Score {r.score}/100 · reviewed {r.reportDate}</span>
            {stale && <Badge cl="bg-amber-100 text-amber-800 border-amber-300">{ageDays} days old</Badge>}
            <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Show</span>
            <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">Hide</span>
          </summary>
          <div className="space-y-5 px-4 pb-5">

        {/* TOP BANNER */}
        <div className={cn('flex items-center gap-2 rounded-lg border px-4 py-2.5', stale ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50')}>
          {stale ? <AlertTriangle className="size-4 text-amber-600 shrink-0" /> : <Shield className="size-4 text-emerald-600 shrink-0" />}
          <p className={cn('text-xs', stale ? 'text-amber-800' : 'text-emerald-800')}>
            {stale
              ? <><span className="font-semibold">Hand-entered on {r.reportDate} — {ageDays} days ago.</span> These figures are not current; the live sections above show today&apos;s conditions. Run the weekly prompt at the bottom to refresh this report.</>
              : <><span className="font-semibold">Verified {r.reportDate}</span> — all 37 indicators updated from market data (Yahoo, FRED) and primary releases (company results, BLS, ISM, EIA, CBRE, NSDL, AMFI, RBI); low-confidence items are marked. GPU rental index is live.</>}
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
            <Badge cl={TL_BG[r.trafficLight]}>{r.trafficLight} — Rate Shock · EM Stress · AI Sound</Badge>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Trend</span>
                {r.scorePrevMonth != null
                  ? <span className={cn('font-medium', r.score > r.scorePrevMonth ? 'text-red-500' : r.score < r.scorePrevMonth ? 'text-emerald-600' : 'text-muted-foreground')}>
                      {r.score > r.scorePrevMonth ? '▲' : r.score < r.scorePrevMonth ? '▼' : '→'} {r.score > r.scorePrevMonth ? '+' : ''}{r.score - r.scorePrevMonth} vs last month
                    </span>
                  : <span className="text-muted-foreground">—</span>}
              </div>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Executive Summary</h2>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Verified {r.reportDate}</span>
          </div>
          <div className="space-y-2">
            {r.executiveSummary.map((s, i) => {
              const sep = s.indexOf(': ');
              const label = sep > 0 ? s.slice(0, sep) : null;
              const body = sep > 0 ? s.slice(sep + 2) : s;
              const isGreen = /SOUND|BENIGN|HEALTHY|TURNING POINT/.test(label ?? '');
              const isRed = /CRISIS|SHOCK/.test(label ?? '');
              const isOrange = /ALERT|KEY EVENTS/.test(label ?? '');
              const isBlue = /VERIFIED|ALLOCATION/.test(label ?? '');
              const border = isGreen ? 'border-emerald-400' : isRed ? 'border-red-400' : isOrange ? 'border-amber-400' : isBlue ? 'border-blue-300' : 'border-slate-300';
              const lc = isGreen ? 'text-emerald-700 bg-emerald-50' : isRed ? 'text-red-700 bg-red-50' : isOrange ? 'text-amber-700 bg-amber-50' : isBlue ? 'text-blue-700 bg-blue-50' : 'text-slate-600 bg-slate-100';
              return (
                <div key={i} className={cn('flex gap-3 pl-3 py-1.5 border-l-[3px]', border)}>
                  {label && (
                    <span className={cn('text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded uppercase tracking-wider self-start', lc)}>
                      {label}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
                </div>
              );
            })}
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
        </details>

      </div>
    </div>
  );
}
