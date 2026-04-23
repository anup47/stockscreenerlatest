export interface Stock {
  nse_symbol: string;
  company: string;
}

export const UNIVERSE: Stock[] = [
  // ── Large-cap / Nifty 50 ──────────────────────────────────────────────
  { nse_symbol: 'RELIANCE',    company: 'Reliance Industries' },
  { nse_symbol: 'TCS',         company: 'Tata Consultancy Services' },
  { nse_symbol: 'INFY',        company: 'Infosys' },
  { nse_symbol: 'HDFCBANK',    company: 'HDFC Bank' },
  { nse_symbol: 'ICICIBANK',   company: 'ICICI Bank' },
  { nse_symbol: 'KOTAKBANK',   company: 'Kotak Mahindra Bank' },
  { nse_symbol: 'HINDUNILVR',  company: 'Hindustan Unilever' },
  { nse_symbol: 'SBIN',        company: 'State Bank of India' },
  { nse_symbol: 'BHARTIARTL',  company: 'Bharti Airtel' },
  { nse_symbol: 'ITC',         company: 'ITC' },
  { nse_symbol: 'BAJFINANCE',  company: 'Bajaj Finance' },
  { nse_symbol: 'AXISBANK',    company: 'Axis Bank' },
  { nse_symbol: 'ASIANPAINT',  company: 'Asian Paints' },
  { nse_symbol: 'MARUTI',      company: 'Maruti Suzuki' },
  { nse_symbol: 'TITAN',       company: 'Titan Company' },
  { nse_symbol: 'SUNPHARMA',   company: 'Sun Pharmaceutical' },
  { nse_symbol: 'WIPRO',       company: 'Wipro' },
  { nse_symbol: 'HCLTECH',     company: 'HCL Technologies' },
  { nse_symbol: 'POWERGRID',   company: 'Power Grid Corporation' },
  { nse_symbol: 'NTPC',        company: 'NTPC' },
  { nse_symbol: 'ULTRACEMCO',  company: 'UltraTech Cement' },
  { nse_symbol: 'TECHM',       company: 'Tech Mahindra' },
  { nse_symbol: 'NESTLEIND',   company: 'Nestle India' },
  { nse_symbol: 'BAJAJFINSV',  company: 'Bajaj Finserv' },
  { nse_symbol: 'BAJAJ-AUTO',  company: 'Bajaj Auto' },
  { nse_symbol: 'EICHERMOT',   company: 'Eicher Motors' },
  { nse_symbol: 'HEROMOTOCO',  company: 'Hero MotoCorp' },
  { nse_symbol: 'GRASIM',      company: 'Grasim Industries' },
  { nse_symbol: 'BRITANNIA',   company: 'Britannia Industries' },
  { nse_symbol: 'DIVISLAB',    company: "Divi's Laboratories" },
  { nse_symbol: 'CIPLA',       company: 'Cipla' },
  { nse_symbol: 'DRREDDY',     company: "Dr. Reddy's Laboratories" },
  { nse_symbol: 'APOLLOHOSP',  company: 'Apollo Hospitals' },
  { nse_symbol: 'TATACONSUM',  company: 'Tata Consumer Products' },
  { nse_symbol: 'LT',          company: 'Larsen & Toubro' },
  { nse_symbol: 'ADANIPORTS',  company: 'Adani Ports & SEZ' },
  { nse_symbol: 'COALINDIA',   company: 'Coal India' },
  { nse_symbol: 'ONGC',        company: 'Oil & Natural Gas Corporation' },

  // ── Metals & Mining ───────────────────────────────────────────────────
  { nse_symbol: 'TATASTEEL',   company: 'Tata Steel' },
  { nse_symbol: 'JSWSTEEL',    company: 'JSW Steel' },
  { nse_symbol: 'HINDALCO',    company: 'Hindalco Industries' },
  { nse_symbol: 'VEDL',        company: 'Vedanta' },
  { nse_symbol: 'SAIL',        company: 'Steel Authority of India' },
  { nse_symbol: 'NMDC',        company: 'NMDC' },
  { nse_symbol: 'NATIONALUM',  company: 'National Aluminium' },
  { nse_symbol: 'HINDCOPPER',  company: 'Hindustan Copper' },
  { nse_symbol: 'MOIL',        company: 'MOIL' },

  // ── Power & Energy ────────────────────────────────────────────────────
  { nse_symbol: 'ADANIGREEN',  company: 'Adani Green Energy' },
  { nse_symbol: 'ADANIPOWER',  company: 'Adani Power' },
  { nse_symbol: 'ADANIENT',    company: 'Adani Energy Solutions' },
  { nse_symbol: 'TATAPOWER',   company: 'Tata Power' },
  { nse_symbol: 'TORNTPOWER',  company: 'Torrent Power' },
  { nse_symbol: 'CESC',        company: 'CESC' },
  { nse_symbol: 'NHPC',        company: 'NHPC' },
  { nse_symbol: 'SJVN',        company: 'SJVN' },
  { nse_symbol: 'RPOWER',      company: 'Reliance Power' },
  { nse_symbol: 'SUZLON',      company: 'Suzlon Energy' },
  { nse_symbol: 'JPPOWER',     company: 'Jaiprakash Power Ventures' },
  { nse_symbol: 'SWSOLAR',     company: 'Sterling & Wilson Renewable' },

  // ── Defence & Aerospace ───────────────────────────────────────────────
  { nse_symbol: 'HAL',         company: 'Hindustan Aeronautics' },
  { nse_symbol: 'BEL',         company: 'Bharat Electronics' },
  { nse_symbol: 'MTARTECH',    company: 'MTAR Technologies' },
  { nse_symbol: 'DATAPATTNS',  company: 'Data Patterns' },
  { nse_symbol: 'IDEAFORGE',   company: 'ideaForge Technology' },
  { nse_symbol: 'PARAS',       company: 'Paras Defence & Space Technologies' },

  // ── Infrastructure & Construction ─────────────────────────────────────
  { nse_symbol: 'BHEL',        company: 'Bharat Heavy Electricals' },
  { nse_symbol: 'NCC',         company: 'NCC' },
  { nse_symbol: 'KEC',         company: 'KEC International' },
  { nse_symbol: 'KPIL',        company: 'Kalpataru Projects International' },
  { nse_symbol: 'AHLUCONT',    company: 'Ahluwalia Contracts' },
  { nse_symbol: 'PNCINFRA',    company: 'PNC Infratech' },
  { nse_symbol: 'IRCON',       company: 'IRCON International' },
  { nse_symbol: 'RITES',       company: 'RITES' },
  { nse_symbol: 'TITAGARH',    company: 'Titagarh Rail Systems' },

  // ── Railways ─────────────────────────────────────────────────────────
  { nse_symbol: 'IRFC',        company: 'Indian Railway Finance Corporation' },
  { nse_symbol: 'RVNL',        company: 'Rail Vikas Nigam' },
  { nse_symbol: 'IRCTC',       company: 'Indian Railway Catering & Tourism' },
  { nse_symbol: 'RAILTEL',     company: 'RailTel Corporation' },

  // ── Telecom & Tech ────────────────────────────────────────────────────
  { nse_symbol: 'HFCL',        company: 'HFCL' },
  { nse_symbol: 'STLTECH',     company: 'Sterlite Technologies' },

  // ── New-age / Fintech / Internet ──────────────────────────────────────
  { nse_symbol: 'NAUKRI',      company: 'Info Edge (Naukri)' },
  { nse_symbol: 'INDIAMART',   company: 'IndiaMART InterMESH' },
  { nse_symbol: 'ZOMATO',      company: 'Zomato' },
  { nse_symbol: 'PAYTM',       company: 'Paytm (One97 Communications)' },
  { nse_symbol: 'POLICYBZR',   company: 'PB Fintech (PolicyBazaar)' },
  { nse_symbol: 'NYKAA',       company: 'FSN E-Commerce (Nykaa)' },
  { nse_symbol: 'DELHIVERY',   company: 'Delhivery' },
  { nse_symbol: 'ANGELONE',    company: 'Angel One' },
  { nse_symbol: 'AWFIS',       company: 'Awfis Space Solutions' },
  { nse_symbol: 'OLAELEC',     company: 'Ola Electric Mobility' },
  { nse_symbol: '63MOONS',     company: '63 Moons Technologies' },
  { nse_symbol: 'NAZARA',      company: 'Nazara Technologies' },

  // ── Financials / NBFCs ────────────────────────────────────────────────
  { nse_symbol: 'YESBANK',     company: 'Yes Bank' },
  { nse_symbol: 'IDFCFIRSTB',  company: 'IDFC First Bank' },
  { nse_symbol: 'SBILIFE',     company: 'SBI Life Insurance' },
  { nse_symbol: 'HDFCLIFE',    company: 'HDFC Life Insurance' },
  { nse_symbol: 'ICICIPRULI',  company: 'ICICI Prudential Life Insurance' },
  { nse_symbol: 'FIVESTAR',    company: 'Five-Star Business Finance' },
  { nse_symbol: 'RTNINDIA',    company: 'RattanIndia Enterprises' },
  { nse_symbol: 'KESORAMIND',  company: 'Kesoram Industries' },

  // ── Manufacturing / Industrials ───────────────────────────────────────
  { nse_symbol: 'WELCORP',     company: 'Welspun Corp' },
  { nse_symbol: 'SKIPPER',     company: 'Skipper' },
  { nse_symbol: 'EPIGRAL',     company: 'Epigral' },
  { nse_symbol: 'GOLDIAM',     company: 'Goldiam International' },
  { nse_symbol: 'AZAD',        company: 'Azad Engineering' },
  { nse_symbol: 'LLOYDSENGG',  company: 'Lloyds Engineering Works' },
  { nse_symbol: 'ABDL',        company: 'Allied Blenders & Distillers' },
  { nse_symbol: 'RADICO',      company: 'Radico Khaitan' },

  // ── Pharma / Healthcare ───────────────────────────────────────────────
  { nse_symbol: 'LUPIN',       company: 'Lupin' },
  { nse_symbol: 'BIOCON',      company: 'Biocon' },
  { nse_symbol: 'AUROPHARMA',  company: 'Aurobindo Pharma' },
  { nse_symbol: 'TORNTPHARM',  company: 'Torrent Pharmaceuticals' },
  { nse_symbol: 'ALKEM',       company: 'Alkem Laboratories' },
  { nse_symbol: 'IPCALAB',     company: 'IPCA Laboratories' },
  { nse_symbol: 'GRANULES',    company: 'Granules India' },
  { nse_symbol: 'GLENMARK',    company: 'Glenmark Pharmaceuticals' },

  // ── Consumer / FMCG ───────────────────────────────────────────────────
  { nse_symbol: 'DABUR',       company: 'Dabur India' },
  { nse_symbol: 'MARICO',      company: 'Marico' },
  { nse_symbol: 'GODREJCP',    company: 'Godrej Consumer Products' },
  { nse_symbol: 'COLPAL',      company: 'Colgate-Palmolive India' },
  { nse_symbol: 'EMAMILTD',    company: 'Emami' },

  // ── Auto & Auto-Ancillary ─────────────────────────────────────────────
  { nse_symbol: 'MOTHERSON',   company: 'Samvardhana Motherson International' },
  { nse_symbol: 'BOSCHLTD',    company: 'Bosch' },
  { nse_symbol: 'BHARATFORG',  company: 'Bharat Forge' },
  { nse_symbol: 'TVSMOTOR',    company: 'TVS Motor Company' },
  { nse_symbol: 'ASHOKLEY',    company: 'Ashok Leyland' },
  { nse_symbol: 'ESCORTS',     company: 'Escorts Kubota' },
  { nse_symbol: 'OLECTRA',     company: 'Olectra Greentech' },
  { nse_symbol: 'TATAMOTORS',  company: 'Tata Motors' },

  // ── Cement ────────────────────────────────────────────────────────────
  { nse_symbol: 'AMBUJACEM',   company: 'Ambuja Cements' },
  { nse_symbol: 'ACC',         company: 'ACC' },
  { nse_symbol: 'SHREECEM',    company: 'Shree Cement' },
  { nse_symbol: 'RAMCOCEM',    company: 'The Ramco Cements' },
  { nse_symbol: 'JKCEMENT',    company: 'JK Cement' },

  // ── IT Mid-cap ────────────────────────────────────────────────────────
  { nse_symbol: 'MPHASIS',     company: 'Mphasis' },
  { nse_symbol: 'LTIM',        company: 'LTIMindtree' },
  { nse_symbol: 'PERSISTENT',  company: 'Persistent Systems' },
  { nse_symbol: 'COFORGE',     company: 'Coforge' },
  { nse_symbol: 'CYIENT',      company: 'Cyient' },
  { nse_symbol: 'TANLA',       company: 'Tanla Platforms' },
  { nse_symbol: 'KPITTECH',    company: 'KPIT Technologies' },
  { nse_symbol: 'TATAELXSI',   company: 'Tata Elxsi' },
];
