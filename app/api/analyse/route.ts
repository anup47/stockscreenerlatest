import { NextRequest, NextResponse } from 'next/server';
import { buildAnalysis, type OHLCVBar, type Timeframe, type Duration } from '@/lib/ta-analysis';

export const maxDuration = 60;

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// ── Symbol map — common names / aliases → canonical YF ticker ─────────────────
// Values that already end in .NS/.BO/^ or contain = are used as-is.
// Everything else gets .NS appended.
const SYMBOL_MAP: Record<string, string> = {
  // Indices (bare ^ tickers)
  NIFTY: '^NSEI', NIFTY50: '^NSEI', BANKNIFTY: '^NSEBANK', FINNIFTY: '^CNXFIN',
  SENSEX: '^BSESN', MIDCAP: '^CNXMC',
  // Commodities (USD futures)
  GOLD: 'GC=F', SILVER: 'SI=F', CRUDE: 'CL=F', CRUDEOIL: 'CL=F',
  NATURALGAS: 'NG=F', NATGAS: 'NG=F', BTC: 'BTC-USD', ETH: 'ETH-USD',
  // Common-name aliases (resolve to canonical NSE symbol — .NS appended below)
  AIRTEL: 'BHARTIARTL', HUL: 'HINDUNILVR',
  ZOMATO: 'ETERNAL', LIC: 'LICI',
  // Large-cap
  RELIANCE: 'RELIANCE', TCS: 'TCS', INFY: 'INFY', HDFCBANK: 'HDFCBANK',
  ICICIBANK: 'ICICIBANK', SBIN: 'SBIN', AXISBANK: 'AXISBANK',
  BAJFINANCE: 'BAJFINANCE', BAJAJFINSV: 'BAJAJFINSV', KOTAKBANK: 'KOTAKBANK',
  WIPRO: 'WIPRO', HCLTECH: 'HCLTECH', TECHM: 'TECHM', MARUTI: 'MARUTI',
  ONGC: 'ONGC', NTPC: 'NTPC', POWERGRID: 'POWERGRID', COALINDIA: 'COALINDIA',
  HINDALCO: 'HINDALCO', JSWSTEEL: 'JSWSTEEL', TATASTEEL: 'TATASTEEL',
  SUNPHARMA: 'SUNPHARMA', CIPLA: 'CIPLA', DRREDDY: 'DRREDDY', DIVISLAB: 'DIVISLAB',
  BHARTIARTL: 'BHARTIARTL', ASIANPAINT: 'ASIANPAINT', ULTRACEMCO: 'ULTRACEMCO',
  TITAN: 'TITAN', NESTLEIND: 'NESTLEIND', HINDUNILVR: 'HINDUNILVR',
  TATAMOTORS: 'TATAMOTORS', ADANIENT: 'ADANIENT', ADANIPORTS: 'ADANIPORTS',
  ADANIGREEN: 'ADANIGREEN', ADANIPOWER: 'ADANIPOWER', ADANITRANS: 'ADANITRANS',
  GRASIM: 'GRASIM', LTIM: 'LTIM', LT: 'LT', MM: 'M%26M',
  // PSUs / Infra
  BPCL: 'BPCL', HPCL: 'HPCL', IOC: 'IOC', GAIL: 'GAIL',
  BEL: 'BEL', HAL: 'HAL', BHEL: 'BHEL', SAIL: 'SAIL', NMDC: 'NMDC',
  PFC: 'PFC', RECLTD: 'RECLTD', IRCTC: 'IRCTC', IRFC: 'IRFC',
  RVNL: 'RVNL', HUDCO: 'HUDCO', NBCC: 'NBCC', NHPC: 'NHPC', SJVN: 'SJVN',
  IREDA: 'IREDA', JSWENERGY: 'JSWENERGY', TATAPOWER: 'TATAPOWER', SUZLON: 'SUZLON',
  // Banks / Finance
  PNB: 'PNB', CANBK: 'CANBK', BANKBARODA: 'BANKBARODA', FEDERALBNK: 'FEDERALBNK',
  IDFCFIRSTB: 'IDFCFIRSTB', BANDHANBNK: 'BANDHANBNK', AUBANK: 'AUBANK',
  MUTHOOTFIN: 'MUTHOOTFIN', ANGELONE: 'ANGELONE', BSE: 'BSE', CDSL: 'CDSL',
  MCX: 'MCX', POLICYBZR: 'POLICYBZR', LICI: 'LICI',
  // Consumer / Pharma
  ITC: 'ITC', DMART: 'DMART', NYKAA: 'NYKAA', PAYTM: 'PAYTM',
  NAUKRI: 'NAUKRI', ZOMATO2: 'ETERNAL', ETERNAL: 'ETERNAL',
  MARICO: 'MARICO', DABUR: 'DABUR', GODREJCP: 'GODREJCP', PIDILITIND: 'PIDILITIND',
  BERGEPAINT: 'BERGEPAINT', HAVELLS: 'HAVELLS', VOLTAS: 'VOLTAS', DIXON: 'DIXON',
  // Auto / Defence
  INDIGO: 'INDIGO', VEDL: 'VEDL', DELHIVERY: 'DELHIVERY',
  // True aliases (key ≠ canonical NSE symbol)
  BAJAJAUTO: 'BAJAJ-AUTO', HERO: 'HEROMOTOCO', DRL: 'DRREDDY',
  EICHER: 'EICHERMOT', SRTRANSFIN: 'SHRIRAMFIN', MUTHOOT: 'MUTHOOTFIN',
  APOLLO: 'APOLLOHOSP', COLGATE: 'COLPAL', EMAMI: 'EMAMILTD',
  NESTLE: 'NESTLEIND', JUBILANT: 'JUBLFOOD', TAJHOTELS: 'INDHOTEL',
  BOSCH: 'BOSCHLTD', BALKRISHNA: 'BALKRISIND', PAGE: 'PAGEIND',
  LODHA: 'MACROTECH', PRESTIGE: 'PRESTIGE', DLF: 'DLF',
  GRSE: 'GRSE', MAZAGON: 'MAZDOCK', SUPREMEIND: 'SUPREMEIND',
};

