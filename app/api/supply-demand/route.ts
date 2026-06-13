import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import type { SupplyDemandTheme, SupplyDemandSnapshot, LivePrice, Category, PricingPower } from '@/lib/supply-demand-types';
import { slugify, mergeIntoTracker, EMPTY_TRACKER } from '@/lib/supply-demand-tracker';
import type { SupplyDemandTracker } from '@/lib/supply-demand-tracker';

export const maxDuration = 55;

// ── Commodity universe ─────────────────────────────────────────────────────────
// Uses Yahoo Finance free API — same as all other tabs in this app.
// ticker: Yahoo Finance symbol
// unit: display unit for prices
// beneficiaries/adverselyAffected: NSE-listed Indian equities
interface CommodityDef {
  name:               string;
  ticker:             string;
  unit:               string;
  sector:             string;
  timeHorizon:        SupplyDemandTheme['timeHorizon'];
  historicalAnalog:   string;
  sources:            string[];
  beneficiaries: Array<{ symbol: string; company: string; rationale: string; impact: 'high' | 'medium' | 'low' }>;
  adverselyAffected: Array<{ symbol: string; company: string; rationale: string; impact: 'high' | 'medium' | 'low' }>;
}

const COMMODITIES: CommodityDef[] = [
  {
    name: 'Crude Oil (WTI)', ticker: 'CL=F', unit: '$/barrel', sector: 'Energy',
    timeHorizon: 'near-term',
    historicalAnalog: '2014-16 supply glut when OPEC+ raised output, crushing OMC margins',
    sources: ['EIA Weekly Petroleum Report', 'OPEC Monthly Oil Market Report', 'Reuters Energy'],
    beneficiaries: [
      { symbol: 'BPCL',   company: 'BPCL',             rationale: 'Lower crude input cost expands refining margins', impact: 'high' },
      { symbol: 'IOC',    company: 'Indian Oil Corp',   rationale: 'OMC benefits from cheaper crude and wider GRMs', impact: 'high' },
      { symbol: 'HINDPETRO', company: 'HPCL',          rationale: 'Downstream margin expansion on lower feedstock', impact: 'high' },
      { symbol: 'INDIGO', company: 'IndiGo',            rationale: 'Aviation turbine fuel cost declines', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'ONGC',   company: 'ONGC',              rationale: 'Upstream realization falls with lower oil prices', impact: 'high' },
      { symbol: 'OIL',    company: 'Oil India',          rationale: 'Oil field economics deteriorate at lower prices', impact: 'high' },
      { symbol: 'RELIANCE', company: 'Reliance Industries', rationale: 'O2C segment margins compress at lower crude spread', impact: 'medium' },
    ],
  },
  {
    name: 'Natural Gas', ticker: 'NG=F', unit: '$/MMBtu', sector: 'Energy',
    timeHorizon: 'medium-term',
    historicalAnalog: '2022 European energy crisis when gas prices spiked 10x post Ukraine invasion',
    sources: ['EIA Natural Gas Storage Report', 'Bloomberg Energy', 'PPAC India'],
    beneficiaries: [
      { symbol: 'GAIL',   company: 'GAIL (India)',       rationale: 'Gas transmission volumes and trading margins improve', impact: 'high' },
      { symbol: 'PETRONET', company: 'Petronet LNG',     rationale: 'LNG regasification demand grows with gas shortages', impact: 'high' },
      { symbol: 'GSPL',   company: 'GSPL',               rationale: 'Gujarat gas pipeline utilisation rises', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'CHAMBAL', company: 'Chambal Fertilisers', rationale: 'Natural gas is primary feedstock for urea — input cost spike', impact: 'high' },
      { symbol: 'COROMANDEL', company: 'Coromandel International', rationale: 'DAP/MAP production costs rise with gas price', impact: 'medium' },
      { symbol: 'DEEPAKNITRIT', company: 'Deepak Nitrite',  rationale: 'Energy-intensive chemical processes face margin pressure', impact: 'medium' },
    ],
  },
  {
    name: 'Copper', ticker: 'HG=F', unit: '$/lb', sector: 'Base Metals',
    timeHorizon: 'medium-term',
    historicalAnalog: '2010-11 copper supercycle driven by China urbanisation and constrained Chilean output',
    sources: ['LME Market Report', 'Wood Mackenzie Copper Outlook', 'ICSG Copper Bulletin'],
    beneficiaries: [
      { symbol: 'HINDALCO', company: 'Hindalco Industries', rationale: 'Copper smelting business benefits from higher LME prices', impact: 'high' },
      { symbol: 'STERLITE', company: 'Sterlite Technologies', rationale: 'Optical fibre demand tied to electrification; copper wiring volumes rise', impact: 'medium' },
      { symbol: 'POLYCAB', company: 'Polycab India',          rationale: 'Wire and cable ASPs rise as copper content re-prices', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'HAVELLS',  company: 'Havells India',      rationale: 'Electrical equipment cost base rises with copper input', impact: 'medium' },
      { symbol: 'KEI',      company: 'KEI Industries',     rationale: 'Cable margin compression if input cost cannot be passed through', impact: 'medium' },
      { symbol: 'VOLTAS',   company: 'Voltas',             rationale: 'AC manufacturing uses copper in heat exchangers — cost headwind', impact: 'low' },
    ],
  },
  {
    name: 'Aluminium', ticker: 'AA', unit: '$/sh (Alcoa proxy)', sector: 'Base Metals',
    timeHorizon: 'medium-term',
    historicalAnalog: '2018 US sanctions on Rusal triggered 30% price spike in weeks',
    sources: ['LME Daily Report', 'International Aluminium Institute', 'Reuters Metals'],
    beneficiaries: [
      { symbol: 'HINDALCO', company: 'Hindalco Industries', rationale: 'Primary aluminium producer — direct price beneficiary', impact: 'high' },
      { symbol: 'NALCO',    company: 'NALCO',               rationale: 'State-owned aluminium smelter benefits from LME rally', impact: 'high' },
      { symbol: 'VEDL',     company: 'Vedanta',             rationale: 'Aluminium segment revenue expands with higher prices', impact: 'high' },
    ],
    adverselyAffected: [
      { symbol: 'TATAMOTORS', company: 'Tata Motors',   rationale: 'Automotive aluminium body costs rise', impact: 'medium' },
      { symbol: 'APOLLO',     company: 'Apollo Tyres',  rationale: 'Rim/wheel costs rise for OEM supply chain', impact: 'low' },
      { symbol: 'SKIPPER',    company: 'Skipper Ltd',   rationale: 'Power transmission tower fabrication cost base rises', impact: 'medium' },
    ],
  },
  {
    name: 'Steel', ticker: 'X', unit: '$/sh (US Steel proxy)', sector: 'Steel',
    timeHorizon: 'medium-term',
    historicalAnalog: '2015-16 China steel dumping cycle that crushed global mills and spurred anti-dumping duties',
    sources: ['World Steel Association', 'SteelMint India', 'Platts Steel Markets Daily'],
    beneficiaries: [
      { symbol: 'TATASTEEL', company: 'Tata Steel',    rationale: 'Largest Indian steelmaker — top-line and EBITDA move with HRC', impact: 'high' },
      { symbol: 'JSWSTEEL',  company: 'JSW Steel',     rationale: 'Integrated producer benefits from realization improvement', impact: 'high' },
      { symbol: 'SAIL',      company: 'SAIL',           rationale: 'Public sector steel — earnings highly leveraged to prices', impact: 'high' },
    ],
    adverselyAffected: [
      { symbol: 'ASHOKLEY',  company: 'Ashok Leyland', rationale: 'CV body fabrication costs rise with steel', impact: 'medium' },
      { symbol: 'JINDALSAW', company: 'Jindal Saw',    rationale: 'Pipe fabrication business margin compresses on higher input', impact: 'medium' },
      { symbol: 'KALYANKJIL', company: 'Kalyan Jewellers', rationale: 'Jewellery display and store fitting costs minor impact', impact: 'low' },
    ],
  },
  {
    name: 'Gold', ticker: 'GC=F', unit: '$/oz', sector: 'Precious Metals',
    timeHorizon: 'long-term',
    historicalAnalog: '2008-11 safe-haven rally when gold tripled as central banks cut rates to zero',
    sources: ['World Gold Council', 'LBMA Gold Price', 'RBI Gold Reserve Data'],
    beneficiaries: [
      { symbol: 'MUTHOOTFIN', company: 'Muthoot Finance',  rationale: 'Gold loan portfolio value rises; AUM per gram improves', impact: 'high' },
      { symbol: 'MANAPPURAM', company: 'Manappuram Finance', rationale: 'Gold-backed lending book grows with collateral value', impact: 'high' },
      { symbol: 'TITAN',      company: 'Titan Company',    rationale: 'Jewellery ASP rises; inventory gains on gold holdings', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'KALYANKJIL', company: 'Kalyan Jewellers', rationale: 'Volume demand for jewellery falls as gold price rises', impact: 'medium' },
      { symbol: 'SENCO',      company: 'Senco Gold',       rationale: 'Unit volume pressure as consumer affordability reduces', impact: 'medium' },
      { symbol: 'PCJEWELLER', company: 'PC Jeweller',      rationale: 'Working capital requirement rises with gold inventory cost', impact: 'medium' },
    ],
  },
  {
    name: 'Cocoa', ticker: 'CC=F', unit: '$/tonne', sector: 'Soft Commodities',
    timeHorizon: 'near-term',
    historicalAnalog: '1977 cocoa shortage when West Africa drought sent prices up 400% in two years',
    sources: ['ICCO Quarterly Bulletin', 'Bloomberg Soft Commodities', 'FAOSTAT'],
    beneficiaries: [
      { symbol: 'DEVYANI',   company: 'Devyani International', rationale: 'QSR chocolate menu items priced upward; lower volume risk', impact: 'low' },
    ],
    adverselyAffected: [
      { symbol: 'NESTLEIND', company: 'Nestle India',      rationale: 'Cocoa-heavy SKUs (KitKat, Munch) face input cost inflation', impact: 'high' },
      { symbol: 'BRITANNIA', company: 'Britannia Industries', rationale: 'Chocolate biscuit range input cost rises', impact: 'medium' },
      { symbol: 'ITC',       company: 'ITC Ltd',            rationale: 'Bingo and chocolate confectionery segment margin pressure', impact: 'low' },
    ],
  },
  {
    name: 'Palm Oil', ticker: 'FCPO.BMD', unit: 'MYR/tonne', sector: 'Agri Commodities',
    timeHorizon: 'near-term',
    historicalAnalog: '2021-22 edible oil shortage post Ukraine war when palm, soy and sunflower all spiked together',
    sources: ['MPOB Malaysia Monthly Report', 'SEA India Solvent Extraction Bulletin', 'USDA WASDE'],
    beneficiaries: [
      { symbol: 'GOKULGOKUL', company: 'Gokul Agro Resources', rationale: 'Palm oil refiner gains on inventory as crude palm oil prices rise', impact: 'medium' },
      { symbol: 'KRBL',       company: 'KRBL',                 rationale: 'Minor; rice bran oil substitution demand rises', impact: 'low' },
    ],
    adverselyAffected: [
      { symbol: 'HINDUNILVR', company: 'HUL',           rationale: 'Edible oil is key input for soaps, cooking oils and processed foods', impact: 'high' },
      { symbol: 'MARICO',     company: 'Marico',        rationale: 'Saffola edible oils business faces direct input cost pressure', impact: 'high' },
      { symbol: 'AWL',        company: 'Adani Wilmar',  rationale: 'Fortune brand edible oil volumes and margins squeezed', impact: 'high' },
    ],
  },
  {
    name: 'Wheat', ticker: 'ZW=F', unit: '¢/bushel', sector: 'Agri Commodities',
    timeHorizon: 'near-term',
    historicalAnalog: '2007-08 global food crisis when wheat prices doubled and India imposed export bans',
    sources: ['USDA WASDE', 'FCI Procurement Data', 'IGC Grain Report'],
    beneficiaries: [
      { symbol: 'TRIVENI',  company: 'Triveni Engineering', rationale: 'Sugar-wheat crop rotation — higher wheat farm income lifts agri capex spending', impact: 'low' },
    ],
    adverselyAffected: [
      { symbol: 'BRITANNIA', company: 'Britannia Industries', rationale: 'Wheat flour is primary input for biscuits — cost headwind', impact: 'high' },
      { symbol: 'NESTLEIND', company: 'Nestle India',       rationale: 'Maggi noodles input cost rises with wheat prices', impact: 'high' },
      { symbol: 'ITC',       company: 'ITC',               rationale: 'Sunfeast biscuit and pasta range input cost rises', impact: 'medium' },
    ],
  },
  {
    name: 'Urea', ticker: 'CF', unit: '$/sh (CF Inds proxy)', sector: 'Fertilisers',
    timeHorizon: 'near-term',
    historicalAnalog: '2021-22 energy crisis when European gas-to-urea spread collapsed, forcing plant shutdowns and India scrambling for imports',
    sources: ['FAI India Fertiliser Review', 'PPAC Natural Gas Data', 'Fertecon Urea Price Assessment'],
    beneficiaries: [
      { symbol: 'CHAMBAL',    company: 'Chambal Fertilisers',          rationale: 'Domestic urea producer — higher realisations expand operating margins', impact: 'high' },
      { symbol: 'GNFC',       company: 'Gujarat Narmada Valley Ferts', rationale: 'Gas-based urea capacity benefits from improved price environment', impact: 'high' },
      { symbol: 'GSFC',       company: 'Gujarat State Fertilizers',    rationale: 'Multi-product fertilizer company with urea exposure', impact: 'medium' },
      { symbol: 'COROMANDEL', company: 'Coromandel International',     rationale: 'Complex fertilizer margins improve with higher agri-input pricing', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'UPL',     company: 'UPL Ltd',       rationale: 'Higher input costs for crop protection linked to fertilizer cycle; farmer spending squeezes', impact: 'medium' },
      { symbol: 'PIIND',   company: 'PI Industries', rationale: 'Agri input cost environment pressures farm spending on agrochemicals', impact: 'low' },
      { symbol: 'RALLIS',  company: 'Rallis India',  rationale: 'Higher urea costs reduce farmer disposable income for other agri inputs', impact: 'low' },
    ],
  },
  {
    name: 'Optical Fiber', ticker: 'VIAV', unit: '$/sh (Viavi proxy)', sector: 'Technology Infrastructure',
    timeHorizon: 'medium-term',
    historicalAnalog: '2000-01 telecom bubble when fiber was massively over-built; now data-center-driven demand is creating a genuine structural shortage',
    sources: ['Dell\'Oro Group Fiber Forecast', 'CRU Optical Fibre & Cable Report', 'Corning Investor Presentations'],
    beneficiaries: [
      { symbol: 'HFCL',    company: 'HFCL Ltd',               rationale: 'India\'s largest fiber manufacturer — order book surges with telecom and data centre buildout', impact: 'high' },
      { symbol: 'STLTECH', company: 'Sterlite Technologies',   rationale: 'Optical fiber and cable supplier to global hyperscalers and telecom operators', impact: 'high' },
      { symbol: 'BIRLA',   company: 'Birla Cable',             rationale: 'Optical fiber cable manufacturer benefits from rising realisations', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'BHARTIARTL', company: 'Bharti Airtel',  rationale: 'Higher fiber and cable costs raise network capex for 5G and broadband rollout', impact: 'medium' },
      { symbol: 'RELIANCE',   company: 'Reliance Jio',   rationale: 'Jio\'s aggressive fiber-to-home expansion faces higher per-km network cost', impact: 'medium' },
      { symbol: 'TATACOMM',   company: 'Tata Communications', rationale: 'Undersea and terrestrial cable network upgrades become more expensive', impact: 'low' },
    ],
  },
  {
    name: 'Shipping Freight', ticker: 'ZIM', unit: '$/sh (ZIM proxy)', sector: 'Logistics',
    timeHorizon: 'near-term',
    historicalAnalog: '2021-22 container shipping supercycle when freight rates rose 10x and Maersk/ZIM printed record profits; reversed sharply in 2023',
    sources: ['Drewry World Container Index', 'Baltic Dry Index', 'Clarksons Shipping Intelligence'],
    beneficiaries: [
      { symbol: 'GESHIP',  company: 'Great Eastern Shipping', rationale: 'Tanker and dry bulk operator — freight rate spike directly lifts EBITDA', impact: 'high' },
      { symbol: 'SCI',     company: 'Shipping Corp of India', rationale: 'State-owned fleet benefits from higher spot voyage rates', impact: 'high' },
      { symbol: 'ESABINDIA', company: 'Esab India',          rationale: 'Indirect: port and logistics services demand rises with shipping volumes', impact: 'low' },
    ],
    adverselyAffected: [
      { symbol: 'TATAMOTORS', company: 'Tata Motors',  rationale: 'JLR imports CKD kits — higher freight inflates landed cost', impact: 'medium' },
      { symbol: 'DIXON',      company: 'Dixon Technologies', rationale: 'Component imports for consumer electronics become costlier', impact: 'medium' },
      { symbol: 'APOLLOTYRE', company: 'Apollo Tyres', rationale: 'Natural rubber and chemical imports face higher logistics cost', impact: 'medium' },
    ],
  },
  {
    name: 'Silver', ticker: 'SLV', unit: '$/sh (SLV ETF)', sector: 'Precious Metals',
    timeHorizon: 'medium-term',
    historicalAnalog: '2010-11 silver ran from $18 to $49/oz driven by solar boom and safe-haven demand before reversing on speculative unwind',
    sources: ['Silver Institute World Silver Survey', 'LBMA Silver Price', 'BloombergNEF Solar Demand Tracker'],
    beneficiaries: [
      { symbol: 'HINDALCO',  company: 'Hindalco Industries', rationale: 'Recovers silver as a by-product from copper smelting — higher prices boost margins', impact: 'medium' },
      { symbol: 'VEDL',      company: 'Vedanta',             rationale: 'Zinc and lead smelting yields silver — price rise adds to realisations', impact: 'medium' },
      { symbol: 'TITAN',     company: 'Titan Company',       rationale: 'Silver jewellery and watches segment benefits from inventory revaluation', impact: 'low' },
    ],
    adverselyAffected: [
      { symbol: 'WAAREEENS', company: 'Waaree Energies',     rationale: 'Silver paste is ~8% of solar cell cost — higher silver inflates panel BOM', impact: 'high' },
      { symbol: 'PREMIER',   company: 'Premier Energies',    rationale: 'Solar cell manufacturer faces direct silver input cost headwind', impact: 'high' },
      { symbol: 'KAYNES',    company: 'Kaynes Technology',   rationale: 'Electronics PCB assembly uses silver solder — BOM cost rises', impact: 'low' },
    ],
  },
  {
    name: 'Iron Ore', ticker: 'VALE', unit: '$/sh (Vale proxy)', sector: 'Steel Raw Material',
    timeHorizon: 'near-term',
    historicalAnalog: '2021 iron ore hit $230/tonne on Chinese post-COVID steel demand; crashed to $80 when China curbed output and real estate slowed',
    sources: ['Steel Index Iron Ore Price', 'Vale Quarterly Production Report', 'China Steel PMI'],
    beneficiaries: [
      { symbol: 'NMDC',    company: 'NMDC',          rationale: 'India\'s largest iron ore producer — realisations rise directly with global ore prices', impact: 'high' },
      { symbol: 'KIOCL',   company: 'KIOCL',         rationale: 'State iron ore pellet producer benefits from higher feedstock demand', impact: 'high' },
      { symbol: 'VEDL',    company: 'Vedanta',        rationale: 'Iron ore mining in Goa/Karnataka contributes to revenue uplift', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'TATASTEEL', company: 'Tata Steel',  rationale: 'Higher ore input cost compresses integrated steelmaker margins if HRC prices lag', impact: 'high' },
      { symbol: 'JSWSTEEL',  company: 'JSW Steel',   rationale: 'Ore-dependent capacity expansion becomes more expensive at peak ore prices', impact: 'high' },
      { symbol: 'SAIL',      company: 'SAIL',         rationale: 'Captive ore mines partially offset, but ore cost still a margin driver', impact: 'medium' },
    ],
  },
  {
    name: 'Sugar & Ethanol', ticker: 'SB=F', unit: '¢/lb', sector: 'Agri Commodities',
    timeHorizon: 'near-term',
    historicalAnalog: '2010-11 Brazilian drought and India export ban sent sugar to 30¢/lb; mills that had pivoted to ethanol blending held margins better',
    sources: ['ISMA India Sugar Production Data', 'CANE India Ethanol Blending Report', 'USDA Sugar & Sweeteners Outlook'],
    beneficiaries: [
      { symbol: 'BALRAMCHI', company: 'Balrampur Chini',       rationale: 'Integrated sugar+ethanol mill — high cane realisation and ethanol offtake to OMCs', impact: 'high' },
      { symbol: 'DHAMPUR',   company: 'Dhampur Sugar Mills',   rationale: 'North India mill with ethanol distillery — benefits from OMC blending mandates', impact: 'high' },
      { symbol: 'TRIVENI',   company: 'Triveni Engineering',   rationale: 'Sugar and power cogeneration — higher sugar price lifts overall realisation', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'BPCL',  company: 'BPCL',  rationale: 'OMC must procure ethanol at higher cost to meet 20% blending target — margin headwind', impact: 'medium' },
      { symbol: 'IOC',   company: 'Indian Oil Corp', rationale: 'Largest ethanol buyer under the blending programme — procurement cost rises', impact: 'medium' },
      { symbol: 'ITC',   company: 'ITC',   rationale: 'FMCG segment uses sugar as key input in confectionery and beverages', impact: 'low' },
    ],
  },
  {
    name: 'Lithium ETF', ticker: 'LIT', unit: '$/share', sector: 'Battery Materials',
    timeHorizon: 'long-term',
    historicalAnalog: '2022-23 EV demand surge when lithium carbonate prices rose 10x, then crashed on Chinese supply surge',
    sources: ['Benchmark Mineral Intelligence', 'Fastmarkets Lithium Price Assessment', 'USGS Mineral Survey'],
    beneficiaries: [
      { symbol: 'TATAMOTORS', company: 'Tata Motors',    rationale: 'Tata EV (Nexon, Punch EV) battery costs fall, improving unit economics', impact: 'high' },
      { symbol: 'EXIDEIND',   company: 'Exide Industries', rationale: 'Li-ion cell expansion economics improve with lower lithium', impact: 'medium' },
      { symbol: 'AMARARAJA',  company: 'Amara Raja Energy', rationale: 'Battery manufacturing capex becomes cheaper', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'GMRINFRA',  company: 'GMR Airports',     rationale: 'Indirect — renewable energy storage project costs fall, competitive dynamics shift', impact: 'low' },
    ],
  },
  {
    name: 'NVDA (AI Compute Proxy)', ticker: 'NVDA', unit: '$/share', sector: 'Technology',
    timeHorizon: 'long-term',
    historicalAnalog: '1999-2000 internet infrastructure capex boom, then bust — current AI capex mirrors the scale',
    sources: ['NVIDIA Earnings Reports', 'IDC AI Infrastructure Tracker', 'Gartner AI Forecast'],
    beneficiaries: [
      { symbol: 'INFY',        company: 'Infosys',           rationale: 'AI services revenue and GenAI project pipeline grows with hyperscaler spend', impact: 'high' },
      { symbol: 'TCS',         company: 'TCS',               rationale: 'Large enterprise AI transformation deals drive IT services demand', impact: 'high' },
      { symbol: 'PERSISTENT',  company: 'Persistent Systems', rationale: 'AI engineering services highest-growth segment', impact: 'high' },
      { symbol: 'KAYNES',      company: 'Kaynes Technology', rationale: 'Electronics manufacturing services for AI hardware supply chain', impact: 'medium' },
    ],
    adverselyAffected: [
      { symbol: 'WIPRO',  company: 'Wipro',     rationale: 'Legacy IT transformation business at risk from AI automation', impact: 'medium' },
      { symbol: 'KPITTECH', company: 'KPIT Technologies', rationale: 'Automotive software faces AI commoditisation risk', impact: 'low' },
    ],
  },
  {
    name: 'Micron (DRAM/NAND Proxy)', ticker: 'MU', unit: '$/share', sector: 'Semiconductors',
    timeHorizon: 'medium-term',
    historicalAnalog: '2019 DRAM oversupply cycle when memory prices fell 50% and Samsung/SK Hynix cut capex',
    sources: ['DRAMeXchange Price Index', 'TrendForce DRAM Report', 'IDC Storage Tracker'],
    beneficiaries: [
      { symbol: 'DIXON',    company: 'Dixon Technologies', rationale: 'Lower memory component cost improves TV/phone assembled margins', impact: 'medium' },
      { symbol: 'AMBER',    company: 'Amber Enterprises',  rationale: 'Smart AC with embedded memory chips — BOM cost reduction', impact: 'low' },
    ],
    adverselyAffected: [
      { symbol: 'CYIENT', company: 'Cyient',        rationale: 'Semiconductor design services revenue faces spending cuts in downturn', impact: 'medium' },
      { symbol: 'SASKEN', company: 'Sasken Technologies', rationale: 'Chip design and embedded software revenue tied to memory capex', impact: 'medium' },
    ],
  },
];

