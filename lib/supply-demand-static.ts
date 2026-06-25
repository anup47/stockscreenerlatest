// lib/supply-demand-static.ts
// Hardcoded static enrichment data for supply-demand cards.
// Trade dependency, cascade effects, and margin sensitivity are stable
// facts that don't need an API — they change quarterly at most.

export interface CommodityStaticData {
  tradeDependency: string;
  cascadeEffects: string[];
  marginSensitivity: Record<string, string>;
}

const STATIC: Record<string, CommodityStaticData> = {
  'Crude Oil (WTI)': {
    tradeDependency: 'India imports ~$130B/yr (80%+ from Middle East/Russia); #3 global importer. No near-term substitutes for upstream E&P.',
    cascadeEffects: [
      'Petrochem feedstock ↑ → plastics/rubber costs rise → FMCG packaging margins compressed (2-3Q lag)',
      'Aviation fuel ↑ → airline ticket prices rise → tourism/hospitality margins pressured',
      'Diesel ↑ → logistics costs rise → broad-based EBITDA drag of 50-100bps across sectors',
    ],
    marginSensitivity: {
      BPCL:       '+$1/barrel GRM = ~Rs 1,400 Cr PAT uplift',
      IOC:        '+$1/barrel GRM = ~Rs 2,000 Cr PAT uplift',
      HINDPETRO:  '+$1/barrel GRM = ~Rs 900 Cr PAT uplift',
      ONGC:       '+$1/barrel oil = ~Rs 850 Cr EBIT uplift',
    },
  },
  'Natural Gas': {
    tradeDependency: 'India imports ~60% as LNG from Qatar/US/Australia; ~20% of domestic gas goes to fertiliser feedstock.',
    cascadeEffects: [
      'Urea cost ↑ → fertiliser prices ↑ → farmer input costs ↑ → rural consumption drag (2-3Q lag)',
      'Power generation cost ↑ → industrial electricity tariffs rise (1-2Q lag)',
      'Specialty chemical feedstock ↑ → margin compression across chemical sector',
    ],
    marginSensitivity: {
      CHAMBAL:    '+$1/MMBtu = ~Rs 120 Cr EBIT headwind (gas = primary urea feedstock)',
      GAIL:       '+$1/MMBtu = ~Rs 400 Cr EBITDA expansion (transmission/trading margins)',
      COROMANDEL: '+$1/MMBtu = ~Rs 45 Cr EBIT headwind (phosphatic fertiliser energy costs)',
    },
  },
  'Copper': {
    tradeDependency: 'India imports ~$3.2B/yr; 40%+ from Chile/Peru. Hindalco domestic smelting covers ~30% of requirement.',
    cascadeEffects: [
      'Power cable costs ↑ → grid CAPEX rises → T&D project margins compress',
      'EV BOM cost ↑ → EV penetration slows if battery savings don\'t offset',
      'AC heat exchanger cost ↑ → white goods manufacturers face margin headwind',
    ],
    marginSensitivity: {
      HINDALCO: '+$100/tonne Cu = ~Rs 220 Cr EBITDA uplift (copper EBITDA segment)',
      POLYCAB:  '+10% copper price = ~120bps gross margin headwind on cables',
      KEI:      '+10% copper price = ~100bps gross margin headwind on wiring products',
    },
  },
  'Aluminium': {
    tradeDependency: 'India is a NET EXPORTER. Hindalco/NALCO/Vedanta produce ~4.5Mt/yr vs domestic demand ~4Mt. No primary aluminium import dependency.',
    cascadeEffects: [
      'Power transmission tower cost ↑ → grid electrification CAPEX rises',
      'Automotive body BOM cost ↑ → vehicle price increases of Rs 5,000-15,000 (1Q lag)',
      'Packaging costs ↑ → FMCG gross margin drag of 30-80bps',
    ],
    marginSensitivity: {
      HINDALCO: '+$100/tonne Al = ~Rs 350 Cr EBITDA uplift (India domestic volumes ~1.3Mt/yr)',
      NALCO:    '+$100/tonne Al = ~Rs 180 Cr EBIT uplift (0.9Mt/yr production)',
      VEDL:     '+$100/tonne Al = ~Rs 270 Cr EBITDA uplift (Jharsuguda + Lanjigarh)',
    },
  },
  'Steel': {
    tradeDependency: 'India is #2 global producer (120Mt). Net exporter of long products; imports specialty/stainless grades from China/Korea.',
    cascadeEffects: [
      'Construction costs ↑ → real estate affordability worsens → developer volume risk (1-2Q lag)',
      'Infrastructure EPC margins compress as steel input rises 5-8%',
      'Capital goods manufacturing costs ↑ → industrial CAPEX project delays',
    ],
    marginSensitivity: {
      TATASTEEL: '+Rs 1,000/tonne HRC = ~Rs 900 Cr EBITDA uplift (India standalone)',
      JSWSTEEL:  '+Rs 1,000/tonne HRC = ~Rs 750 Cr EBITDA uplift',
      SAIL:      '+Rs 1,000/tonne HRC = ~Rs 600 Cr EBITDA uplift',
    },
  },
  'Gold': {
    tradeDependency: 'India imports $40-50B/yr of gold; #2 global consumer. Import duty at 12.5% adds cost friction.',
    cascadeEffects: [
      'Central bank demand ↑ → supports further rally',
      'USD weakness (often correlated) → EM currencies strengthen → India import duty collections fall',
      'Safe-haven demand ↑ → risk-off → FII equity outflows risk for India markets',
    ],
    marginSensitivity: {
      MUTHOOTFIN: '+10% gold = ~15% NIM expansion on loan portfolio (AUM per gram improves)',
      TITAN:      '+10% gold = ~6% revenue uplift (inventory revaluation, jewellery ASP)',
      MANAPPURAM: '+10% gold = ~12% NIM expansion (smaller portfolio, faster turnover)',
    },
  },
  'Cocoa': {
    tradeDependency: 'India imports 100% of cocoa (no domestic production). ~$300M/yr from Ghana/Ivory Coast.',
    cascadeEffects: [
      'Chocolate/confectionery price increases of 8-15% possible; volume elasticity kicks in above 25% price rise',
      'Consumer demand shifts to private label from premium brands under sustained inflation',
      'QSR menus re-priced upward → discretionary spending pressure on F&B chains',
    ],
    marginSensitivity: {
      NESTLEIND: '+10% cocoa = ~80bps EBITDA margin headwind (cocoa ~8% of COGS)',
      BRITANNIA: '+10% cocoa = ~30bps EBITDA headwind (smaller chocolate exposure)',
      ITC:       '+10% cocoa = ~20bps FMCG EBIT headwind (confectionery segment)',
    },
  },
  'Palm Oil': {
    tradeDependency: 'India imports ~$10B/yr of palm oil; 60%+ from Indonesia/Malaysia. Key input for soaps, cooking oils, and processed foods.',
    cascadeEffects: [
      'Edible oil prices ↑ → household cooking cost rises → urban discretionary consumption diverts',
      'FMCG products with high fat content face gross margin pressure of 80-150bps',
      'Biodiesel economics improve → alternative demand supports prices for longer',
    ],
    marginSensitivity: {
      HINDUNILVR: '+10% palm oil = ~50bps gross margin headwind (soap/oil segment)',
      MARICO:     '+10% palm oil = ~80bps gross margin headwind (Parachute focus)',
      AWL:        '+10% palm oil = ~120bps gross margin headwind (Fortune brand primary input)',
    },
  },
  'Wheat': {
    tradeDependency: 'India is #2 global producer (~115Mt/yr). Generally self-sufficient; government controls exports via ban/duty.',
    cascadeEffects: [
      'Flour price ↑ → bakery/biscuit/pasta product costs rise → FMCG gross margin pressure',
      'Government may invoke export ban if domestic prices rise → limits farmer income upside',
      'FCI procurement rises → rural income boost from MSP support',
    ],
    marginSensitivity: {
      BRITANNIA: '+10% wheat = ~180bps gross margin headwind (wheat flour ~35% of COGS)',
      NESTLEIND: '+10% wheat = ~50bps headwind (Maggi noodles, flour-based products)',
      ITC:       '+10% wheat = ~70bps headwind (Sunfeast biscuits, Aashirvaad atta)',
    },
  },
  'Urea': {
    tradeDependency: 'India imports ~$2B/yr urea (~30% of requirement). Qatar/Oman are primary sources. Government subsidises heavily.',
    cascadeEffects: [
      'Farmer input costs ↑ → rural income squeeze → 2W/tractor demand lag of 2-3 quarters',
      'Government subsidy bill rises → fiscal pressure → other agri schemes squeezed',
      'Kharif/rabi crop yields may decline if farmers under-apply urea',
    ],
    marginSensitivity: {
      CHAMBAL: 'Urea is end product; +10% urea = ~Rs 150 Cr revenue uplift (govt controls pricing, limits pass-through)',
      GNFC:    '+10% urea realisation = ~Rs 60 Cr revenue uplift on open-market volumes',
    },
  },
  'Optical Fiber': {
    tradeDependency: 'India transitioning to self-sufficiency (HFCL, STL). Still imports preform (silica glass blank) from Japan/US for ~40% of requirement.',
    cascadeEffects: [
      'Data centre buildout drives demand above forecast → order book surge for HFCL/STL',
      'Hyperscaler AI infrastructure → optical interconnects are critical near-term bottleneck',
      'Undersea cable orders → 1-2 year revenue visibility for suppliers with cable manufacturing',
    ],
    marginSensitivity: {
      HFCL:    '+10% optical fiber realisations = ~Rs 90 Cr EBITDA uplift (1/3rd of revenue from fiber)',
      STLTECH: '+10% fiber cable realisations = ~Rs 120 Cr EBITDA uplift (cable is primary product)',
    },
  },
  'Shipping Freight': {
    tradeDependency: 'India not a major shipping nation. Freight impacts all import-heavy sectors: electronics, auto components, metals. EXIM container freight is 5-8% of CIF import value.',
    cascadeEffects: [
      'Import-dependent sectors face higher landed costs → electronics, auto components, white goods',
      'Port congestion → inventory holding costs rise → working capital requirement increases for importers',
      'Export-oriented sectors (IT, pharma) operationally unaffected but global supply chain disruptions possible',
    ],
    marginSensitivity: {
      GESHIP: '+10% BDI = ~Rs 40 Cr EBITDA uplift (tanker + dry bulk fleet utilisation)',
      SCI:    '+10% BDI = ~Rs 25 Cr EBITDA uplift (state-owned fleet)',
    },
  },
  'Silver': {
    tradeDependency: 'India imports ~$3-4B/yr silver for industrial use and jewellery. Mexico/Peru are primary sources.',
    cascadeEffects: [
      'Solar panel manufacturing costs rise → silver paste is ~8% of solar cell cost',
      'Electronics PCB assembly BOM rises → silver solder contacts, connectors',
      'Jewellery demand inelastic at current levels → volume stable but ASP rises',
    ],
    marginSensitivity: {
      WAAREEENS: '+10% silver = ~30bps panel cost headwind (silver paste ~5% of PV module cost)',
      PREMIER:   '+10% silver = ~35bps headwind (higher silver intensity in HJT cell technology)',
    },
  },
  'Iron Ore': {
    tradeDependency: 'India is self-sufficient and a NET EXPORTER (~250Mt/yr production). NMDC, private miners export surplus to Japan/Korea/China.',
    cascadeEffects: [
      'HRC steel prices rise with 1-2Q lag as integrated steelmakers reprice finished goods',
      'NMDC export realisations improve → dividend capacity rises (state-owned, high payout)',
      'China domestic ore production rises → global price headwind if Chinese demand slows',
    ],
    marginSensitivity: {
      NMDC:      '+$10/tonne iron ore = ~Rs 400 Cr EBITDA uplift (50Mt/yr production)',
      TATASTEEL: 'Iron ore is input; +$10/tonne = ~Rs 250 Cr EBITDA headwind (partially self-mined)',
    },
  },
  'Sugar & Ethanol': {
    tradeDependency: 'India is #2 global producer (~35Mt/yr). Alternates between exporter/importer. Government controls pricing and ethanol blending ratio.',
    cascadeEffects: [
      'Ethanol prices rise → OMCs face higher blending costs → petrol marketing margins squeezed',
      'Government may impose export ban if domestic prices rise → mills lose export realisation',
      'Farmer cane prices (SAP/FRP) rise in next cycle if mill realisations improve',
    ],
    marginSensitivity: {
      BALRAMCHI: '+10% sugar = ~Rs 80 Cr EBIT uplift on milled volumes',
      TRIVENI:   '+10% sugar = ~Rs 60 Cr EBIT uplift',
      DHAMPUR:   '+10% sugar = ~Rs 40 Cr EBIT uplift',
    },
  },
  'Lithium ETF': {
    tradeDependency: 'India imports 100% of lithium. No proven commercial deposits. Australia/Chile are primary sources.',
    cascadeEffects: [
      'EV battery pack costs rise → EV adoption slows if not offset by OEM margin compression',
      'OEMs face BOM increases → EV price increases of Rs 20,000-50,000 possible',
      'Grid-scale storage economics worsen → renewable energy storage projects delayed',
    ],
    marginSensitivity: {
      TATAMOTORS: '+10% lithium = ~Rs 15,000/EV BOM cost increase → 30-50bps margin headwind',
      EXIDEIND:   '+10% lithium = ~80bps EBIT headwind on lithium-ion battery revenue',
      AMARARAJA:  '+10% lithium = ~60bps EBIT headwind on battery manufacturing',
    },
  },
  'NVDA (AI Compute Proxy)': {
    tradeDependency: 'India has no domestic GPU manufacturing. 100% import-dependent. TSMC (Taiwan) manufactures all high-end AI chips.',
    cascadeEffects: [
      'Data centre CAPEX inflation → Indian cloud/hyperscaler infrastructure costs rise (6-9M lag)',
      'AI software companies face higher inference costs → margin headwind for IT services',
      'Large AI infrastructure deals → systems integration revenue for IT majors',
    ],
    marginSensitivity: {
      INFY:       'AI compute cycle drives IT services demand; ~100bps revenue growth uplift from GenAI projects',
      TCS:        'Large enterprise AI transformation deals; ~1-2% revenue uplift from AI infrastructure expansion',
      PERSISTENT: 'AI engineering services = highest-growth segment; ~15-20% of revenue from GenAI',
    },
  },
  'Refrigerant Gases (HFC)': {
    tradeDependency: 'India imports ~$180M/yr HFCs; 65%+ from China. SRF/GFL transitioning from importers to exporters under Kigali Amendment.',
    cascadeEffects: [
      'AC manufacturing costs rise → OEMs face margin headwind in peak summer season',
      'R-290 (propane) adoption as HFC alternative → CAPEX for OEMs to retool (Rs 50-100 Cr per OEM)',
      'Kigali Amendment HFC phase-down → structural shortage in legacy refrigerants; R-22 already phased out',
    ],
    marginSensitivity: {
      SRF:        '+10% R-32/R-125 = ~Rs 130 Cr EBIT uplift (fluorochemicals ~40% of revenue)',
      FLUOROCHEM: '+10% HFC price = ~Rs 80 Cr EBIT uplift (refrigerant + PTFE revenue blend)',
      BLUESTAR:   '+10% refrigerant cost = ~60bps gross margin headwind (R-32/R-410A procurement)',
    },
  },
  'Micron (DRAM/NAND Proxy)': {
    tradeDependency: 'India imports ~$2B/yr of memory chips. Samsung/SK Hynix dominate. MeitY domestic fab initiative is early-stage.',
    cascadeEffects: [
      'Consumer electronics prices fall → AC/TV/phone demand elasticity positive',
      'India electronics manufacturing BOM costs decline → margin expansion for assembly players',
      'Semiconductor design spending falls as memory makers cut CAPEX → services revenue risk',
    ],
    marginSensitivity: {
      DIXON: '-10% DRAM = ~50bps gross margin expansion on TV/phone assembly (component cost reduction)',
      AMBER: '-10% memory = ~20bps margin benefit (smart AC embedded chip components)',
    },
  },
};

export function getCommodityStatic(commodityName: string): CommodityStaticData | null {
  if (STATIC[commodityName]) return STATIC[commodityName];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normName = norm(commodityName);
  for (const key of Object.keys(STATIC)) {
    const normKey = norm(key);
    if (normKey === normName) return STATIC[key];
    const [shorter, longer] = normName.length <= normKey.length ? [normName, normKey] : [normKey, normName];
    if (shorter.length >= 5 && longer.includes(shorter)) return STATIC[key];
  }
  return null;
}