// ── Resolve user input → Yahoo Finance symbol ─────────────────────────────────
function resolveSymbol(input: string): string {
  const upper = input.toUpperCase().trim();
  // Already fully-qualified
  if (upper.endsWith('.NS') || upper.endsWith('.BO') || upper.startsWith('^') || upper.includes('=F') || upper.includes('-USD')) {
    return upper;
  }
  // Look up in map
  const mapped = SYMBOL_MAP[upper] ?? upper;
  // If mapped value is already qualified, return as-is
  if (mapped.startsWith('^') || mapped.includes('=F') || mapped.includes('-USD') || mapped.includes('%26')) {
    return mapped;
  }
  return `${mapped}.NS`;
}

// Map our timeframe tokens to Yahoo Finance interval + range params
const YF_PARAMS: Record<Timeframe, { interval: string; range: string }> = {
  '1min':   { interval: '1m',  range: '1d' },
  '2min':   { interval: '2m',  range: '5d' },
  '5min':   { interval: '5m',  range: '5d' },
  '10min':  { interval: '10m', range: '5d' },
  '30min':  { interval: '30m', range: '1mo' },
  '1hour':  { interval: '1h',  range: '3mo' },
  '1day':   { interval: '1d',  range: '1y' },
  '1week':  { interval: '1wk', range: '5y' },
  '1month': { interval: '1mo', range: '10y' },
};

async function fetchBars(symbol: string, tf: Timeframe | 'daily1y'): Promise<OHLCVBar[] | null> {
  try {
    const { interval, range } = tf === 'daily1y'
      ? { interval: '1d', range: '1y' }
      : YF_PARAMS[tf as Timeframe];
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const rows: OHLCVBar[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const close = quote.close[i];
      if (close == null || isNaN(close)) continue;
      rows.push({
        date: new Date(timestamp[i] * 1000).toISOString().slice(0, 16),
        open: quote.open[i] ?? close,
        high: quote.high[i] ?? close,
        low: quote.low[i] ?? close,
        close,
        volume: quote.volume[i] ?? 0,
      });
    }
    return rows.length >= 5 ? rows : null;
  } catch { return null; }
}