// ── Yahoo Finance fetcher ──────────────────────────────────────────────────────
interface YFBar { close: number; date: string }

async function fetchBars(ticker: string): Promise<YFBar[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
      signal: ctrl.signal,
    } as RequestInit);
    if (!res.ok) return null;
    const json = await res.json() as {
      chart?: { result?: Array<{ timestamp: number[]; indicators: { quote: Array<{ close: number[] }> } }> }
    };
    const r = json.chart?.result?.[0];
    if (!r) return null;
    const closes = r.indicators.quote[0].close;
    const bars: YFBar[] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      if (closes[i] == null || isNaN(closes[i])) continue;
      bars.push({ close: closes[i], date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10) });
    }
    return bars.length >= 20 ? bars : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// ── Trend analysis engine ─────────────────────────────────────────────────────
function pctChange(from: number, to: number): number {
  return Math.round((to - from) / from * 1000) / 10; // one decimal
}

function percentile52w(bars: YFBar[]): number {
  const year = bars.slice(-252);
  const closes = year.map(b => b.close);
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const current = closes[closes.length - 1];
  if (hi === lo) return 50;
  return Math.round((current - lo) / (hi - lo) * 100);
}

function deriveCategory(
  chg1m: number, chg3m: number, chg6m: number, pct52: number
): Category {
  // Shortage: sustained rally, near 52-week high
  if (chg3m > 12 && pct52 > 70) return 'shortage';
  if (chg1m > 6  && chg3m > 8  && pct52 > 65) return 'shortage';

  // Oversupply: sustained decline, near 52-week low
  if (chg3m < -12 && pct52 < 30) return 'oversupply';
  if (chg1m < -6  && chg3m < -8 && pct52 < 35) return 'oversupply';

  // Emerging: rapid recent move, not yet at extremes
  if (Math.abs(chg1m) > 7 && pct52 > 40 && pct52 < 80) return 'emerging';
  if (chg1m > 4 && chg3m > 6) return 'emerging';

  return 'balanced';
}

