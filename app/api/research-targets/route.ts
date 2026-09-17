import { NextRequest, NextResponse } from 'next/server';
import { fetchEquityQuotes } from '@/lib/dhan-api';

export const maxDuration = 60;

interface ResearchStock {
  id: number;
  company: string;
  symbol: string;
  yfSymbol: string;
  sector: string;
  stance: 'ACCUMULATE' | 'WATCH' | 'AVOID';
  researchCmp: number | null;
  baseTarget: number | null;  // base-case price target
  bullTarget: number | null;  // bull-case price target
  horizon: '12M' | '18M' | '24M' | '3Y' | null;
  currency?: 'INR' | 'USD';
  note?: string;
}

// All deep-dive stocks. baseTarget = base-case, bullTarget = bull-case.
// expectedReturn = avg(baseTarget, bullTarget) vs live CMP.
// Fill in bullTarget from your research PDFs — null = not yet set.
const RESEARCH: ResearchStock[] = [
  // ── PHARMA ────────────────────────────────────────────────────────────────
  { id:  1, company: 'Kopran',               symbol: 'KOPRAN',      yfSymbol: 'KOPRAN.NS',      sector: 'Pharma',           stance: 'ACCUMULATE', researchCmp:   137.80, baseTarget:   270, bullTarget:   340, horizon: '12M' },
  { id:  2, company: 'Alivus Life Sciences', symbol: 'ALIVUS',      yfSymbol: 'ALIVUS.NS',      sector: 'Pharma',           stance: 'ACCUMULATE', researchCmp:  1105,    baseTarget:  1820, bullTarget:  2300, horizon: '18M', note: 'Updated Q1 FY27' },
  { id:  3, company: 'Sudeep Pharma',        symbol: 'SUDEEPPHRM',  yfSymbol: 'SUDEEPPHRM.NS',  sector: 'Pharma',           stance: 'WATCH',      researchCmp:   720,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Only USFDA mineral API mfr' },
  // ── CONSUMER HEALTH ───────────────────────────────────────────────────────
  { id:  4, company: 'P&G Health',           symbol: 'PGHL',        yfSymbol: 'PGHL.NS',        sector: 'Consumer Health',  stance: 'ACCUMULATE', researchCmp:  6326,    baseTarget:  9240, bullTarget: 11500, horizon: '12M' },
  // ── CONSUMER / FMCG ──────────────────────────────────────────────────────
  { id:  5, company: 'Piccadily Agro',       symbol: 'PICCADIL',    yfSymbol: 'PICCADIL.NS',    sector: 'Consumer',         stance: 'ACCUMULATE', researchCmp:   565,    baseTarget:   950, bullTarget:  1200, horizon: '12M', note: 'Indri single malt' },
  { id:  6, company: 'Gillette India',       symbol: 'GILLETTE',    yfSymbol: 'GILLETTE.NS',    sector: 'Consumer',         stance: 'ACCUMULATE', researchCmp:  7819,    baseTarget:  null, bullTarget:  null, horizon: '12M', note: 'Accum <Rs 8,200' },
  { id:  7, company: 'Bajaj Consumer Care',  symbol: 'BAJAJCON',    yfSymbol: 'BAJAJCON.NS',    sector: 'Consumer',         stance: 'WATCH',      researchCmp:   615,    baseTarget:   680, bullTarget:   780, horizon: '12M' },
  { id:  8, company: 'Vintage Coffee',       symbol: 'VINCOFE',     yfSymbol: 'VINCOFE.NS',     sector: 'Consumer',         stance: 'WATCH',      researchCmp:   163,    baseTarget:   210, bullTarget:   260, horizon: '18M' },
  { id:  9, company: 'IFB Agro Industries',  symbol: 'IFBAGRO',     yfSymbol: 'IFBAGRO.NS',     sector: 'Consumer',         stance: 'WATCH',      researchCmp:   958,    baseTarget:   906, bullTarget:  1100, horizon: '12M', note: 'Prob-weighted; Cargill aquafeed' },
  { id: 10, company: 'Vadilal Industries',   symbol: 'VADILALIND',  yfSymbol: 'VADILALIND.NS',  sector: 'Consumer',         stance: 'WATCH',      researchCmp:  6009,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Restructuring/brand scheme pending' },
  { id: 11, company: 'Varun Beverages',      symbol: 'VBL',         yfSymbol: 'VBL.NS',         sector: 'Consumer',         stance: 'AVOID',      researchCmp:   464.50, baseTarget:   375, bullTarget:  null, horizon: '24M', note: 'De-rating thesis' },
  // ── REAL ESTATE ───────────────────────────────────────────────────────────
  { id: 12, company: 'Raymond Realty',       symbol: 'RAYMONDREL',  yfSymbol: 'RAYMONDREL.NS',  sector: 'Real Estate',      stance: 'ACCUMULATE', researchCmp:   676,    baseTarget:   950, bullTarget:  1200, horizon: '12M', note: 'Thane GDV Rs 25K Cr+' },
  // ── RECYCLING ─────────────────────────────────────────────────────────────
  { id: 13, company: 'Ganesha Ecosphere',    symbol: 'GANECOS',     yfSymbol: 'GANECOS.NS',     sector: 'Recycling',        stance: 'ACCUMULATE', researchCmp:   886,    baseTarget:  1200, bullTarget:  1500, horizon: '12M', note: 'EPR mandate play' },
  { id: 14, company: 'Gravita India',        symbol: 'GRAVITAINDS', yfSymbol: 'GRAVITAINDS.NS', sector: 'Recycling',        stance: 'ACCUMULATE', researchCmp:  1855,    baseTarget:  2200, bullTarget:  2800, horizon: '18M', note: 'Multi-metal recycler' },
  // ── INDUSTRIALS / ENGINEERING ─────────────────────────────────────────────
  { id: 15, company: 'Kilburn Engineering',  symbol: 'KILBUNENGG',  yfSymbol: 'KILBUNENGG.NS',  sector: 'Industrials',      stance: 'ACCUMULATE', researchCmp:   516,    baseTarget:   700, bullTarget:   900, horizon: '12M', note: 'Nuclear AERB moat' },
  { id: 16, company: 'Ramkrishna Forgings',  symbol: 'RKFORGE',     yfSymbol: 'RKFORGE.NS',     sector: 'Industrials',      stance: 'WATCH',      researchCmp:   575,    baseTarget:   680, bullTarget:   820, horizon: '12M', note: 'Rail Wheel JV + NA LV contract' },
  { id: 17, company: 'Surya Roshni',         symbol: 'SURYAROSNI',  yfSymbol: 'SURYAROSNI.NS',  sector: 'Industrials',      stance: 'WATCH',      researchCmp:   265,    baseTarget:   340, bullTarget:   420, horizon: '12M', note: 'Demerger optionality' },
  { id: 18, company: 'Aeroflex Industries',  symbol: 'AEROFLEX',    yfSymbol: 'AEROFLEX.NS',    sector: 'Industrials',      stance: 'WATCH',      researchCmp:   401,    baseTarget:   450, bullTarget:   560, horizon: '12M', note: 'AI cooling skids' },
  { id: 19, company: 'DEE Development',      symbol: 'DEEDEV',      yfSymbol: 'DEEDEV.NS',      sector: 'Industrials',      stance: 'WATCH',      researchCmp:   647,    baseTarget:   760, bullTarget:   950, horizon: '18M', note: 'Largest process piping mfr' },
  { id: 20, company: 'KRN Heat Exchanger',   symbol: 'KRNHEAT',     yfSymbol: 'KRNHEAT.NS',     sector: 'Industrials',      stance: 'WATCH',      researchCmp:  1205,    baseTarget:  1500, bullTarget:  1900, horizon: '18M', note: 'Plant II Neemrana' },
  { id: 21, company: 'S J S Enterprises',    symbol: 'SJS',         yfSymbol: 'SJS.NS',         sector: 'Industrials',      stance: 'ACCUMULATE', researchCmp:  2222,    baseTarget:  null, bullTarget:  null, horizon: '12M', note: 'Accum <Rs 2,000; only listed aesthetics co' },
  { id: 22, company: 'Igarashi Motors',      symbol: 'IGARASHI',    yfSymbol: 'IGARASHI.NS',    sector: 'Auto Components',  stance: 'WATCH',      researchCmp:   394,    baseTarget:   440, bullTarget:   540, horizon: '12M', note: 'BLDC transition' },
  { id: 23, company: 'Endurance Tech',       symbol: 'ENDURANCE',   yfSymbol: 'ENDURANCE.NS',   sector: 'Auto Components',  stance: 'ACCUMULATE', researchCmp:  2478,    baseTarget:  3050, bullTarget:  3800, horizon: '3Y',  note: '3Y target midpoint' },
  { id: 24, company: 'Jyoti CNC Automation', symbol: 'JYOTICNC',    yfSymbol: 'JYOTICNC.NS',    sector: 'Industrials',      stance: 'ACCUMULATE', researchCmp:   667,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Order book Rs 4,732 Cr; Huron JR risk' },
  { id: 25, company: 'Kirloskar Electric',   symbol: 'KECL',        yfSymbol: 'KECL.NS',        sector: 'Industrials',      stance: 'AVOID',      researchCmp:   105,    baseTarget:    76, bullTarget:  null, horizon: '12M', note: 'Altman Z 1.39; 75% pledged' },
  { id: 26, company: 'L.T. Elevator',        symbol: '544518',      yfSymbol: '544518.BO',      sector: 'Industrials',      stance: 'WATCH',      researchCmp:   260,    baseTarget:   395, bullTarget:   500, horizon: '18M', note: 'BSE SME; India only listed elevator' },
  { id: 27, company: 'TIL Limited',          symbol: 'TIL',         yfSymbol: 'TIL.NS',         sector: 'Industrials',      stance: 'AVOID',      researchCmp:   218,    baseTarget:   130, bullTarget:  null, horizon: '12M', note: 'Entry Rs 120-140' },
  // ── CHEMICALS / SPECIALITY ────────────────────────────────────────────────
  { id: 28, company: 'Clean Science',        symbol: 'CLEAN',       yfSymbol: 'CLEAN.NS',       sector: 'Chemicals',        stance: 'ACCUMULATE', researchCmp:   770,    baseTarget:  1050, bullTarget:  1350, horizon: '18M', note: '48% off peak' },
  { id: 29, company: 'Himadri Speciality',   symbol: 'HSCL',        yfSymbol: 'HSCL.NS',        sector: 'Chemicals',        stance: 'WATCH',      researchCmp:   662.65, baseTarget:   800, bullTarget:  1000, horizon: '18M', note: 'Anode + LFP; world largest SCB' },
  { id: 30, company: 'Privi Speciality',     symbol: 'PRIVISCL',    yfSymbol: 'PRIVISCL.NS',    sector: 'Chemicals',        stance: 'ACCUMULATE', researchCmp:  null,    baseTarget:  null, bullTarget:  null, horizon: null,  note: "World's largest CST processor" },
  { id: 31, company: 'Xpro India',           symbol: 'XPROINDIA',   yfSymbol: 'XPROINDIA.NS',   sector: 'Chemicals',        stance: 'WATCH',      researchCmp:  1186,    baseTarget:  null, bullTarget:  null, horizon: null,  note: "India's only capacitor-grade BOPP" },
  // ── METALS ────────────────────────────────────────────────────────────────
  { id: 32, company: 'Hindalco',             symbol: 'HINDALCO',    yfSymbol: 'HINDALCO.NS',    sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:  1010,    baseTarget:  1150, bullTarget:  1400, horizon: '12M', note: 'Bay Minette + Novelis' },
  { id: 33, company: 'Vedanta Aluminium',    symbol: 'VEDO',        yfSymbol: 'VEDO.NS',        sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:   456,    baseTarget:   610, bullTarget:   780, horizon: '12M', note: 'Listed Jun 2026' },
  { id: 34, company: 'Usha Martin',          symbol: 'USHAMART',    yfSymbol: 'USHAMART.NS',    sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:   476,    baseTarget:  null, bullTarget:  null, horizon: '12M', note: 'India #1 wire rope; net cash; accum Rs 420-450' },
  { id: 35, company: 'HEG Limited',          symbol: 'HEG',         yfSymbol: 'HEG.NS',         sector: 'Materials',        stance: 'ACCUMULATE', researchCmp:  null,    baseTarget:   660, bullTarget:   850, horizon: '12M', note: 'SOTP / demerger; graphite electrode' },
  { id: 36, company: 'POCL',                 symbol: 'POCL',        yfSymbol: 'POCL.NS',        sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:  1350,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'India only LME-registered lead; accum <Rs 1,400' },
  // ── MATERIALS / REFRACTORY ────────────────────────────────────────────────
  { id: 37, company: 'RHI Magnesita India',  symbol: 'RHIM',        yfSymbol: 'RHIM.NS',        sector: 'Materials',        stance: 'WATCH',      researchCmp:   360,    baseTarget:   415, bullTarget:   510, horizon: '12M' },
  { id: 38, company: 'Vesuvius India',       symbol: 'VESUVIUS',    yfSymbol: 'VESUVIUS.NS',    sector: 'Materials',        stance: 'WATCH',      researchCmp:   460,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'India #1 flow-control (55% share); accum <Rs 420' },
  // ── DEFENCE / AEROSPACE ───────────────────────────────────────────────────
  { id: 39, company: 'MIDHANI',              symbol: 'MIDHANI',     yfSymbol: 'MIDHANI.NS',     sector: 'Defence',          stance: 'ACCUMULATE', researchCmp:   438,    baseTarget:   490, bullTarget:   600, horizon: '12M', note: 'Only Ti alloy + superalloy mfr' },
  { id: 40, company: 'Krishna Defence',      symbol: 'KRISHNADEF',  yfSymbol: 'KRISHNADEF.NS',  sector: 'Defence',          stance: 'WATCH',      researchCmp:  1280,    baseTarget:  1550, bullTarget:  2000, horizon: '12M', note: 'Jalkapi XLUUV Dec 2026' },
  { id: 41, company: 'Shree Refrigerations', symbol: '544458',      yfSymbol: '544458.BO',      sector: 'Defence',          stance: 'WATCH',      researchCmp:   361,    baseTarget:   520, bullTarget:   680, horizon: '12M', note: 'BSE SME; naval HVAC monopoly' },
  { id: 42, company: 'Dynamatic Tech',       symbol: 'DYNAMATECH',  yfSymbol: 'DYNAMATECH.NS',  sector: 'Defence',          stance: 'ACCUMULATE', researchCmp:  null,    baseTarget: 15500, bullTarget: 20000, horizon: '12M', note: 'A220 / D328eco / Falcon6X' },
  { id: 43, company: 'MTAR Technologies',    symbol: 'MTARTECH',    yfSymbol: 'MTARTECH.NS',    sector: 'Defence',          stance: 'WATCH',      researchCmp:  5805,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Bloom Energy SOEC; Bloom short-seller risk' },
  { id: 44, company: 'Aequs Limited',        symbol: 'AEQUS',       yfSymbol: 'AEQUS.NS',       sector: 'Defence',          stance: 'WATCH',      researchCmp:   195,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Hosur engine / LG pivot; PLI FY27' },
  // ── FINANCIALS ────────────────────────────────────────────────────────────
  { id: 45, company: 'JM Financial',         symbol: 'JMFINANCL',   yfSymbol: 'JMFINANCL.NS',   sector: 'Financials',       stance: 'ACCUMULATE', researchCmp:   126,    baseTarget:   175, bullTarget:   220, horizon: '12M', note: 'Wealth AUM Rs 30,838 Cr' },
  { id: 46, company: 'Pine Labs',            symbol: 'PINELABS',    yfSymbol: 'PINELABS.NS',    sector: 'Fintech',          stance: 'ACCUMULATE', researchCmp:   160,    baseTarget:   200, bullTarget:   260, horizon: '12M', note: 'India largest listed POS network' },
  { id: 47, company: 'Central Bank India',   symbol: 'CENTRALBK',   yfSymbol: 'CENTRALBK.NS',   sector: 'Financials',       stance: 'ACCUMULATE', researchCmp:    31,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Post-PCA turnaround; P/B 0.76x; GNPA 2.67%' },
  // ── HEALTHCARE ────────────────────────────────────────────────────────────
  { id: 48, company: 'Kovai Medical',        symbol: 'KOVAI',       yfSymbol: 'KOVAI.NS',       sector: 'Healthcare',       stance: 'ACCUMULATE', researchCmp:  6017,    baseTarget:  7700, bullTarget:  9500, horizon: '12M' },
  { id: 49, company: 'Artemis Medicare',     symbol: 'ARTEMISMED',  yfSymbol: 'ARTEMISMED.NS',  sector: 'Healthcare',       stance: 'ACCUMULATE', researchCmp:   276,    baseTarget:   350, bullTarget:   450, horizon: '12M', note: 'Raipur + VIMHANS MSA' },
  // ── MEDIA ─────────────────────────────────────────────────────────────────
  { id: 50, company: 'Saregama India',       symbol: 'SAREGAMA',    yfSymbol: 'SAREGAMA.NS',    sector: 'Media',            stance: 'ACCUMULATE', researchCmp:   492,    baseTarget:   627, bullTarget:   800, horizon: '12M', note: '1.5L song catalog' },
  // ── ENERGY / OIL ──────────────────────────────────────────────────────────
  { id: 51, company: 'Vedanta Oil & Gas',    symbol: 'VOGL',        yfSymbol: 'VOGL.NS',        sector: 'Energy',           stance: 'WATCH',      researchCmp:    33,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Accum <Rs 28; PSC 2030 risk' },
  { id: 52, company: 'Bloom Energy',         symbol: 'BE',          yfSymbol: 'BE',             sector: 'Energy',           stance: 'WATCH',      researchCmp:   243.40, baseTarget:   260, bullTarget:   340, horizon: '18M', currency: 'USD', note: 'NYSE; Oracle 2.8 GW deal' },
  // ── HOTELS ─────────────────────────────────────────────────────────────────
  { id: 53, company: 'IHCL (Indian Hotels)', symbol: 'INDHOTEL',    yfSymbol: 'INDHOTEL.NS',    sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
  { id: 54, company: 'EIH Limited',          symbol: 'EIHOTEL',     yfSymbol: 'EIHOTEL.NS',     sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
  { id: 55, company: 'Lemon Tree Hotels',    symbol: 'LEMONTREE',   yfSymbol: 'LEMONTREE.NS',   sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
  { id: 56, company: 'Taj GVK Hotels',       symbol: 'TAJGVK',      yfSymbol: 'TAJGVK.NS',      sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    baseTarget:  null, bullTarget:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
];

interface LivePrice { price: number; changePct: number }

// Yahoo Finance fallback — BSE SME (.BO), NYSE (USD), and any Dhan-uncovered NSE stocks
async function fetchPriceYahoo(yfSymbol: string): Promise<LivePrice | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?interval=1d&range=5d&includeAdjustedClose=false`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
      (c: unknown) => typeof c === 'number' && !isNaN(c) && c > 0,
    );
    if (closes.length < 1) return null;
    const last = closes[closes.length - 1];
    const prev = closes.length >= 2 ? closes[closes.length - 2] : last;
    return { price: last, changePct: prev ? ((last - prev) / prev) * 100 : 0 };
  } catch { return null; }
}

async function fetchYahooBatch(yfSymbols: string[]): Promise<Map<string, LivePrice>> {
  const map = new Map<string, LivePrice>();
  const CONCURRENCY = 8;
  for (let i = 0; i < yfSymbols.length; i += CONCURRENCY) {
    const batch = yfSymbols.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(sym => fetchPriceYahoo(sym)));
    batch.forEach((sym, j) => { if (results[j]) map.set(sym, results[j]!); });
  }
  return map;
}

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  // Dhan covers NSE equity stocks; BSE SME (.BO) and NYSE (USD) always via Yahoo
  const nseStocks   = RESEARCH.filter(s => !s.yfSymbol.endsWith('.BO') && s.currency !== 'USD');
  const nonNseStocks = RESEARCH.filter(s =>  s.yfSymbol.endsWith('.BO') || s.currency === 'USD');

  // Parallel: Dhan for NSE (when creds provided) + Yahoo for BSE/NYSE
  const [dhanQuotes, yahooNonNse] = await Promise.all([
    (clientId && accessToken)
      ? fetchEquityQuotes(nseStocks.map(s => s.symbol), clientId, accessToken)
      : Promise.resolve(new Map<string, { ltp: number; changePct: number }>()),
    fetchYahooBatch(nonNseStocks.map(s => s.yfSymbol)),
  ]);

  // Fallback to Yahoo Finance for any NSE stock Dhan didn't return
  const dhanMisses    = nseStocks.filter(s => !dhanQuotes.has(s.symbol));
  const yahooNseFall  = dhanMisses.length > 0
    ? await fetchYahooBatch(dhanMisses.map(s => s.yfSymbol))
    : new Map<string, LivePrice>();

  // Merge into a single yfSymbol → LivePrice map
  const nseBySymbol = new Map(nseStocks.map(s => [s.symbol, s]));
  const prices      = new Map<string, LivePrice>();

  for (const [yfSym, lp] of yahooNonNse)  prices.set(yfSym, lp);
  for (const [sym,   q]  of dhanQuotes) {
    const stock = nseBySymbol.get(sym);
    if (stock) prices.set(stock.yfSymbol, { price: q.ltp, changePct: q.changePct });
  }
  for (const [yfSym, lp] of yahooNseFall) prices.set(yfSym, lp);

  const rows = RESEARCH.map(stock => {
    const live      = prices.get(stock.yfSymbol);
    const livePrice = live?.price     ?? null;
    const changePct = live?.changePct ?? null;

    // Expected return = avg(base, bull) vs live CMP when both targets exist;
    // falls back to whichever single target is set.
    let expectedReturn: number | null = null;
    if (livePrice != null) {
      const { baseTarget: b, bullTarget: u } = stock;
      if (b != null && u != null) {
        expectedReturn = (((b + u) / 2) - livePrice) / livePrice * 100;
      } else if (b != null) {
        expectedReturn = (b - livePrice) / livePrice * 100;
      } else if (u != null) {
        expectedReturn = (u - livePrice) / livePrice * 100;
      }
    }

    const vsCmp = (livePrice != null && stock.researchCmp != null)
      ? ((livePrice - stock.researchCmp) / stock.researchCmp) * 100
      : null;

    // Keep `target` for backward compat (equals baseTarget)
    return { ...stock, target: stock.baseTarget, livePrice, changePct, expectedReturn, vsCmp };
  });

  const source = (clientId && accessToken) ? 'dhan' : 'yahoo';
  return NextResponse.json({ rows, fetchedAt: new Date().toISOString(), source });
}