// Comprehensive NSE F&O segment stock list (~220 stocks as of 2025)
const FNO_STOCKS = new Set([
  // Nifty 50 + index derivatives
  'NIFTY','BANKNIFTY','FINNIFTY','MIDCPNIFTY','NIFTYNXT50',
  // A
  'AARTIIND','ABB','ABBOTINDIA','ABCAPITAL','ABFRL','ACC','ADANIENT','ADANIPORTS',
  'ADANIPOWER','ADANITRANS','ALKEM','AMBUJACEM','ANGELONE','APOLLOHOSP','APOLLOTYRE',
  'ASHOKLEY','ASIANPAINT','ASTRAL','ATUL','AUBANK','AUROPHARMA','AXISBANK',
  // B
  'BAJAJ-AUTO','BAJAJFINSV','BAJFINANCE','BALKRISIND','BANDHANBNK','BANKBARODA',
  'BATAINDIA','BEL','BERGEPAINT','BHARATFORG','BHARTIARTL','BHEL','BIOCON',
  'BOSCHLTD','BPCL','BRITANNIA','BSE','BSOFT',
  // C
  'CANBK','CANFINHOME','CDSL','CENTURYTEX','CESC','CGPOWER','CHAMBLFERT',
  'CHOLAFIN','CIPLA','COALINDIA','COFORGE','COLPAL','CONCOR','COROMANDEL',
  'CUMMINSIND','CYIENT',
  // D
  'DABUR','DALBHARAT','DEEPAKNTR','DELTACORP','DIXON','DMART','DRREDDY',
  // E
  'EICHERMOT','EMAMILTD','ESCORTS','ETERNAL','EXIDEIND',
  // F
  'FACT','FEDERALBNK',
  // G
  'GAIL','GLENMARK','GMRINFRA','GNFC','GODREJCP','GODREJPROP','GRANULES',
  'GRASIM','GSPL','GUJARATGAS',
  // H
  'HAL','HAVELLS','HCLTECH','HDFCBANK','HDFCLIFE','HEROMOTOCO','HINDALCO',
  'HINDCOPPER','HPCL','HUDCO','HINDUNILVR',
  // I
  'IBREALEST','ICICIBANK','ICICIGI','ICICIPRULI','IDFCFIRSTB','IEX','IGL',
  'INDHOTEL','INDIGO','INDUSTOWER','INDUSINDBK','INFY','IOC','IPCALAB',
  'IRB','IRCTC','IREDA','IRFC','ISEC','ITC',
  // J
  'JKCEMENT','JSWENERGY','JSWSTEEL','JUBLFOOD',
  // K
  'KAYNES','KOTAKBANK','KPITTECH',
  // L
  'LALPATHLAB','LAURUSLABS','LICHSGFIN','LICI','LINDE','LT','LTF','LTIM','LUPIN',
  // M
  'M&M','MANAPPURAM','MARICO','MARUTI','MAXHEALTH','MCX','METROPOLIS',
  'MFSL','MPHASIS','MRF','MUTHOOTFIN',
  // N
  'NATIONALUM','NAUKRI','NAVINFLUOR','NBCC','NCC','NESTLEIND','NHPC','NMDC','NTPC',
  // O
  'OBEROIRLTY','OFSS','ONGC',
  // P
  'PAGEIND','PEL','PERSISTENT','PETRONET','PFC','PHOENIXLTD','PIDILITIND',
  'PIIND','PNB','POLYCAB','POWERGRID','PVR',
  // R
  'RAMCOCEM','RBLBANK','RECLTD','RELIANCE','RVNL',
  // S
  'SAIL','SBICARD','SBILIFE','SBIN','SHREECEM','SHRIRAMFIN','SIEMENS',
  'SRF','SUNPHARMA','SUNTV','SUZLON','SYNGENE','SJVN',
  // T
  'TATACHEM','TATACOMM','TATAMOTORS','TATAPOWER','TATASTEEL','TATATECH',
  'TCS','TECHM','TITAN','TORNTPHARM','TORNTPOWER','TRENT',
  // U
  'UBL','ULTRACEMCO','UPL',
  // V
  'VEDL','VOLTAS',
  // W
  'WHIRLPOOL','WIPRO',
  // Z
  'ZYDUSLIFE',
]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawInput = (searchParams.get('symbol') ?? '').trim();
  const timeframe = (searchParams.get('timeframe') ?? '1day') as Timeframe;
  const duration = (searchParams.get('duration') ?? '1month') as Duration;

  if (!rawInput) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const yfSymbol = resolveSymbol(rawInput);

  // Parallel fetch: selected timeframe + daily 1y (for 52W stats + trend MAs)
  const needDailyStats = timeframe !== '1day' && timeframe !== '1week' && timeframe !== '1month';
  const [tfBars, dailyBars] = await Promise.all([
    fetchBars(yfSymbol, timeframe),
    needDailyStats ? fetchBars(yfSymbol, 'daily1y') : Promise.resolve(null),
  ]);

  if (!tfBars) {
    return NextResponse.json({
      error: `No data for "${rawInput}". Try the exact NSE symbol (e.g. RELIANCE, HDFCBANK) or append .NS / .BO.`,
    }, { status: 404 });
  }

  // Use daily bars for year stats when available; fall back to tfBars
  const statBars = dailyBars ?? tfBars;
  const yearHigh = Math.max(...statBars.map(b => b.high));
  const yearLow  = Math.min(...statBars.map(b => b.low));
  const prevClose = tfBars.length >= 2 ? tfBars[tfBars.length - 2].close : tfBars[0].close;

  // F&O: status flag only, no live data fetch
  const baseSymbol = rawInput.toUpperCase().trim().replace(/\.(NS|BO)$/i, '');
  const isFnO = FNO_STOCKS.has(baseSymbol) || FNO_STOCKS.has(SYMBOL_MAP[baseSymbol] ?? '');

  const analysis = buildAnalysis(rawInput.toUpperCase().trim(), tfBars, timeframe, duration, yearHigh, yearLow, prevClose, isFnO);
  return NextResponse.json(analysis);
}
