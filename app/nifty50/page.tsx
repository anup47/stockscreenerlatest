import type { Metadata } from 'next';
import IndexTracker, { type Constituent } from '@/app/components/IndexTracker';

export const metadata: Metadata = { title: 'Nifty 50 | StockScreener' };

// Actual Nifty 50 constituents – Aug 2026 rebalancing
// Weights        : smart-investing.in EOD Aug 3 2026 (free-float MCap weights)
// defaultPrevClose: smart-investing.in closing prices Aug 3 2026
// defaultPrice   : Dhan LTP Aug 4 2026 (~3:15 PM close)
// defaultPrevLevel: Nifty 50 official close Aug 3 2026
const NIFTY50: Constituent[] = [
  { symbol: 'RELIANCE',   name: 'Reliance Industries',    sector: 'Energy/Petrochem', defaultWeight:  9.00, defaultPrevClose:  1309.00, defaultPrice:  1290.90 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel',          sector: 'Telecom',          defaultWeight:  6.18, defaultPrevClose:  1951.00, defaultPrice:  1970.10 },
  { symbol: 'HDFCBANK',   name: 'HDFC Bank',              sector: 'Banking',          defaultWeight:  5.88, defaultPrevClose:   751.10, defaultPrice:   742.00 },
  { symbol: 'ICICIBANK',  name: 'ICICI Bank',             sector: 'Banking',          defaultWeight:  5.26, defaultPrevClose:  1444.20, defaultPrice:  1454.60 },
  { symbol: 'SBIN',       name: 'State Bank of India',    sector: 'Banking',          defaultWeight:  4.86, defaultPrevClose:  1036.30, defaultPrice:  1042.70 },
  { symbol: 'TCS',        name: 'Tata Consultancy Svcs',  sector: 'IT Services',      defaultWeight:  4.50, defaultPrevClose:  2450.00, defaultPrice:  2460.00 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance',          sector: 'NBFC',             defaultWeight:  3.61, defaultPrevClose:  1140.90, defaultPrice:  1149.00 },
  { symbol: 'LT',         name: 'Larsen & Toubro',        sector: 'Capital Goods',    defaultWeight:  2.79, defaultPrevClose:  4000.00, defaultPrice:  3990.00 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',     sector: 'FMCG',             defaultWeight:  2.53, defaultPrevClose:  2120.00, defaultPrice:  2096.50 },
  { symbol: 'INFY',       name: 'Infosys',                sector: 'IT Services',      defaultWeight:  2.41, defaultPrevClose:  1170.00, defaultPrice:  1167.50 },
  { symbol: 'SUNPHARMA',  name: 'Sun Pharmaceutical',     sector: 'Pharma',           defaultWeight:  2.38, defaultPrevClose:  1950.00, defaultPrice:  1964.00 },
  { symbol: 'MARUTI',     name: 'Maruti Suzuki',          sector: 'Auto',             defaultWeight:  2.25, defaultPrevClose: 14104.00, defaultPrice: 14168.00 },
  { symbol: 'TITAN',      name: 'Titan Company',          sector: 'Consumer',         defaultWeight:  2.21, defaultPrevClose:  4900.00, defaultPrice:  4935.00 },
  { symbol: 'M&M',        name: 'Mahindra & Mahindra',    sector: 'Auto',             defaultWeight:  2.14, defaultPrevClose:  3385.50, defaultPrice:  3433.00 },
  { symbol: 'ADANIENT',   name: 'Adani Enterprises',      sector: 'Conglomerate',     defaultWeight:  2.11, defaultPrevClose:  3065.00, defaultPrice:  3050.00 },
  { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank',    sector: 'Banking',          defaultWeight:  1.99, defaultPrevClose:   393.20, defaultPrice:   398.00 },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ',      sector: 'Infrastructure',   defaultWeight:  1.99, defaultPrevClose:  1697.00, defaultPrice:  1706.70 },
  { symbol: 'AXISBANK',   name: 'Axis Bank',              sector: 'Banking',          defaultWeight:  1.98, defaultPrevClose:  1252.00, defaultPrice:  1261.80 },
  { symbol: 'HCLTECH',    name: 'HCL Technologies',       sector: 'IT Services',      defaultWeight:  1.88, defaultPrevClose:  1362.10, defaultPrice:  1369.90 },
  { symbol: 'ITC',        name: 'ITC',                    sector: 'FMCG',             defaultWeight:  1.82, defaultPrevClose:   286.30, defaultPrice:   289.00 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement',       sector: 'Cement',           defaultWeight:  1.79, defaultPrevClose: 11950.00, defaultPrice: 12050.00 },
  { symbol: 'NTPC',       name: 'NTPC',                   sector: 'Power/Utilities',  defaultWeight:  1.71, defaultPrevClose:   347.60, defaultPrice:   343.65 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv',          sector: 'NBFC',             defaultWeight:  1.68, defaultPrevClose:  2065.00, defaultPrice:  2105.00 },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto',             sector: 'Auto',             defaultWeight:  1.61, defaultPrevClose: 11508.20, defaultPrice: 11600.00 },
  { symbol: 'JSWSTEEL',   name: 'JSW Steel',              sector: 'Metals/Steel',     defaultWeight:  1.59, defaultPrevClose:  1280.00, defaultPrice:  1300.00 },
  { symbol: 'ONGC',       name: 'ONGC',                   sector: 'Oil & Gas',        defaultWeight:  1.54, defaultPrevClose:   240.90, defaultPrice:   242.00 },
  { symbol: 'ETERNAL',    name: 'Eternal (Zomato)',        sector: 'Internet/Food',    defaultWeight:  1.52, defaultPrevClose:   310.00, defaultPrice:   312.40 },
  { symbol: 'NESTLEIND',  name: 'Nestle India',           sector: 'FMCG',             defaultWeight:  1.49, defaultPrevClose:  1520.00, defaultPrice:  1520.00 },
  { symbol: 'BEL',        name: 'Bharat Electronics',     sector: 'Defence/Elec',     defaultWeight:  1.44, defaultPrevClose:   388.40, defaultPrice:   391.50 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints',           sector: 'Consumer',         defaultWeight:  1.34, defaultPrevClose:  2755.00, defaultPrice:  2775.00 },
  { symbol: 'POWERGRID',  name: 'Power Grid Corp',        sector: 'Power/Utilities',  defaultWeight:  1.34, defaultPrevClose:   284.00, defaultPrice:   283.40 },
  { symbol: 'COALINDIA',  name: 'Coal India',             sector: 'Mining/Energy',    defaultWeight:  1.30, defaultPrevClose:   414.50, defaultPrice:   417.60 },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance',        sector: 'NBFC',             defaultWeight:  1.28, defaultPrevClose:  1070.00, defaultPrice:  1087.30 },
  { symbol: 'TATASTEEL',  name: 'Tata Steel',             sector: 'Metals/Steel',     defaultWeight:  1.20, defaultPrevClose:   189.10, defaultPrice:   190.95 },
  { symbol: 'HINDALCO',   name: 'Hindalco Industries',    sector: 'Metals/Aluminium', defaultWeight:  1.13, defaultPrevClose:   990.00, defaultPrice:  1020.00 },
  { symbol: 'EICHERMOT',  name: 'Eicher Motors',          sector: 'Auto',             defaultWeight:  1.12, defaultPrevClose:  8000.00, defaultPrice:  7935.00 },
  { symbol: 'GRASIM',     name: 'Grasim Industries',      sector: 'Cement/Conglom',   defaultWeight:  1.10, defaultPrevClose:  3175.00, defaultPrice:  3138.00 },
  { symbol: 'INDIGO',     name: 'IndiGo (InterGlobe Av.)',sector: 'Aviation',         defaultWeight:  1.06, defaultPrevClose:  5389.00, defaultPrice:  5358.00 },
  { symbol: 'SBILIFE',    name: 'SBI Life Insurance',     sector: 'Insurance',        defaultWeight:  0.97, defaultPrevClose:  1909.10, defaultPrice:  1899.00 },
  { symbol: 'WIPRO',      name: 'Wipro',                  sector: 'IT Services',      defaultWeight:  0.94, defaultPrevClose:   187.00, defaultPrice:   186.30 },
  { symbol: 'JIOFIN',     name: 'Jio Financial Services', sector: 'Financials',       defaultWeight:  0.88, defaultPrevClose:   262.00, defaultPrice:   265.00 },
  { symbol: 'TRENT',      name: 'Trent',                  sector: 'Retail',           defaultWeight:  0.82, defaultPrevClose:  3035.00, defaultPrice:  3107.70 },
  { symbol: 'TECHM',      name: 'Tech Mahindra',          sector: 'IT Services',      defaultWeight:  0.82, defaultPrevClose:  1650.00, defaultPrice:  1648.50 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors PV',         sector: 'Auto',             defaultWeight:  0.65, defaultPrevClose:   346.50, defaultPrice:   348.55 },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals',       sector: 'Healthcare',       defaultWeight:  0.64, defaultPrevClose:  8820.00, defaultPrice:  9050.00 },
  { symbol: 'HDFCLIFE',   name: 'HDFC Life Insurance',    sector: 'Insurance',        defaultWeight:  0.61, defaultPrevClose:   550.50, defaultPrice:   535.95 },
  { symbol: 'CIPLA',      name: 'Cipla',                  sector: 'Pharma',           defaultWeight:  0.60, defaultPrevClose:  1469.00, defaultPrice:  1460.00 },
  { symbol: 'TATACONSUM', name: 'Tata Consumer Products', sector: 'FMCG',             defaultWeight:  0.55, defaultPrevClose:  1099.30, defaultPrice:  1092.00 },
  { symbol: 'MAXHEALTH',  name: 'Max Healthcare',         sector: 'Healthcare',       defaultWeight:  0.54, defaultPrevClose:  1090.00, defaultPrice:  1077.00 },
  { symbol: 'DRREDDY',    name: "Dr. Reddy's Labs",       sector: 'Pharma',           defaultWeight:  0.50, defaultPrevClose:  1169.90, defaultPrice:  1172.60 },
];

export default function Nifty50Page() {
  return (
    <IndexTracker
      indexName="Nifty 50"
      storageKey="nifty50"
      defaultPrevLevel={24774.3}
      constituents={NIFTY50}
    />
  );
}