function derivePricingPower(chg1m: number, chg3m: number): PricingPower {
  if (chg3m > 8 || (chg1m > 4 && chg3m > 4)) return 'rising';
  if (chg3m < -8 || (chg1m < -4 && chg3m < -4)) return 'collapsing';
  return 'stable';
}

function deriveConfidence(chg1m: number, chg3m: number, chg6m: number, pct52: number): number {
  // Confidence rises with signal consistency and extreme positioning
  let score = 50;
  const trending = (chg1m > 0 && chg3m > 0 && chg6m > 0) || (chg1m < 0 && chg3m < 0 && chg6m < 0);
  if (trending) score += 15;
  if (Math.abs(chg3m) > 20) score += 10;
  if (Math.abs(chg3m) > 10) score += 5;
  if (pct52 > 85 || pct52 < 15) score += 10;
  if (pct52 > 75 || pct52 < 25) score += 5;
  return Math.min(92, Math.max(35, score));
}

function buildDescription(
  name: string, current: number, unit: string,
  chg1d: number, chg1m: number, chg3m: number, chg6m: number,
  pct52: number, category: Category, pricingPower: PricingPower
): string {
  const dir3m = chg3m >= 0 ? 'up' : 'down';
  const posLabel = pct52 > 75 ? 'near 52-week highs' : pct52 < 25 ? 'near 52-week lows' : `at the ${pct52}th percentile of its 52-week range`;
  const momentum = Math.abs(chg1m) > 5 ? (chg1m > 0 ? 'accelerating upward' : 'accelerating downward') : 'consolidating';

  const catPhrase: Record<Category, string> = {
    shortage: 'Supply constraints are driving a price rally',
    oversupply: 'Excess supply is weighing on prices',
    emerging: 'A nascent supply-demand imbalance is developing',
    balanced: 'Supply and demand are broadly in equilibrium',
    'rising-pricing': 'Producers are gaining pricing power',
    'falling-pricing': 'Pricing power is eroding for producers',
  };

  return (
    `${catPhrase[category]}. ${name} trades at ${current.toLocaleString()} ${unit} (${chg1d >= 0 ? '+' : ''}${chg1d}% today), ${dir3m} ${Math.abs(chg3m)}% over three months and ${posLabel}. ` +
    `Momentum is ${momentum} on a one-month basis (${chg1m >= 0 ? '+' : ''}${chg1m}%), with six-month change at ${chg6m >= 0 ? '+' : ''}${chg6m}%. ` +
    `Pricing power for producers is ${pricingPower === 'rising' ? 'strengthening' : pricingPower === 'collapsing' ? 'deteriorating rapidly' : 'broadly stable'}.`
  );
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function GET() {
  const startMs = Date.now();

  // Fetch all tickers in parallel (same pattern as btst-screen)
  const bars = await Promise.all(
    COMMODITIES.map(c => fetchBars(c.ticker))
  );

  const themes: SupplyDemandTheme[] = [];
  const priceData: Record<string, LivePrice> = {};

  for (let i = 0; i < COMMODITIES.length; i++) {
    const def = COMMODITIES[i];
    const b   = bars[i];
    if (!b || b.length < 20) continue;

    const current = b[b.length - 1].close;
    const prev1d  = b[b.length - 2]?.close ?? current;
    const prev1m  = b[b.length - 22]?.close ?? b[0].close;
    const prev3m  = b[b.length - 66]?.close ?? b[0].close;
    const prev6m  = b[b.length - 132]?.close ?? b[0].close;

    const chg1d = pctChange(prev1d, current);
    const chg1m = pctChange(prev1m, current);
    const chg3m = pctChange(prev3m, current);
    const chg6m = pctChange(prev6m, current);
    const pct52 = percentile52w(b);

    const category     = deriveCategory(chg1m, chg3m, chg6m, pct52);
    const pricingPower = derivePricingPower(chg1m, chg3m);
    const confidence   = deriveConfidence(chg1m, chg3m, chg6m, pct52);
    // Only flip beneficiaries/adverselyAffected when prices are actively falling
    const falling      = category === 'oversupply' || pricingPower === 'collapsing';

    priceData[def.name] = { price: Math.round(current * 100) / 100, change1d: chg1d, unit: def.unit };

    themes.push({
      id: slugify(def.name) + '-' + i,
      commodity:        def.name,
      category,
      pricingPower,
      description: buildDescription(
        def.name, current, def.unit,
        chg1d, chg1m, chg3m, chg6m, pct52, category, pricingPower
      ),
      confidence,
      timeHorizon:      def.timeHorizon,
      beneficiaries:     falling ? def.adverselyAffected : def.beneficiaries,
      adverselyAffected: falling ? def.beneficiaries     : def.adverselyAffected,
      historicalAnalog: def.historicalAnalog,
      sources:          def.sources,
    });
  }

  // Sort: most extreme moves first (shortages and oversupply before balanced)
  themes.sort((a, b) => {
    const order: Record<Category, number> = { shortage: 0, oversupply: 1, emerging: 2, 'rising-pricing': 3, 'falling-pricing': 4, balanced: 5 };
    if (order[a.category] !== order[b.category]) return order[a.category] - order[b.category];
    return b.confidence - a.confidence;
  });

  const snapshot: SupplyDemandSnapshot = {
    themes,
    generatedAt: new Date().toISOString(),
    elapsedMs:   Date.now() - startMs,
    priceData:   Object.keys(priceData).length > 0 ? priceData : undefined,
    pricesAsOf:  new Date().toISOString(),
  };

  // Update the tracker blob so "Run via Cloud" refreshes the persistent tracker
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const BLOB_OPTS = { access: 'public', contentType: 'application/json', allowOverwrite: true } as const;
      const { blobs } = await list({ prefix: 'sd-tracker.json', limit: 1 });
      let currentTracker: SupplyDemandTracker = { ...EMPTY_TRACKER };
      if (blobs.length > 0) {
        try {
          const r = await fetch(blobs[0].url, { cache: 'no-store' });
          if (r.ok) currentTracker = await r.json() as SupplyDemandTracker;
        } catch { /* start fresh */ }
      }
      const updatedTracker = mergeIntoTracker(currentTracker, themes, priceData);
      await put('sd-tracker.json', JSON.stringify(updatedTracker), BLOB_OPTS);
    } catch { /* blob unavailable — still return snapshot */ }
  }

  return NextResponse.json(snapshot);
}
