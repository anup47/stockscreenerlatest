import type { Metadata } from 'next';
import IndexTracker, { type Constituent } from '@/app/components/IndexTracker';

export const metadata: Metadata = { title: 'Sensex 30 | StockScreener' };

// Actual Sensex 30 constituents – Aug 2026 rebalancing
// Weights        : smart-investing.in EOD Aug 3 2026 (free-float MCap weights)
// defaultPrevClose: Aug 4 2026 3:15 PM closing prices (today's close = baseline)
// Price column   : blank — user types live prices; click "Set 3:15 Close" each day
// defaultPrevLevel: update this daily to yesterday's official Sensex close
const SENSEX30: Constituent[] = [
  { symbol: 'RELIANCE',   name: 'Reliance Industries',    sector: 'Energy/Petrochem', defaultWeight: 11.19, defaultPrevClose:  1290.90 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel',          sector: 'Telecom',          defaultWeight:  7.69, defaultPrevClose:  1970.10 },
  { symbol: 'HDFCBANK',   name: 'HDFC Bank',              sector: 'Banking',          defaultWeight:  7.31, defaultPrevClose:   742.00 },
  { symbol: 'ICICIBANK',  name: 'ICICI Bank',             sector: 'Banking',          defaultWeight:  6.55, defaultPrevClose:  1440.00 },
  { symbol: 'SBIN',       name: 'State Bank of India',    sector: 'Banking',          defaultWeight:  6.04, defaultPrevClose:  1042.70 },
  { symbol: 'TCS',        name: 'Tata Consultancy Svcs',  sector: 'IT Services',      defaultWeight:  5.60, defaultPrevClose:  2460.00 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance',          sector: 'NBFC',             defaultWeight:  4.49, defaultPrevClose:  1149.00 },
  { symbol: 'LT',         name: 'Larsen & Toubro',        sector: 'Capital Goods',    defaultWeight:  3.48, defaultPrevClose:  3990.00 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',     sector: 'FMCG',             defaultWeight:  3.15, defaultPrevClose:  2096.50 },
  { symbol: 'INFY',       name: 'Infosys',                sector: 'IT Services',      defaultWeight:  3.00, defaultPrevClose:  1167.50 },
  { symbol: 'SUNPHARMA',  name: 'Sun Pharmaceutical',     sector: 'Pharma',           defaultWeight:  2.96, defaultPrevClose:  1964.00 },
  { symbol: 'MARUTI',     name: 'Maruti Suzuki',          sector: 'Auto',             defaultWeight:  2.80, defaultPrevClose: 14168.00 },
  { symbol: 'TITAN',      name: 'Titan Company',          sector: 'Consumer',         defaultWeight:  2.75, defaultPrevClose:  4935.00 },
  { symbol: 'M&M',        name: 'Mahindra & Mahindra',    sector: 'Auto',             defaultWeight:  2.66, defaultPrevClose:  3433.00 },
  { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank',    sector: 'Banking',          defaultWeight:  2.47, defaultPrevClose:   398.00 },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ',      sector: 'Infrastructure',   defaultWeight:  2.47, defaultPrevClose:  1706.70 },
  { symbol: 'AXISBANK',   name: 'Axis Bank',              sector: 'Banking',          defaultWeight:  2.46, defaultPrevClose:  1261.80 },
  { symbol: 'HCLTECH',    name: 'HCL Technologies',       sector: 'IT Services',      defaultWeight:  2.34, defaultPrevClose:  1369.90 },
  { symbol: 'ITC',        name: 'ITC',                    sector: 'FMCG',             defaultWeight:  2.27, defaultPrevClose:   289.00 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement',       sector: 'Cement',           defaultWeight:  2.23, defaultPrevClose: 12050.00 },
  { symbol: 'NTPC',       name: 'NTPC',                   sector: 'Power/Utilities',  defaultWeight:  2.13, defaultPrevClose:   343.65 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv',          sector: 'NBFC',             defaultWeight:  2.09, defaultPrevClose:  2105.00 },
  { symbol: 'ETERNAL',    name: 'Eternal (Zomato)',        sector: 'Internet/Food',    defaultWeight:  1.89, defaultPrevClose:   312.40 },
  { symbol: 'BEL',        name: 'Bharat Electronics',     sector: 'Defence/Elec',     defaultWeight:  1.79, defaultPrevClose:   391.50 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints',           sector: 'Consumer',         defaultWeight:  1.67, defaultPrevClose:  2775.00 },
  { symbol: 'POWERGRID',  name: 'Power Grid Corp',        sector: 'Power/Utilities',  defaultWeight:  1.67, defaultPrevClose:   283.40 },
  { symbol: 'TATASTEEL',  name: 'Tata Steel',             sector: 'Metals/Steel',     defaultWeight:  1.49, defaultPrevClose:   190.95 },
  { symbol: 'INDIGO',     name: 'IndiGo (InterGlobe Av.)',sector: 'Aviation',         defaultWeight:  1.32, defaultPrevClose:  5358.00 },
  { symbol: 'TRENT',      name: 'Trent',                  sector: 'Retail',           defaultWeight:  1.02, defaultPrevClose:  3107.70 },
  { symbol: 'TECHM',      name: 'Tech Mahindra',          sector: 'IT Services',      defaultWeight:  1.02, defaultPrevClose:  1648.50 },
];

export default function Sensex30Page() {
  return (
    <IndexTracker
      indexName="Sensex 30"
      storageKey="sensex30"
      defaultPrevLevel={78639.0}
      constituents={SENSEX30}
    />
  );
}
