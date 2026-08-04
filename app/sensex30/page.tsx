import type { Metadata } from 'next';
import IndexTracker, { type Constituent } from '@/app/components/IndexTracker';

export const metadata: Metadata = { title: 'Sensex 30 | StockScreener' };

// Sorted by approximate weight (descending). User edits weights via Edit Weights button.
// Weights are approximate free-float market-cap weights; adjust via UI.
const SENSEX30: Constituent[] = [
  { symbol: 'HDFCBANK',   name: 'HDFC Bank',              sector: 'Banking',          defaultWeight: 15.50 },
  { symbol: 'RELIANCE',   name: 'Reliance Industries',    sector: 'Energy/Petrochem', defaultWeight: 10.80 },
  { symbol: 'ICICIBANK',  name: 'ICICI Bank',             sector: 'Banking',          defaultWeight: 9.20  },
  { symbol: 'INFY',       name: 'Infosys',                sector: 'IT Services',      defaultWeight: 6.80  },
  { symbol: 'TCS',        name: 'Tata Consultancy Svcs',  sector: 'IT Services',      defaultWeight: 5.80  },
  { symbol: 'ITC',        name: 'ITC',                    sector: 'FMCG',             defaultWeight: 4.30  },
  { symbol: 'LT',         name: 'Larsen & Toubro',        sector: 'Capital Goods',    defaultWeight: 4.00  },
  { symbol: 'AXISBANK',   name: 'Axis Bank',              sector: 'Banking',          defaultWeight: 3.50  },
  { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra Bank',    sector: 'Banking',          defaultWeight: 3.50  },
  { symbol: 'SBIN',       name: 'State Bank of India',    sector: 'Banking',          defaultWeight: 3.00  },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever',     sector: 'FMCG',             defaultWeight: 2.80  },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel',          sector: 'Telecom',          defaultWeight: 2.60  },
  { symbol: 'SUNPHARMA',  name: 'Sun Pharmaceutical',     sector: 'Pharma',           defaultWeight: 2.50  },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance',          sector: 'NBFC',             defaultWeight: 2.00  },
  { symbol: 'MARUTI',     name: 'Maruti Suzuki',          sector: 'Auto',             defaultWeight: 2.00  },
  { symbol: 'M&M',        name: 'Mahindra & Mahindra',    sector: 'Auto',             defaultWeight: 1.80  },
  { symbol: 'TITAN',      name: 'Titan Company',          sector: 'Consumer',         defaultWeight: 1.80  },
  { symbol: 'HCLTECH',    name: 'HCL Technologies',       sector: 'IT Services',      defaultWeight: 1.80  },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement',       sector: 'Cement',           defaultWeight: 1.50  },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv',          sector: 'NBFC',             defaultWeight: 1.50  },
  { symbol: 'ASIANPAINT', name: 'Asian Paints',           sector: 'Consumer',         defaultWeight: 1.20  },
  { symbol: 'JSWSTEEL',   name: 'JSW Steel',              sector: 'Metals/Steel',     defaultWeight: 1.20  },
  { symbol: 'NTPC',       name: 'NTPC',                   sector: 'Power/Utilities',  defaultWeight: 1.20  },
  { symbol: 'POWERGRID',  name: 'Power Grid Corp',        sector: 'Power/Utilities',  defaultWeight: 1.20  },
  { symbol: 'TECHM',      name: 'Tech Mahindra',          sector: 'IT Services',      defaultWeight: 1.20  },
  { symbol: 'NESTLEIND',  name: 'Nestle India',           sector: 'FMCG',             defaultWeight: 1.10  },
  { symbol: 'WIPRO',      name: 'Wipro',                  sector: 'IT Services',      defaultWeight: 1.00  },
  { symbol: 'TATAMOTORS', name: 'Tata Motors',            sector: 'Auto',             defaultWeight: 1.00  },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank',          sector: 'Banking',          defaultWeight: 1.00  },
  { symbol: 'TRENT',      name: 'Trent',                  sector: 'Retail',           defaultWeight: 0.90  },
];

export default function Sensex30Page() {
  return (
    <IndexTracker
      indexName="Sensex 30"
      storageKey="sensex30"
      defaultPrevLevel={80000}
      constituents={SENSEX30}
    />
  );
}
