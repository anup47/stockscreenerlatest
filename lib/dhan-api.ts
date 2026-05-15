// ── Types ─────────────────────────────────────────────────────────────────────

export interface OptionLeg {
  ltp: number;
  oi: number;
  oiChange: number;
  volume: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  bidPrice: number;
  askPrice: number;
}

export interface OptionStrike {
  strikePrice: number;
  ce: OptionLeg;
  pe: OptionLeg;
}

export interface OptionChainData {
  symbol: string;
  expiry: string;
  underlyingPrice: number;
  strikes: OptionStrike[];
  fetchedAt: string;
}

export interface ExpiryList {
  symbol: string;
  expiries: string[];
}

export interface IndexQuote {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

export interface FnOStock {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePct: number;
  volume: number;
  oi: number;
  oiChange: number;
  sector: string;
}

// ── Dhan credential headers ───────────────────────────────────────────────────

export function dhanHeaders(clientId: string, accessToken: string): HeadersInit {
  return {
    'access-token': accessToken,
    'client-id': clientId,
    'Content-Type': 'application/json',
  };
}

// ── Parse Dhan option chain response (supports v1 flat + v2 nested greeks) ────

function parseOptionLeg(raw: Record<string, unknown>): OptionLeg {
  const greeks = (raw.greeks as Record<string, unknown>) ?? {};
  return {
    ltp:      Number(raw.ltp      ?? raw.last_price ?? 0),
    oi:       Number(raw.oi       ?? raw.openInterest ?? 0),
    oiChange: Number(raw.oiChange ?? raw.oiDayChange ?? 0),
    volume:   Number(raw.volume   ?? raw.totalTradedVolume ?? 0),
    iv:       Number(raw.iv       ?? raw.impliedVolatility ?? 0),
    delta:    Number(greeks.delta  ?? raw.delta  ?? 0),
    gamma:    Number(greeks.gamma  ?? raw.gamma  ?? 0),
    theta:    Number(greeks.theta  ?? raw.theta  ?? 0),
    vega:     Number(greeks.vega   ?? raw.vega   ?? 0),
    bidPrice: Number(raw.bidPrice ?? raw.bid_price ?? 0),
    askPrice: Number(raw.askPrice ?? raw.ask_price ?? 0),
  };
}

function emptyLeg(): OptionLeg {
  return { ltp: 0, oi: 0, oiChange: 0, volume: 0, iv: 0, delta: 0, gamma: 0, theta: 0, vega: 0, bidPrice: 0, askPrice: 0 };
}

export function parseDhanOptionChain(
  body: Record<string, unknown>,
  symbol: string,
  expiry: string,
): OptionChainData {
  const data = (body.data ?? body) as Record<string, unknown>;
  const oc   = (data.oc ?? data.optionChain ?? {}) as Record<string, Record<string, unknown>>;
  const underlyingPrice = Number(data.last_price ?? data.underlyingValue ?? data.underlying_price ?? 0);

  const strikes: OptionStrike[] = Object.entries(oc)
    .map(([strikeStr, legs]) => {
      const sp = Number(strikeStr);
      const ce = legs.ce ? parseOptionLeg(legs.ce as Record<string, unknown>) : emptyLeg();
      const pe = legs.pe ? parseOptionLeg(legs.pe as Record<string, unknown>) : emptyLeg();
      return { strikePrice: sp, ce, pe };
    })
    .filter(s => !isNaN(s.strikePrice))
    .sort((a, b) => a.strikePrice - b.strikePrice);

  return { symbol, expiry, underlyingPrice, strikes, fetchedAt: new Date().toISOString() };
}

// ── Server-side Dhan fetchers ─────────────────────────────────────────────────

const DHAN_BASE = 'https://api.dhan.co';

// Dhan v2 API: numeric scrip IDs for index option chain calls (segment = IDX_I)
const IDX_SCRIP: Record<string, number> = {
  NIFTY:      13,
  BANKNIFTY:  25,
  FINNIFTY:   27,
  MIDCPNIFTY: 442,
};

// NSE F&O stock scrip IDs (segment = NSE_FNO) — sourced from Dhan security master
export const FNO_SCRIP: Record<string, number> = {
  '360ONE':     13061, ABB:          13,    ABCAPITAL:    21614, ADANIENSOL:   10217,
  ADANIENT:     25,    ADANIGREEN:   3563,  ADANIPORTS:   15083, ADANIPOWER:   17388,
  ALKEM:        11703, AMBER:        1185,  AMBUJACEM:    1270,  ANGELONE:     324,
  APLAPOLLO:    25780, APOLLOHOSP:   157,   ASHOKLEY:     212,   ASIANPAINT:   236,
  ASTRAL:       14418, AUBANK:       21238, AUROPHARMA:   275,   AXISBANK:     5900,
  BAJAJFINSV:   16675, BAJAJHLDNG:   305,   BAJFINANCE:   317,   'BAJAJ-AUTO': 16669,
  BANDHANBNK:   2263,  BANKBARODA:   4668,  BANKINDIA:    4745,  BDL:          2144,
  BEL:          383,   BHARATFORG:   422,   BHARTIARTL:   10604, BHEL:         438,
  BIOCON:       11373, BLUESTARCO:   8311,  BOSCHLTD:     2181,  BPCL:         526,
  BRITANNIA:    547,   BSE:          19585, CAMS:         342,   CANBK:        10794,
  CDSL:         21174, CGPOWER:      760,   CHOLAFIN:     685,   CIPLA:        694,
  COALINDIA:    20374, COCHINSHIP:   21508, COFORGE:      11543, COLPAL:       15141,
  CONCOR:       4749,  CROMPTON:     17094, CUMMINSIND:   1901,  DABUR:        772,
  DALBHARAT:    8075,  DELHIVERY:    9599,  DIVISLAB:     10940, DIXON:        21690,
  DLF:          14732, DMART:        19913, DRREDDY:      881,   EICHERMOT:    910,
  ETERNAL:      5097,  EXIDEIND:     676,   FEDERALBNK:   1023,  FORCEMOT:     11573,
  FORTIS:       14592, GAIL:         4717,  GLENMARK:     7406,  GMRAIRPORT:   13528,
  GODFRYPHLP:   1181,  GODREJCP:     10099, GODREJPROP:   17875, GRASIM:       1232,
  HAL:          2303,  HAVELLS:      9819,  HCLTECH:      7229,  HDFCAMC:      4244,
  HDFCBANK:     1333,  HDFCLIFE:     467,   HEROMOTOCO:   1348,  HINDALCO:     1363,
  HINDPETRO:    1406,  HINDUNILVR:   1394,  HINDZINC:     1424,  HYUNDAI:      25844,
  ICICIBANK:    4963,  ICICIGI:      21770, ICICIPRULI:   18652, IDEA:         14366,
  IDFCFIRSTB:   11184, IEX:          220,   INDHOTEL:     1512,  INDIANB:      14309,
  INDIGO:       11195, INDUSINDBK:   5258,  INDUSTOWER:   29135, INFY:         1594,
  INOXWIND:     7852,  IOC:          1624,  IRCTC:        13611, IRDA:         20261,
  IRFC:         2029,  KFINTECH:     13359, KOTAKBANK:    1922,  KPITTECH:     9683,
  LAURUSLABS:   19234, LICHSGFIN:    1997,  LICI:         9480,  LODHA:        3220,
  LT:           11483, LTF:          24948, LTM:          17818, LUPIN:        10440,
  'M&M':        2031,  MANAPPURAM:   19061, MANKIND:      15380, MARICO:       4067,
  MARUTI:       10999, MAXHEALTH:    22377, MAZDOCK:      509,   MCX:          31181,
  MFSL:         2142,  MOTHERSON:    4204,  MOTILALOFS:   14947, MPHASIS:      4503,
  MUTHOOTFIN:   23650, 'NAM-INDIA':  357,   NATIONALUM:   6364,  NAUKRI:       13751,
  NBCC:         31415, NESTLEIND:    17963, NHPC:         17400, NMDC:         15332,
  NTPC:         11630, NUVAMA:       18721, NYKAA:        6545,  OBEROIRLTY:   20242,
  OFSS:         10738, OIL:          17438, ONGC:         2475,  PAGEIND:      14413,
  PATANJALI:    17029, PAYTM:        6705,  PERSISTENT:   18365, PETRONET:     11351,
  PFC:          14299, PGEL:         25358, PHOENIXLTD:   14552, PIDILITIND:   2664,
  PIIND:        24184, PNB:          10666, PNBHOUSING:   18908, POLICYBZR:    6656,
  POLYCAB:      9590,  POWERGRID:    14977, POWERINDIA:   18457, PREMIERENE:   25049,
  PRESTIGE:     20302, RBLBANK:      18391, RECLTD:       15355, RELIANCE:     2885,
  RVNL:         9552,  SAIL:         2963,  SAMMAANCAP:   30125, SBICARD:      17971,
  SBILIFE:      21808, SBIN:         3045,  SHREECEM:     3103,  SHRIRAMFIN:   4306,
  SIEMENS:      3150,  SOLARINDS:    13332, SONACOMS:     4684,  SRF:          3273,
  SUNPHARMA:    3351,  SUPREMEIND:   3363,  SUZLON:       12018, SWIGGY:       27066,
  TATACONSUM:   3432,  TATAELXSI:    3411,  TATAPOWER:    3426,  TATASTEEL:    3499,
  TCS:          11536, TECHM:        13538, TIINDIA:      312,   TITAN:        3506,
  TMPV:         3456,  TORNTPHARM:   3518,  TRENT:        1964,  TVSMOTOR:     8479,
  ULTRACEMCO:   11532, UNIONBANK:    10753, UNITDSPR:     10447, UNOMINDA:     14154,
  UPL:          11287, VBL:          18921, VEDL:         3063,  VMM:          27969,
  VOLTAS:       3718,  WAAREEENER:   25907, WIPRO:        3787,  YESBANK:      11915,
  ZYDUSLIFE:    7929,
};

// Ordered list of all symbols for the UI (indices first, then stocks alphabetically)
export const ALL_FNO_SYMBOLS = {
  indices: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'],
  stocks: Object.keys(FNO_SCRIP).sort(),
};

function getScripAndSeg(symbol: string): { scrip: number; seg: string } | null {
  const upper = symbol.toUpperCase();
  if (IDX_SCRIP[upper]) return { scrip: IDX_SCRIP[upper], seg: 'IDX_I' };
  if (FNO_SCRIP[upper]) return { scrip: FNO_SCRIP[upper], seg: 'NSE_FNO' };
  return null;
}

export async function fetchDhanOptionChain(
  symbol: string,
  expiry: string,
  clientId: string,
  accessToken: string,
): Promise<{ data: OptionChainData | null; error?: string }> {
  const meta = getScripAndSeg(symbol);
  if (!meta) return { data: null, error: `Unknown symbol: ${symbol}` };
  try {
    const res = await fetch(`${DHAN_BASE}/v2/optionchain`, {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({ UnderlyingScrip: meta.scrip, UnderlyingSeg: meta.seg, Expiry: expiry }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const b = JSON.parse(raw) as Record<string, unknown>;
        const detail = b.message ?? b.error ?? b.errorMessage ?? b.remarks;
        msg = detail ? `HTTP ${res.status}: ${String(detail)}` : `HTTP ${res.status} — ${raw.slice(0, 300)}`;
      } catch { msg = `HTTP ${res.status} — ${raw.slice(0, 300)}`; }
      return { data: null, error: msg };
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    return { data: parseDhanOptionChain(body, symbol, expiry) };
  } catch (e) {
    return { data: null, error: `Network error: ${String(e)}` };
  }
}

export async function fetchDhanExpiry(
  symbol: string,
  clientId: string,
  accessToken: string,
): Promise<{ data: ExpiryList | null; error?: string }> {
  const meta = getScripAndSeg(symbol);
  if (!meta) return { data: null, error: `Unknown symbol: ${symbol}` };
  try {
    const res = await fetch(`${DHAN_BASE}/v2/optionchain/expirylist`, {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({ UnderlyingScrip: meta.scrip, UnderlyingSeg: meta.seg }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const b = JSON.parse(raw) as Record<string, unknown>;
        const detail = b.message ?? b.error ?? b.errorMessage ?? b.remarks;
        if (detail) msg = `HTTP ${res.status}: ${String(detail)}`;
        else msg = `HTTP ${res.status} — ${raw.slice(0, 300)}`;
      } catch { msg = `HTTP ${res.status} — ${raw.slice(0, 300)}`; }
      return { data: null, error: msg };
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    const list = (body.data ?? body.expiryList ?? body) as unknown;
    const arr: string[] = Array.isArray(list) ? list as string[] : [];
    return { data: { symbol, expiries: arr } };
  } catch (e) {
    return { data: null, error: `Network error: ${String(e)}` };
  }
}

export async function testDhanCredentials(
  clientId: string,
  accessToken: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    // /v2/fundlimit is a lightweight GET that only requires auth headers
    const res = await fetch(`${DHAN_BASE}/v2/fundlimit`, {
      method: 'GET',
      headers: dhanHeaders(clientId, accessToken),
    });
    if (res.ok) return { ok: true };
    let msg = `HTTP ${res.status}`;
    try {
      const raw = await res.text();
      const body = JSON.parse(raw) as Record<string, unknown>;
      const detail = body.message ?? body.error ?? body.errorMessage ?? body.remarks ?? body.detail;
      msg = detail ? `HTTP ${res.status}: ${String(detail)}` : `HTTP ${res.status} — ${raw.slice(0, 200)}`;
    } catch { /* body not JSON */ }
    return { ok: false, status: res.status, error: msg };
  } catch (e) {
    return { ok: false, error: `Network error: ${String(e)}` };
  }
}

// ── NSE public index data (server-side only — uses cookie simulation) ─────────

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

export async function fetchNseIndices(): Promise<IndexQuote[]> {
  try {
    const res = await fetch(
      'https://www.nseindia.com/api/allIndices',
      { headers: NSE_HEADERS, cache: 'no-store' },
    );
    if (!res.ok) return [];
    const json = await res.json() as { data?: Record<string, unknown>[] };
    const rows = json.data ?? [];

    const TARGETS = new Set(['NIFTY 50', 'NIFTY BANK', 'NIFTY FIN SERVICE', 'NIFTY MIDCAP 50', 'INDIA VIX']);
    const SYMBOL_MAP: Record<string, string> = {
      'NIFTY 50':          'NIFTY',
      'NIFTY BANK':        'BANKNIFTY',
      'NIFTY FIN SERVICE': 'FINNIFTY',
      'NIFTY MIDCAP 50':   'MIDCPNIFTY',
      'INDIA VIX':         'VIX',
    };

    return rows
      .filter(r => TARGETS.has(String(r.index ?? '')))
      .map(r => ({
        symbol:    SYMBOL_MAP[String(r.index)] ?? String(r.index),
        name:      String(r.index ?? ''),
        ltp:       Number(r.last ?? r.indexValue ?? 0),
        change:    Number(r.variation ?? r.change ?? 0),
        changePct: Number(r.percentChange ?? r.pChange ?? 0),
        high:      Number(r.dayHigh ?? r.high ?? 0),
        low:       Number(r.dayLow  ?? r.low  ?? 0),
        open:      Number(r.open    ?? 0),
        prevClose: Number(r.previousClose ?? r.prev ?? 0),
      }));
  } catch { return []; }
}

// ── NSE F&O top movers (TradingView scanner fallback) ────────────────────────

export async function fetchFnoMovers(): Promise<FnOStock[]> {
  try {
    const body = {
      filter: [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'exchange', operation: 'equal', right: 'NSE' },
        { left: 'is_primary', operation: 'equal', right: true },
      ],
      options: {},
      symbols: { query: { types: [] }, tickers: [] },
      columns: ['name', 'description', 'close', 'change', 'change_abs', 'volume', 'open_interest', 'open_interest_change', 'sector'],
      sort: { sortBy: 'volume', sortOrder: 'desc' },
      range: [0, 30],
    };

    const res = await fetch('https://scanner.tradingview.com/india/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { s: string; d: unknown[] }[] };
    return (json.data ?? []).map(row => ({
      symbol:    String(row.d[0] ?? row.s?.replace('NSE:', '') ?? ''),
      name:      String(row.d[1] ?? ''),
      ltp:       Number(row.d[2] ?? 0),
      changePct: Number(row.d[3] ?? 0),
      change:    Number(row.d[4] ?? 0),
      volume:    Number(row.d[5] ?? 0),
      oi:        Number(row.d[6] ?? 0),
      oiChange:  Number(row.d[7] ?? 0),
      sector:    String(row.d[8] ?? ''),
    }));
  } catch { return []; }
}
