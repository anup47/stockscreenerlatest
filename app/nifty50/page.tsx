import type { Metadata } from 'next';
import IndexTracker, { type Constituent } from '@/app/components/IndexTracker';

export const metadata: Metadata = { title: 'Nifty 50 | StockScreener' };

// Sorted by approximate weight (descending). User edits weights via Edit Weights button.
// Weights are approximate mid-2025 free-float market-cap weights; adjust via UI.
const NIFTY50: Constituent[] = [
  { symbol: 'HDFCBANK',   name: 'HDFC Bank',              sector: 'Banking',          defaultWeight: 13.50 },
  { symbol: 'RELIANCE',   name: 'Reliance Industries',    sector: 'Energy/Petrochem', defaultWeight: 9.50  },
  { symbol: 'ICICIBANK',  name: 'ICICI Bank',             sector: 'Banking',          defaultWeight: 8.00  },
  { symbol: 'INFY',       name: 'Infosys',                sector: 'IT Services',      defaultWeight: 5.50  },
  { symbol: 'TCS',        name: 'Tata Consultancy Svcs',  sector: 'IT Services',      defaultWeight: 4.50  },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel',          sector: 'Telecom',          defaultWeight: 3.80  },
  { symbol: 'ITC',        name: 'ITC',                    sector: 'FMCG',             defaultWeight: 3.40  },
  { symbol: 'LT',         name: 'Larsen & Toubro',        sector: 'Capital Goods',    defaultWeight: 3.30  },
  { symbol: 'AXISBANK',   name: 'Axis Bank',              sector: 'Banking',          defaultWeight: 2.80  },
  { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank',    sector: 'Banking',          defaultWeight: 2.70  },
  { symbol: 'SBIN',       name: 'State Bank of India',    sector: 'Banking',          defaultWeight: 2.50  },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',     sector: 'FMCG',             defaultWeight: 2.20  },
  { symbol: 'SUNPHARMA',  name: 'Sun Pharmaceutical',     sector: 'Pharma',           defaultWeight: 2.20  },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance',          sector: 'NBFC',             defaultWeight: 2.00  },
  { symbol: 'HCLTECH',    name: 'HCL Technologies',       sector: 'IT Services',      defaultWeight: 1.90  },
  { symbol: 'M&M',        name: 'Mahindra & Mahindra',    sector: 'Auto',             defaultWeight: 1.80  },
  { symbol: 'MARUTI',     name: 'Maruti Suzuki',          sector: 'Auto',             defaultWeight: 1.50  },
  { symbol: 'WIPRO',      name: 'Wipro',                  sector: 'IT Services',      defaultWeight: 1.50  },
  { symbol: 'NTPC',       name: 'NTPC',                   sector: 'Power/Utilities',  defaultWeight: 1.40  },
  { symbol: 'TITAN',      name: 'Titan Company',          sector: 'Consumer',         defaultWeight: 1.40  },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement',       sector: 'Cement',           defaultWeight: 1.30  },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv',          sector: 'NBFC',             defaultWeight: 1.30  },
  { symbol: 'POWERGRID',  name: 'Power Grid Corp',        sector: 'Power/Utilities',  defaultWeight: 1.20  },
  { symbol: 'ASIANPAINT', name: 'Asian Paints',           sector: 'Consumer',         defaultWeight: 1.20  },
  { symbol: 'TATAMOTORS', name: 'Tata Motors',            sector: 'Auto',             defaultWeight: 1.20  },
  { symbol: 'ADANIENT',   name: 'Adani Enterprises',      sector: 'Conglomerate',     defaultWeight: 1.10  },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ',      sector: 'Infrastructure',   defaultWeight: 1.00  },
  { symbol: 'JSWSTEEL',   name: 'JSW Steel',              sector: 'Metals/Steel',     defaultWeight: 1.00  },
  { symbol: 'TATASTEEL',  name: 'Tata Steel',             sector: 'Metals/Steel',     defaultWeight: 0.90  },
  { symbol: 'TECHM',      name: 'Tech Mahindra',          sector: 'IT Services',      defaultWeight: 0.90  },
  { symbol: 'HINDALCO',   name: 'Hindalco Industries',    sector: 'Metals/Aluminium', defaultWeight: 0.90  },
  { symbol: 'GRASIM',     name: 'Grasim Industries',      sector: 'Cement/Conglom',   defaultWeight: 0.90  },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank',          sector: 'Banking',          defaultWeight: 0.90  },
  { symbol: 'NESTLEIND',  name: 'Nestle India',           sector: 'FMCG',             defaultWeight: 0.80  },
  { symbol: 'CIPLA',      name: 'Cipla',                  sector: 'Pharma',           defaultWeight: 0.80  },
  { symbol: 'DRREDDY',    name: "Dr. Reddy's Labs",       sector: 'Pharma',           defaultWeight: 0.80  },
  { symbol: 'HDFCLIFE',   name: 'HDFC Life Insurance',    sector: 'Insurance',        defaultWeight: 0.80  },
  { symbol: 'SBILIFE',    name: 'SBI Life Insurance',     sector: 'Insurance',        defaultWeight: 0.80  },
  { symbol: 'BRITANNIA',  name: 'Britannia Industries',   sector: 'FMCG',             defaultWeight: 0.70  },
  { symbol: 'TATACONSUM', name: 'Tata Consumer Products', sector: 'FMCG',             defaultWeight: 0.70  },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals',       sector: 'Healthcare',       defaultWeight: 0.70  },
  { symbol: 'COALINDIA',  name: 'Coal India',             sector: 'Mining/Energy',    defaultWeight: 0.70  },
  { symbol: 'ONGC',       name: 'ONGC',                   sector: 'Oil & Gas',        defaultWeight: 0.70  },
  { symbol: 'ZOMATO',     name: 'Zomato',                 sector: 'Internet/Food',    defaultWeight: 0.70  },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto',             sector: 'Auto',             defaultWeight: 0.60  },
  { symbol: 'BEL',        name: 'Bharat Electronics',     sector: 'Defence/Elec',     defaultWeight: 0.60  },
  { symbol: 'EICHERMOT',  name: 'Eicher Motors',          sector: 'Auto',             defaultWeight: 0.60  },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp',          sector: 'Auto',             defaultWeight: 0.60  },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance',        sector: 'NBFC',             defaultWeight: 0.50  },
  { symbol: 'TRENT',      name: 'Trent',                  sector: 'Retail',           defaultWeight: 0.50  },
];

export default function Nifty50Page() {
  return (
    <IndexTracker
      indexName="Nifty 50"
      storageKey="nifty50"
      defaultPrevLevel={24500}
      constituents={NIFTY50}
    />
  );
}
