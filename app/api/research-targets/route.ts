import { NextResponse } from 'next/server';

export const maxDuration = 30;

export interface ResearchStock {
  id: number;
  company: string;
  symbol: string;
  yfSymbol: string;
  sector: string;
  stance: 'ACCUMULATE' | 'WATCH' | 'AVOID';
  researchCmp: number | null;
  target: number | null;
  horizon: '12M' | '18M' | '24M' | '3Y' | null;
  currency?: 'INR' | 'USD';
  note?: string;
}

// All deep-dive stocks — target null means no explicit price target in research
export const RESEARCH: ResearchStock[] = [
  // ── PHARMA ────────────────────────────────────────────────────────────────
  { id:  1, company: 'Kopran',               symbol: 'KOPRAN',      yfSymbol: 'KOPRAN.NS',      sector: 'Pharma',           stance: 'ACCUMULATE', researchCmp:   137.80, target:   270, horizon: '12M' },
  { id:  2, company: 'Alivus Life Sciences', symbol: 'ALIVUS',      yfSymbol: 'ALIVUS.NS',      sector: 'Pharma',           stance: 'ACCUMULATE', researchCmp:  1105,    target:  1820, horizon: '18M', note: 'Updated Q1 FY27' },
  { id:  3, company: 'Sudeep Pharma',        symbol: 'SUDEEPPHRM',  yfSymbol: 'SUDEEPPHRM.NS',  sector: 'Pharma',           stance: 'WATCH',      researchCmp:   720,    target:  null, horizon: null,  note: 'Only USFDA mineral API mfr' },
  // ── CONSUMER HEALTH ───────────────────────────────────────────────────────
  { id:  4, company: 'P&G Health',           symbol: 'PGHL',        yfSymbol: 'PGHL.NS',        sector: 'Consumer Health',  stance: 'ACCUMULATE', researchCmp:  6326,    target:  9240, horizon: '12M' },
  // ── CONSUMER / FMCG ──────────────────────────────────────────────────────
  { id:  5, company: 'Piccadily Agro',       symbol: 'PICCADIL',    yfSymbol: 'PICCADIL.NS',    sector: 'Consumer',         stance: 'ACCUMULATE', researchCmp:   565,    target:   950, horizon: '12M', note: 'Indri single malt' },
  { id:  6, company: 'Gillette India',       symbol: 'GILLETTE',    yfSymbol: 'GILLETTE.NS',    sector: 'Consumer',         stance: 'ACCUMULATE', researchCmp:  7819,    target:  null, horizon: '12M', note: 'Accum <Rs 8,200' },
  { id:  7, company: 'Bajaj Consumer Care',  symbol: 'BAJAJCON',    yfSymbol: 'BAJAJCON.NS',    sector: 'Consumer',         stance: 'WATCH',      researchCmp:   615,    target:   680, horizon: '12M' },
  { id:  8, company: 'Vintage Coffee',       symbol: 'VINCOFE',     yfSymbol: 'VINCOFE.NS',     sector: 'Consumer',         stance: 'WATCH',      researchCmp:   163,    target:   210, horizon: '18M' },
  { id:  9, company: 'IFB Agro Industries',  symbol: 'IFBAGRO',     yfSymbol: 'IFBAGRO.NS',     sector: 'Consumer',         stance: 'WATCH',      researchCmp:   958,    target:   906, horizon: '12M', note: 'Prob-weighted; Cargill aquafeed' },
  { id: 10, company: 'Vadilal Industries',   symbol: 'VADILALIND',  yfSymbol: 'VADILALIND.NS',  sector: 'Consumer',         stance: 'WATCH',      researchCmp:  6009,    target:  null, horizon: null,  note: 'Restructuring/brand scheme pending' },
  { id: 11, company: 'Varun Beverages',      symbol: 'VBL',         yfSymbol: 'VBL.NS',         sector: 'Consumer',         stance: 'AVOID',      researchCmp:   464.50, target:   375, horizon: '24M', note: 'De-rating thesis' },
  // ── REAL ESTATE ───────────────────────────────────────────────────────────
  { id: 12, company: 'Raymond Realty',       symbol: 'RAYMONDREL',  yfSymbol: 'RAYMONDREL.NS',  sector: 'Real Estate',      stance: 'ACCUMULATE', researchCmp:   676,    target:   950, horizon: '12M', note: 'Thane GDV Rs 25K Cr+' },
  // ── RECYCLING ─────────────────────────────────────────────────────────────
  { id: 13, company: 'Ganesha Ecosphere',    symbol: 'GANECOS',     yfSymbol: 'GANECOS.NS',     sector: 'Recycling',        stance: 'ACCUMULATE', researchCmp:   886,    target:  1200, horizon: '12M', note: 'EPR mandate play' },
  { id: 14, company: 'Gravita India',        symbol: 'GRAVITAINDS', yfSymbol: 'GRAVITAINDS.NS', sector: 'Recycling',        stance: 'ACCUMULATE', researchCmp:  1855,    target:  2200, horizon: '18M', note: 'Multi-metal recycler' },
  // ── INDUSTRIALS / ENGINEERING ─────────────────────────────────────────────
  { id: 15, company: 'Kilburn Engineering',  symbol: 'KILBUNENGG',  yfSymbol: 'KILBUNENGG.NS',  sector: 'Industrials',      stance: 'ACCUMULATE', researchCmp:   516,    target:   700, horizon: '12M', note: 'Nuclear AERB moat' },
  { id: 16, company: 'Ramkrishna Forgings',  symbol: 'RKFORGE',     yfSymbol: 'RKFORGE.NS',     sector: 'Industrials',      stance: 'WATCH',      researchCmp:   575,    target:   680, horizon: '12M', note: 'Rail Wheel JV + NA LV contract' },
  { id: 17, company: 'Surya Roshni',         symbol: 'SURYAROSNI',  yfSymbol: 'SURYAROSNI.NS',  sector: 'Industrials',      stance: 'WATCH',      researchCmp:   265,    target:   340, horizon: '12M', note: 'Demerger optionality' },
  { id: 18, company: 'Aeroflex Industries',  symbol: 'AEROFLEX',    yfSymbol: 'AEROFLEX.NS',    sector: 'Industrials',      stance: 'WATCH',      researchCmp:   401,    target:   450, horizon: '12M', note: 'AI cooling skids' },
  { id: 19, company: 'DEE Development',      symbol: 'DEEDEV',      yfSymbol: 'DEEDEV.NS',      sector: 'Industrials',      stance: 'WATCH',      researchCmp:   647,    target:   760, horizon: '18M', note: 'Largest process piping mfr' },
  { id: 20, company: 'KRN Heat Exchanger',   symbol: 'KRNHEAT',     yfSymbol: 'KRNHEAT.NS',     sector: 'Industrials',      stance: 'WATCH',      researchCmp:  1205,    target:  1500, horizon: '18M', note: 'Plant II Neemrana' },
  { id: 21, company: 'S J S Enterprises',    symbol: 'SJS',         yfSymbol: 'SJS.NS',         sector: 'Industrials',      stance: 'ACCUMULATE', researchCmp:  2222,    target:  null, horizon: '12M', note: 'Accum <Rs 2,000; only listed aesthetics co' },
  { id: 22, company: 'Igarashi Motors',      symbol: 'IGARASHI',    yfSymbol: 'IGARASHI.NS',    sector: 'Auto Components',  stance: 'WATCH',      researchCmp:   394,    target:   440, horizon: '12M', note: 'BLDC transition' },
  { id: 23, company: 'Endurance Tech',       symbol: 'ENDURANCE',   yfSymbol: 'ENDURANCE.NS',   sector: 'Auto Components',  stance: 'ACCUMULATE', researchCmp:  2478,    target:  3050, horizon: '3Y',  note: '3Y target midpoint' },
  { id: 24, company: 'Jyoti CNC Automation', symbol: 'JYOTICNC',    yfSymbol: 'JYOTICNC.NS',    sector: 'Industrials',      stance: 'ACCUMULATE', researchCmp:   667,    target:  null, horizon: null,  note: 'Order book Rs 4,732 Cr; Huron JR risk' },
  { id: 25, company: 'Kirloskar Electric',   symbol: 'KECL',        yfSymbol: 'KECL.NS',        sector: 'Industrials',      stance: 'AVOID',      researchCmp:   105,    target:    76, horizon: '12M', note: 'Altman Z 1.39; 75% pledged' },
  { id: 26, company: 'L.T. Elevator',        symbol: '544518',      yfSymbol: '544518.BO',      sector: 'Industrials',      stance: 'WATCH',      researchCmp:   260,    target:   395, horizon: '18M', note: 'BSE SME; India only listed elevator' },
  { id: 27, company: 'TIL Limited',          symbol: 'TIL',         yfSymbol: 'TIL.NS',         sector: 'Industrials',      stance: 'AVOID',      researchCmp:   218,    target:   130, horizon: '12M', note: 'Entry Rs 120-140' },
  // ── CHEMICALS / SPECIALITY ────────────────────────────────────────────────
  { id: 28, company: 'Clean Science',        symbol: 'CLEAN',       yfSymbol: 'CLEAN.NS',       sector: 'Chemicals',        stance: 'ACCUMULATE', researchCmp:   770,    target:  1050, horizon: '18M', note: '48% off peak' },
  { id: 29, company: 'Himadri Speciality',   symbol: 'HSCL',        yfSymbol: 'HSCL.NS',        sector: 'Chemicals',        stance: 'WATCH',      researchCmp:   662.65, target:   800, horizon: '18M', note: 'Anode + LFP; world largest SCB' },
  { id: 30, company: 'Privi Speciality',     symbol: 'PRIVISCL',    yfSymbol: 'PRIVISCL.NS',    sector: 'Chemicals',        stance: 'ACCUMULATE', researchCmp:  null,    target:  null, horizon: null,  note: "World's largest CST processor" },
  { id: 31, company: 'Xpro India',           symbol: 'XPROINDIA',   yfSymbol: 'XPROINDIA.NS',   sector: 'Chemicals',        stance: 'WATCH',      researchCmp:  1186,    target:  null, horizon: null,  note: "India's only capacitor-grade BOPP" },
  // ── METALS ────────────────────────────────────────────────────────────────
  { id: 32, company: 'Hindalco',             symbol: 'HINDALCO',    yfSymbol: 'HINDALCO.NS',    sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:  1010,    target:  1150, horizon: '12M', note: 'Bay Minette + Novelis' },
  { id: 33, company: 'Vedanta Aluminium',    symbol: 'VEDO',        yfSymbol: 'VEDO.NS',        sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:   456,    target:   610, horizon: '12M', note: 'Listed Jun 2026' },
  { id: 34, company: 'Usha Martin',          symbol: 'USHAMART',    yfSymbol: 'USHAMART.NS',    sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:   476,    target:  null, horizon: '12M', note: 'India #1 wire rope; net cash; accum Rs 420-450' },
  { id: 35, company: 'HEG Limited',          symbol: 'HEG',         yfSymbol: 'HEG.NS',         sector: 'Materials',        stance: 'ACCUMULATE', researchCmp:  null,    target:   660, horizon: '12M', note: 'SOTP / demerger; graphite electrode' },
  { id: 36, company: 'POCL',                 symbol: 'POCL',        yfSymbol: 'POCL.NS',        sector: 'Metals',           stance: 'ACCUMULATE', researchCmp:  1350,    target:  null, horizon: null,  note: 'India only LME-registered lead; accum <Rs 1,400' },
  // ── MATERIALS / REFRACTORY ────────────────────────────────────────────────
  { id: 37, company: 'RHI Magnesita India',  symbol: 'RHIM',        yfSymbol: 'RHIM.NS',        sector: 'Materials',        stance: 'WATCH',      researchCmp:   360,    target:   415, horizon: '12M' },
  { id: 38, company: 'Vesuvius India',       symbol: 'VESUVIUS',    yfSymbol: 'VESUVIUS.NS',    sector: 'Materials',        stance: 'WATCH',      researchCmp:   460,    target:  null, horizon: null,  note: 'India #1 flow-control (55% share); accum <Rs 420' },
  // ── DEFENCE / AEROSPACE ───────────────────────────────────────────────────
  { id: 39, company: 'MIDHANI',              symbol: 'MIDHANI',     yfSymbol: 'MIDHANI.NS',     sector: 'Defence',          stance: 'ACCUMULATE', researchCmp:   438,    target:   490, horizon: '12M', note: 'Only Ti alloy + superalloy mfr' },
  { id: 40, company: 'Krishna Defence',      symbol: 'KRISHNADEF',  yfSymbol: 'KRISHNADEF.NS',  sector: 'Defence',          stance: 'WATCH',      researchCmp:  1280,    target:  1550, horizon: '12M', note: 'Jalkapi XLUUV Dec 2026' },
  { id: 41, company: 'Shree Refrigerations', symbol: '544458',      yfSymbol: '544458.BO',      sector: 'Defence',          stance: 'WATCH',      researchCmp:   361,    target:   520, horizon: '12M', note: 'BSE SME; naval HVAC monopoly' },
  { id: 42, company: 'Dynamatic Tech',       symbol: 'DYNAMATECH',  yfSymbol: 'DYNAMATECH.NS',  sector: 'Defence',          stance: 'ACCUMULATE', researchCmp:  null,    target: 15500, horizon: '12M', note: 'A220 / D328eco / Falcon6X' },
  { id: 43, company: 'MTAR Technologies',    symbol: 'MTARTECH',    yfSymbol: 'MTARTECH.NS',    sector: 'Defence',          stance: 'WATCH',      researchCmp:  5805,    target:  null, horizon: null,  note: 'Bloom Energy SOEC; Bloom short-seller risk' },
  { id: 44, company: 'Aequs Limited',        symbol: 'AEQUS',       yfSymbol: 'AEQUS.NS',       sector: 'Defence',          stance: 'WATCH',      researchCmp:   195,    target:  null, horizon: null,  note: 'Hosur engine / LG pivot; PLI FY27' },
  // ── FINANCIALS ────────────────────────────────────────────────────────────
  { id: 45, company: 'JM Financial',         symbol: 'JMFINANCL',   yfSymbol: 'JMFINANCL.NS',   sector: 'Financials',       stance: 'ACCUMULATE', researchCmp:   126,    target:   175, horizon: '12M', note: 'Wealth AUM Rs 30,838 Cr' },
  { id: 46, company: 'Pine Labs',            symbol: 'PINELABS',    yfSymbol: 'PINELABS.NS',    sector: 'Fintech',          stance: 'ACCUMULATE', researchCmp:   160,    target:   200, horizon: '12M', note: 'India largest listed POS network' },
  { id: 47, company: 'Central Bank India',   symbol: 'CENTRALBK',   yfSymbol: 'CENTRALBK.NS',   sector: 'Financials',       stance: 'ACCUMULATE', researchCmp:    31,    target:  null, horizon: null,  note: 'Post-PCA turnaround; P/B 0.76x; GNPA 2.67%' },
  // ── HEALTHCARE ────────────────────────────────────────────────────────────
  { id: 48, company: 'Kovai Medical',        symbol: 'KOVAI',       yfSymbol: 'KOVAI.NS',       sector: 'Healthcare',       stance: 'ACCUMULATE', researchCmp:  6017,    target:  7700, horizon: '12M' },
  { id: 49, company: 'Artemis Medicare',     symbol: 'ARTEMISMED',  yfSymbol: 'ARTEMISMED.NS',  sector: 'Healthcare',       stance: 'ACCUMULATE', researchCmp:   276,    target:   350, horizon: '12M', note: 'Raipur + VIMHANS MSA' },
  // ── MEDIA ─────────────────────────────────────────────────────────────────
  { id: 50, company: 'Saregama India',       symbol: 'SAREGAMA',    yfSymbol: 'SAREGAMA.NS',    sector: 'Media',            stance: 'ACCUMULATE', researchCmp:   492,    target:   627, horizon: '12M', note: '1.5L song catalog' },
  // ── ENERGY / OIL ──────────────────────────────────────────────────────────
  { id: 51, company: 'Vedanta Oil & Gas',    symbol: 'VOGL',        yfSymbol: 'VOGL.NS',        sector: 'Energy',           stance: 'WATCH',      researchCmp:    33,    target:  null, horizon: null,  note: 'Accum <Rs 28; PSC 2030 risk' },
  { id: 52, company: 'Bloom Energy',         symbol: 'BE',          yfSymbol: 'BE',             sector: 'Energy',           stance: 'WATCH',      researchCmp:   243.40, target:   260, horizon: '18M', currency: 'USD', note: 'NYSE; Oracle 2.8 GW deal' },
  // ── HOTELS ─────────────────────────────────────────────────────────────────
  { id: 53, company: 'IHCL (Indian Hotels)', symbol: 'INDHOTEL',    yfSymbol: 'INDHOTEL.NS',    sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    target:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
  { id: 54, company: 'EIH Limited',          symbol: 'EIHOTEL',     yfSymbol: 'EIHOTEL.NS',     sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    target:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
  { id: 55, company: 'Lemon Tree Hotels',    symbol: 'LEMONTREE',   yfSymbol: 'LEMONTREE.NS',   sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    target:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
  { id: 56, company: 'Taj GVK Hotels',       symbol: 'TAJGVK',      yfSymbol: 'TAJGVK.NS',      sector: 'Hotels',           stance: 'ACCUMULATE', researchCmp:  null,    target:  null, horizon: null,  note: 'Sector deep-dive; ACCUMULATE' },
];

interface LivePrice { price: number; changePct: number }

async function fetchPriceV8(yfSymbol: string): Promise<LivePrice | null> {
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

async function fetchAllPrices(stocks: ResearchStock[]): Promise<Map<string, LivePrice>> {
  const map = new Map<string, LivePrice>();
  const unique = [...new Set(stocks.map(s => s.yfSymbol))];
  const CONCURRENCY = 8;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(sym => fetchPriceV8(sym)));
    batch.forEach((sym, j) => { if (results[j]) map.set(sym, results[j]!); });
  }
  return map;
}

export async function GET() {
  const prices = await fetchAllPrices(RESEARCH);

  const rows = RESEARCH.map(stock => {
    const live = prices.get(stock.yfSymbol);
    const livePrice = live?.price ?? null;
    const changePct = live?.changePct ?? null;
    const expectedReturn = (livePrice != null && stock.target != null)
      ? ((stock.target - livePrice) / livePrice) * 100
      : null;
    const vsCmp = (livePrice != null && stock.researchCmp != null)
      ? ((livePrice - stock.researchCmp) / stock.researchCmp) * 100
      : null;
    return { ...stock, livePrice, changePct, expectedReturn, vsCmp };
  });

  return NextResponse.json({ rows, fetchedAt: new Date().toISOString() });
}
