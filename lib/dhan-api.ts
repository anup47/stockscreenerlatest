// ── Types ─────────────────────────────────────────────────────────────────────

export interface OptionLeg {
  ltp: number;
  oi: number;
  oiChange: number;
  oiChangePct: number;
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
  const oi     = Number(raw.oi ?? raw.openInterest ?? raw.open_interest ?? 0);
  const prevOI = Number(raw.previous_oi ?? raw.previousOI ?? raw.prev_oi ?? 0);
  // Use previous_oi (prev day close OI) when available; fall back to explicit oiChange field
  const oiChange = prevOI > 0
    ? oi - prevOI
    : Number(
        raw.oiChange ?? raw.oiDayChange ?? raw.oi_chg ??
        raw.changeinOpenInterest ?? raw.change_in_oi ?? raw.openInterestChange ??
        raw.oi_day_change ?? raw.oichange ?? 0
      );
  const oiChangePct = prevOI > 0 ? ((oi - prevOI) / prevOI) * 100 : 0;
  const iv = Number(
    raw.iv ?? raw.impliedVolatility ?? raw.implied_volatility ??
    raw.impliedvol ?? raw.impVol ?? 0
  );
  return {
    ltp:         Number(raw.ltp ?? raw.last_price ?? 0),
    oi,
    oiChange,
    oiChangePct,
    volume:      Number(raw.volume ?? raw.totalTradedVolume ?? raw.total_traded_volume ?? 0),
    iv,
    delta:       Number(greeks.delta  ?? raw.delta  ?? 0),
    gamma:       Number(greeks.gamma  ?? raw.gamma  ?? 0),
    theta:       Number(greeks.theta  ?? raw.theta  ?? 0),
    vega:        Number(greeks.vega   ?? raw.vega   ?? 0),
    bidPrice:    Number(raw.bidPrice ?? raw.bid_price ?? raw.top_bid_price ?? 0),
    askPrice:    Number(raw.askPrice ?? raw.ask_price ?? raw.top_ask_price ?? 0),
  };
}

function emptyLeg(): OptionLeg {
  return { ltp: 0, oi: 0, oiChange: 0, oiChangePct: 0, volume: 0, iv: 0, delta: 0, gamma: 0, theta: 0, vega: 0, bidPrice: 0, askPrice: 0 };
}

export function parseDhanOptionChain(
  body: Record<string, unknown>,
  symbol: string,
  expiry: string,
): { chain: OptionChainData; rawSample: Record<string, unknown> | null } {
  const data = (body.data ?? body) as Record<string, unknown>;
  const oc   = (data.oc ?? data.optionChain ?? {}) as Record<string, Record<string, unknown>>;
  const underlyingPrice = Number(data.last_price ?? data.underlyingValue ?? data.underlying_price ?? 0);

  const entries = Object.entries(oc);
  // grab a middle strike (near ATM) as the sample, not first which may be far OTM with all zeros
  const sampleEntry = entries[Math.floor(entries.length / 2)];
  const rawSample: Record<string, unknown> | null = sampleEntry
    ? { strike: sampleEntry[0], ce: sampleEntry[1].ce ?? null, pe: sampleEntry[1].pe ?? null }
    : null;

  const strikes: OptionStrike[] = entries
    .map(([strikeStr, legs]) => {
      const sp = Number(strikeStr);
      const ce = legs.ce ? parseOptionLeg(legs.ce as Record<string, unknown>) : emptyLeg();
      const pe = legs.pe ? parseOptionLeg(legs.pe as Record<string, unknown>) : emptyLeg();
      return { strikePrice: sp, ce, pe };
    })
    .filter(s => !isNaN(s.strikePrice))
    .sort((a, b) => a.strikePrice - b.strikePrice);

  return {
    chain: { symbol, expiry, underlyingPrice, strikes, fetchedAt: new Date().toISOString() },
    rawSample,
  };
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

export function getScripAndSeg(symbol: string): { scrip: number; seg: string } | null {
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
): Promise<{ data: OptionChainData | null; rawSample?: Record<string, unknown> | null; error?: string }> {
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
    const { chain, rawSample } = parseDhanOptionChain(body, symbol, expiry);
    return { data: chain, rawSample };
  } catch (e) {
    return { data: null, rawSample: null, error: `Network error: ${String(e)}` };
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

// ── NSE futures OI for indices (allFut — returns OI spurts, covers indices) ──

interface NseFutOIEntry {
  symbol:          string;
  latestOI:        number;
  prevOI:          number;
  changeInOI:      number;
  avgInOI:         number;
  underlyingValue: number;
}

async function fetchNseIndexFutOI(cookies: string): Promise<Map<string, NseFutOIEntry>> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    let res: Response;
    try {
      res = await fetch(
        'https://www.nseindia.com/api/live-analysis-oi-spurts-underlyings?type=allFut',
        {
          headers: {
            ...NSE_HEADERS,
            'Accept': 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest',
            ...(cookies ? { Cookie: cookies } : {}),
          },
          cache: 'no-store',
          signal: ctrl.signal,
        },
      );
    } finally { clearTimeout(t); }
    if (!res.ok) return new Map();
    const json = await res.json() as { data?: Record<string, unknown>[] };
    const map = new Map<string, NseFutOIEntry>();
    for (const row of json.data ?? []) {
      const symbol = String(row.symbol ?? '').trim().toUpperCase();
      if (!symbol) continue;
      map.set(symbol, {
        symbol,
        latestOI:        Number(row.latestOI        ?? 0),
        prevOI:          Number(row.prevOI          ?? 0),
        changeInOI:      Number(row.changeInOI      ?? 0),
        avgInOI:         Number(row.avgInOI         ?? 0),
        underlyingValue: Number(row.underlyingValue ?? 0),
      });
    }
    return map;
  } catch { return new Map(); }
}

// ── NSE F&O stocks: price + OI for ALL ~200 F&O stocks in one call ───────────

interface NseFnoFullEntry {
  price:       number;
  pChange:     number;
  oi:          number;
  oiChangePct: number;
}

async function fetchNseFnoFullData(cookies: string): Promise<Map<string, NseFnoFullEntry>> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    let res: Response;
    try {
      res = await fetch(
        'https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O',
        {
          headers: {
            ...NSE_HEADERS,
            'Accept': 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest',
            ...(cookies ? { Cookie: cookies } : {}),
          },
          cache: 'no-store',
          signal: ctrl.signal,
        },
      );
    } finally { clearTimeout(t); }
    if (!res.ok) return new Map();
    const json = await res.json() as { data?: Record<string, unknown>[] };
    const map = new Map<string, NseFnoFullEntry>();
    for (const stock of json.data ?? []) {
      const symbol = String(stock.symbol ?? '').trim().toUpperCase();
      if (!symbol) continue;
      map.set(symbol, {
        price:       Number(stock.lastPrice ?? stock.ltp ?? 0),
        pChange:     Number(stock.pChange   ?? stock.percentChange ?? 0),
        oi:          Number(stock.openInterest ?? 0),
        oiChangePct: Number(stock.pchangeinOpenInterest ?? 0),
      });
    }
    return map;
  } catch { return new Map(); }
}

const NSE_INDEX_SYMS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']);

const ALL_SCREEN_SYMS = [...ALL_FNO_SYMBOLS.indices, ...ALL_FNO_SYMBOLS.stocks];

export async function fetchFuturesQuotesFromNSE(expiry?: string): Promise<{
  quotes:            Map<string, FuturesQuote>;
  availableExpiries: string[];
  scripMasterSize:   number;
  rawQuotesSize:     number;
  loadError:         string;
}> {
  // Cookies and scrip master are both slow — fetch in parallel.
  // One cookie fetch shared between both NSE API calls that need it.
  const [cookies, futData] = await Promise.all([
    fetchNseCookies(),
    loadFuturesData(ALL_SCREEN_SYMS),
  ]);

  const [stockData, indexOI, indices] = await Promise.all([
    fetchNseFnoFullData(cookies),
    fetchNseIndexFutOI(cookies),
    fetchNseIndices(),
  ]);

  if (stockData.size === 0 && indexOI.size === 0) {
    return { quotes: new Map(), availableExpiries: [], scripMasterSize: 0, rawQuotesSize: 0, loadError: 'NSE API returned no data' };
  }

  // Expiry dates from scrip master for the dropdown
  const expirySet = new Set<string>();
  for (const entries of futData.values()) {
    for (const e of entries) expirySet.add(e.expiry);
  }
  const availableExpiries = [...expirySet].sort();

  // When an expiry is selected, filter to symbols that have a contract for it
  const symbolsForExpiry: Set<string> | null = expiry
    ? new Set([...futData.entries()]
        .filter(([, entries]) => entries.some(e => e.expiry === expiry))
        .map(([sym]) => sym.toUpperCase()))
    : null;

  const indexBySymbol = new Map(indices.map(i => [i.symbol.toUpperCase(), i]));

  const quotes = new Map<string, FuturesQuote>();

  for (const [symbol, d] of stockData) {
    if (NSE_INDEX_SYMS.has(symbol)) continue;
    if (symbolsForExpiry && !symbolsForExpiry.has(symbol)) continue;
    // equity-stockIndices doesn't include OI fields — use allFut OI data for stocks too
    const futOI = indexOI.get(symbol);
    const oi = futOI?.latestOI ?? d.oi;
    const oiChangePct = futOI
      ? (futOI.prevOI > 0 ? ((futOI.latestOI - futOI.prevOI) / futOI.prevOI) * 100 : futOI.avgInOI)
      : d.oiChangePct;
    if (d.pChange === 0 && oi === 0) continue;
    quotes.set(symbol, {
      symbol, secId: 0, expiry: expiry ?? '',
      price: d.price, changePct: d.pChange,
      oi, oiChangePct,
    });
  }

  for (const symbol of NSE_INDEX_SYMS) {
    if (symbolsForExpiry && !symbolsForExpiry.has(symbol)) continue;
    const oi  = indexOI.get(symbol);
    const idx = indexBySymbol.get(symbol);
    if (!oi && !idx) continue;
    const oiChangePct = oi
      ? (oi.prevOI > 0 ? ((oi.latestOI - oi.prevOI) / oi.prevOI) * 100 : oi.avgInOI)
      : 0;
    quotes.set(symbol, {
      symbol, secId: 0, expiry: expiry ?? '',
      price:       idx?.ltp       ?? (oi?.underlyingValue ?? 0),
      changePct:   idx?.changePct ?? 0,
      oi:          oi?.latestOI   ?? 0,
      oiChangePct,
    });
  }

  const totalSymbols = stockData.size + NSE_INDEX_SYMS.size;
  return { quotes, availableExpiries, scripMasterSize: totalSymbols, rawQuotesSize: quotes.size, loadError: '' };
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

// ── NSE option chain (public API — no credentials needed) ─────────────────────

const MONTH: Record<string, string> = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
};

function nseToIso(d: string): string {
  // "26-May-2025" → "2025-05-26"
  const [day, mon, year] = d.split('-');
  return `${year}-${MONTH[mon] ?? '01'}-${day.padStart(2, '0')}`;
}

// NSE symbol name overrides for indices
const NSE_INDEX_SYMBOL: Record<string, string> = {
  NIFTY: 'NIFTY', BANKNIFTY: 'BANKNIFTY',
  FINNIFTY: 'FINNIFTY', MIDCPNIFTY: 'MIDCPNIFTY',
};

let _nseCookies = '';
let _nseCookiesTs = 0;

async function fetchNseCookies(): Promise<string> {
  const now = Date.now();
  if (_nseCookies && now - _nseCookiesTs < 30_000) return _nseCookies;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://www.nseindia.com/', {
      headers: { ...NSE_HEADERS, 'Connection': 'keep-alive' },
      cache: 'no-store',
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    // Node 20+ has getSetCookie(); fall back to splitting the combined header
    type HeadersWithGetSetCookie = Headers & { getSetCookie?: () => string[] };
    const hdrs = r.headers as HeadersWithGetSetCookie;
    const arr: string[] = typeof hdrs.getSetCookie === 'function'
      ? hdrs.getSetCookie()
      : (r.headers.get('set-cookie') ?? '').split(/,(?=[^ ])/).map(s => s.trim());
    _nseCookies = arr.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
    _nseCookiesTs = Date.now();
    return _nseCookies;
  } catch { return ''; }
}

export async function fetchNseFnoChangePct(): Promise<Map<string, number>> {
  const cookies = await fetchNseCookies();
  const data = await fetchNseFnoFullData(cookies);
  const map = new Map<string, number>();
  for (const [sym, d] of data) map.set(sym, d.pChange);
  return map;
}

interface NseRecord {
  strikePrice: number;
  expiryDate?: string;
  CE?: Record<string, unknown>;
  PE?: Record<string, unknown>;
}

interface NseBody {
  filtered?: { data?: NseRecord[] };
  records?: { data?: NseRecord[]; underlyingValue?: number; expiryDates?: string[] };
}

function parseNseLeg(raw: Record<string, unknown>): OptionLeg {
  return {
    ltp:         Number(raw.lastPrice               ?? 0),
    oi:          Number(raw.openInterest            ?? 0),
    oiChange:    Number(raw.changeinOpenInterest     ?? 0),
    oiChangePct: Number(raw.pchangeinOpenInterest    ?? 0),
    volume:      Number(raw.totalTradedVolume        ?? 0),
    iv:          Number(raw.impliedVolatility        ?? 0),
    delta:       Number(raw.delta                   ?? 0),
    gamma:       Number(raw.gamma                   ?? 0),
    theta:       Number(raw.theta                   ?? 0),
    vega:        Number(raw.vega                    ?? 0),
    bidPrice:    Number(raw.bidprice ?? raw.bidPrice ?? 0),
    askPrice:    Number(raw.askPrice ?? raw.askprice ?? 0),
  };
}

export async function fetchNseOptionChain(
  symbol: string,
  expiry: string,
): Promise<{ data: OptionChainData | null; expiries: string[]; error?: string }> {
  try {
    const cookies = await fetchNseCookies();
    const isIndex = !!NSE_INDEX_SYMBOL[symbol.toUpperCase()];
    const nseSymbol = symbol.toUpperCase();
    const endpoint = isIndex
      ? `https://www.nseindia.com/api/option-chain-indices?symbol=${nseSymbol}`
      : `https://www.nseindia.com/api/option-chain-equities?symbol=${nseSymbol}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: {
          ...NSE_HEADERS,
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          ...(cookies ? { Cookie: cookies } : {}),
        },
        cache: 'no-store',
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = body.slice(0, 200);
      return { data: null, expiries: [], error: `NSE HTTP ${res.status}${hint ? ` — ${hint}` : ''}` };
    }

    const json = await res.json() as NseBody;
    const expiries = (json.records?.expiryDates ?? []).map(nseToIso);
    const allRecords: NseRecord[] = json.records?.data ?? json.filtered?.data ?? [];

    // Filter to selected expiry
    const records = expiry
      ? allRecords.filter(r => !r.expiryDate || nseToIso(r.expiryDate) === expiry)
      : allRecords;

    const underlyingPrice = Number(json.records?.underlyingValue ?? 0);

    const strikes: OptionStrike[] = records
      .map(r => ({
        strikePrice: r.strikePrice,
        ce: r.CE ? parseNseLeg(r.CE) : emptyLeg(),
        pe: r.PE ? parseNseLeg(r.PE) : emptyLeg(),
      }))
      .filter(s => !isNaN(s.strikePrice))
      .sort((a, b) => a.strikePrice - b.strikePrice);

    return {
      data: { symbol, expiry, underlyingPrice, strikes, fetchedAt: new Date().toISOString() },
      expiries,
    };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'NSE API timed out (15 s). NSE may be blocking requests from this server.'
      : `NSE error: ${String(e)}`;
    return { data: null, expiries: [], error: msg };
  }
}

// ── Dhan scrip master → option contract security IDs ─────────────────────────
//
// Dhan's scrip master CSV maps every option contract (symbol+expiry+strike+CE/PE)
// to a unique securityId. We download & cache it, then use the IDs to call the
// historical API for previous-day OI.

interface ScripEntry { secId: string; instrument: string }

// Module-level caches (warm as long as the serverless instance lives)
let _masterCache: Map<string, ScripEntry> | null = null;
let _masterCacheKey = '';   // "SYMBOL:EXPIRY" — re-fetch when this changes
let _masterCacheTime = 0;

const _prevOICache = new Map<string, number>(); // secId → prevOI
let   _prevOICacheDate = '';                    // YYYY-MM-DD — cleared daily

function prevTradingDay(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

async function loadScripMaster(symbol: string, expiry: string): Promise<Map<string, ScripEntry>> {
  const cacheKey = `${symbol}:${expiry}`;
  const now = Date.now();
  if (_masterCache && _masterCacheKey === cacheKey && now - _masterCacheTime < 8 * 3600_000) {
    return _masterCache;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', {
      cache: 'no-store', signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return _masterCache ?? new Map();

    const text = await res.text();
    const lines = text.split('\n');
    const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));

    const col = (name: string) => rawHeaders.indexOf(name);
    const iSecId   = col('SEM_SMST_SECURITY_ID');
    const iSeg     = col('SEM_SEGMENT');
    const iInstr   = col('SEM_INSTRUMENT_NAME');
    const iExpiry  = col('SEM_EXPIRY_DATE');
    const iStrike  = col('SEM_STRIKE_PRICE');
    const iOptType = col('SEM_OPTION_TYPE');
    const iTrading = col('SEM_TRADING_SYMBOL'); // e.g. "BHEL29MAY26440CE" — starts with symbol

    if (iSecId < 0 || iSeg < 0 || iTrading < 0) return _masterCache ?? new Map();

    const map = new Map<string, ScripEntry>();
    const upperSym = symbol.toUpperCase();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || !line.includes(upperSym)) continue;

      const cols = line.split(',');
      if (cols[iSeg]?.trim() !== 'NSE_FO') continue;

      const instr = cols[iInstr]?.trim() ?? '';
      if (instr !== 'OPTIDX' && instr !== 'OPTSTK') continue;

      // Match underlying via trading symbol (SM_SYMBOL_NAME is "BHELOPT" not "BHEL")
      const tradingSymbol = cols[iTrading]?.trim() ?? '';
      if (!tradingSymbol.toUpperCase().startsWith(upperSym)) continue;

      // Normalise expiry: "2026-05-29 15:30:00" → "2026-05-29"
      const rawExp = (iExpiry >= 0 ? cols[iExpiry] : '') ?? '';
      const csvExpiry = rawExp.trim().replace(/['"]/g, '').split(' ')[0].split('T')[0];
      if (csvExpiry !== expiry) continue;

      const secId  = cols[iSecId]?.trim().replace(/['"]/g, '') ?? '';
      const strike = Number(cols[iStrike]?.trim() ?? '0');
      const rawOpt = (cols[iOptType]?.trim() ?? '').toUpperCase();
      const optType: 'CE' | 'PE' = rawOpt.startsWith('C') ? 'CE' : 'PE';

      if (!secId || !strike || isNaN(strike)) continue;
      map.set(`${strike}:${optType}`, { secId, instrument: instr });
    }

    _masterCache = map;
    _masterCacheKey = cacheKey;
    _masterCacheTime = now;
    return map;
  } catch {
    clearTimeout(timer);
    return _masterCache ?? new Map();
  }
}

async function fetchOnePrevOI(
  secId: string,
  instrument: string,
  clientId: string,
  accessToken: string,
): Promise<number> {
  // Daily cache — prev-day OI doesn't change during the trading session
  const today = new Date().toISOString().split('T')[0];
  if (_prevOICacheDate !== today) { _prevOICache.clear(); _prevOICacheDate = today; }
  if (_prevOICache.has(secId)) return _prevOICache.get(secId)!;

  const dateStr = prevTradingDay();
  try {
    const res = await fetch(`${DHAN_BASE}/v2/charts/historical`, {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({
        securityId: secId,
        exchangeSegment: 'NSE_FO',
        instrument,
        expiryCode: 0,
        fromDate: dateStr,
        toDate: dateStr,
      }),
    });
    if (!res.ok) { _prevOICache.set(secId, 0); return 0; }
    const data = await res.json() as Record<string, unknown>;
    const oiArr = (data.oi ?? data.openInterest ?? []) as number[];
    const oi = oiArr.length > 0 ? Number(oiArr[oiArr.length - 1]) : 0;
    _prevOICache.set(secId, oi);
    return oi;
  } catch { _prevOICache.set(secId, 0); return 0; }
}

// ── Futures OI data (scrip master → market feed quote + historical prev OI) ──

export interface FuturesQuote {
  symbol:      string;
  secId:       number;
  expiry:      string;
  price:       number;
  changePct:   number;
  oi:          number;
  oiChangePct: number;
}

interface FuturesEntry {
  secId:      number;
  expiry:     string;
  instrument: 'FUTSTK' | 'FUTIDX';
}

let _futDataCache: Map<string, FuturesEntry[]> | null = null;
let _futDataCacheTs = 0;
export let futuresLoadError = ''; // last error from loadFuturesData

async function loadFuturesData(symbols: string[]): Promise<Map<string, FuturesEntry[]>> {
  const now = Date.now();
  if (_futDataCache && now - _futDataCacheTs < 4 * 3600_000) return _futDataCache;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 28_000);
  try {
    const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', {
      cache:   'no-store',
      signal:  ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stockscreener/1.0)' },
    });
    clearTimeout(timer);
    if (!res.ok) {
      futuresLoadError = `CSV HTTP ${res.status}`;
      return _futDataCache ?? new Map();
    }

    const text  = await res.text();
    const lines = text.split('\n');
    const hdrs  = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim().replace(/['"]/g, ''));

    // CSV columns: SEM_EXM_EXCH_ID, SEM_SEGMENT, SEM_SMST_SECURITY_ID, SEM_INSTRUMENT_NAME,
    //              SEM_EXPIRY_CODE, SEM_TRADING_SYMBOL, ..., SEM_EXPIRY_DATE, ...
    const iExch    = hdrs.indexOf('SEM_EXM_EXCH_ID');
    const iSecId   = hdrs.indexOf('SEM_SMST_SECURITY_ID');
    const iInstr   = hdrs.indexOf('SEM_INSTRUMENT_NAME');
    const iExpiry  = hdrs.indexOf('SEM_EXPIRY_DATE');
    const iTrading = hdrs.indexOf('SEM_TRADING_SYMBOL');

    if (iExch < 0 || iSecId < 0 || iInstr < 0 || iExpiry < 0 || iTrading < 0) {
      futuresLoadError = `CSV columns missing. Found: ${hdrs.slice(0, 8).join(' | ')}`;
      return _futDataCache ?? new Map();
    }

    const today  = new Date().toISOString().split('T')[0];
    const symSet = new Set(symbols.map(s => s.toUpperCase()));

    const accum = new Map<string, Map<string, FuturesEntry>>();
    let nfoFutCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = line.split(',');

      if ((cols[iExch]?.trim() ?? '') !== 'NSE') continue;

      // Futures identified by instrument name (FUTSTK / FUTIDX)
      const instr = cols[iInstr]?.trim().replace(/['"]/g, '') ?? '';
      if (instr !== 'FUTSTK' && instr !== 'FUTIDX') continue;
      nfoFutCount++;

      // Trading symbol format: "SYMBOL-MonYYYY-FUT"  (e.g. "RELIANCE-Jun2026-FUT", "M&M-Jul2026-FUT")
      // Symbol = everything before the last two dash-separated parts (MonYYYY and FUT)
      const tradingSym = cols[iTrading]?.trim().replace(/['"]/g, '') ?? '';
      const parts = tradingSym.split('-');
      if (parts.length < 3) continue;
      const csvSym = parts.slice(0, -2).join('-').toUpperCase();
      if (!symSet.has(csvSym)) continue;

      const rawExp = cols[iExpiry]?.trim().replace(/['"]/g, '').split(' ')[0].split('T')[0] ?? '';
      if (!rawExp || rawExp < today) continue;

      const secId = parseInt(cols[iSecId]?.trim().replace(/['"]/g, '') ?? '', 10);
      if (!secId || isNaN(secId)) continue;

      if (!accum.has(csvSym)) accum.set(csvSym, new Map());
      const symMap = accum.get(csvSym)!;
      if (!symMap.has(rawExp)) {
        symMap.set(rawExp, { secId, expiry: rawExp, instrument: instr as 'FUTSTK' | 'FUTIDX' });
      }
    }

    if (accum.size === 0) {
      futuresLoadError = `No symbols matched (${nfoFutCount} NSE futures in CSV, ${lines.length} total lines)`;
      return _futDataCache ?? new Map();
    }

    const result = new Map<string, FuturesEntry[]>();
    for (const [sym, expMap] of accum) {
      result.set(sym, [...expMap.values()].sort((a, b) => a.expiry.localeCompare(b.expiry)));
    }

    futuresLoadError = '';
    _futDataCache = result;
    _futDataCacheTs = now;
    return result;
  } catch (e) {
    clearTimeout(timer);
    futuresLoadError = `CSV exception: ${String(e)}`;
    return _futDataCache ?? new Map();
  }
}

interface FuturesHistQuote { price: number; prevClose: number; oi: number; prevOI: number; }

// Fetches the last two completed daily candles for price, prevClose, OI, prevOI.
// Uses toDate=yesterday (not today) so only completed candles are returned.
// fromDate is 10 calendar days back to safely span any market holidays.
async function fetchFuturesHistorical(
  secId: number,
  instrument: 'FUTSTK' | 'FUTIDX',
  clientId: string,
  accessToken: string,
): Promise<FuturesHistQuote> {
  const toDate = prevTradingDay();
  const fromDate = (() => {
    const d = new Date(toDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 10);
    return d.toISOString().split('T')[0];
  })();
  try {
    const res = await fetch(`${DHAN_BASE}/v2/charts/historical`, {
      method:  'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({
        securityId:      String(secId),
        exchangeSegment: 'NSE_FO',
        instrument,
        expiryCode:      0,
        fromDate,
        toDate,
      }),
    });
    if (!res.ok) return { price: 0, prevClose: 0, oi: 0, prevOI: 0 };
    const data = await res.json() as Record<string, unknown>;
    const c = (data.close ?? []) as number[];
    const o = (data.oi    ?? data.openInterest ?? []) as number[];
    const n = c.length;
    if (n === 0) return { price: 0, prevClose: 0, oi: 0, prevOI: 0 };
    return {
      price:     Number(c[n - 1]),
      prevClose: n >= 2 ? Number(c[n - 2]) : 0,
      oi:        Number(o[n - 1] ?? 0),
      prevOI:    n >= 2 ? Number(o[n - 2] ?? 0) : 0,
    };
  } catch { return { price: 0, prevClose: 0, oi: 0, prevOI: 0 }; }
}

export async function fetchFuturesQuotes(
  symbols: string[],
  clientId: string,
  accessToken: string,
  expiry?: string,
): Promise<{ quotes: Map<string, FuturesQuote>; availableExpiries: string[]; scripMasterSize: number; rawQuotesSize: number; loadError: string }> {
  const dataMap = await loadFuturesData(symbols);
  if (dataMap.size === 0) {
    return { quotes: new Map(), availableExpiries: [], scripMasterSize: 0, rawQuotesSize: 0, loadError: futuresLoadError };
  }

  // All distinct expiry dates for the dropdown
  const expirySet = new Set<string>();
  for (const entries of dataMap.values()) {
    for (const e of entries) expirySet.add(e.expiry);
  }
  const availableExpiries = [...expirySet].sort();

  // Build secId → { sym, instrument, expiry } for the selected (or nearest) expiry
  type EntryMeta = { sym: string; instrument: 'FUTSTK' | 'FUTIDX'; expiry: string };
  const revMap = new Map<number, EntryMeta>();
  const secIds: number[] = [];

  for (const [sym, entries] of dataMap) {
    const entry = expiry
      ? (entries.find(e => e.expiry === expiry) ?? entries[0])
      : entries[0];
    if (!entry) continue;
    revMap.set(entry.secId, { sym, instrument: entry.instrument, expiry: entry.expiry });
    secIds.push(entry.secId);
  }

  // Use historical candles (already proven to work for option chain prev-OI).
  // fromDate=yesterday + toDate=today returns 2 candles → price, prevClose, OI, prevOI in one call.
  const HIST_BATCH = 20;
  const quotes = new Map<string, FuturesQuote>();

  for (let i = 0; i < secIds.length; i += HIST_BATCH) {
    const batch = secIds.slice(i, i + HIST_BATCH);
    const results = await Promise.all(batch.map(secId => {
      const meta = revMap.get(secId)!;
      return fetchFuturesHistorical(secId, meta.instrument, clientId, accessToken)
        .then(h => ({ secId, sym: meta.sym, expiry: meta.expiry, ...h }));
    }));
    for (const r of results) {
      if (r.price === 0 || r.prevClose === 0) continue;
      const changePct   = ((r.price - r.prevClose) / r.prevClose) * 100;
      const oiChangePct = r.prevOI > 0 ? ((r.oi - r.prevOI) / r.prevOI) * 100 : 0;
      quotes.set(r.sym, { symbol: r.sym, secId: r.secId, expiry: r.expiry, price: r.price, changePct, oi: r.oi, oiChangePct });
    }
  }

  return { quotes, availableExpiries, scripMasterSize: dataMap.size, rawQuotesSize: quotes.size, loadError: '' };
}

// ── Exported: fetch prev-day OI for every strike in a chain (parallel batches of 10) ──
export async function fetchPrevDayOIForChain(
  symbol: string,
  expiry: string,
  strikes: number[],
  clientId: string,
  accessToken: string,
): Promise<Record<number, { cePrevOI: number; pePrevOI: number }>> {
  const scripMap = await loadScripMaster(symbol, expiry);
  if (scripMap.size === 0) return {};

  const result: Record<number, { cePrevOI: number; pePrevOI: number }> = {};
  const BATCH = 10;

  for (let i = 0; i < strikes.length; i += BATCH) {
    const batch = strikes.slice(i, i + BATCH);
    await Promise.all(batch.map(async strike => {
      const ceEntry = scripMap.get(`${strike}:CE`);
      const peEntry = scripMap.get(`${strike}:PE`);
      const [cePrevOI, pePrevOI] = await Promise.all([
        ceEntry ? fetchOnePrevOI(ceEntry.secId, ceEntry.instrument, clientId, accessToken) : Promise.resolve(0),
        peEntry ? fetchOnePrevOI(peEntry.secId, peEntry.instrument, clientId, accessToken) : Promise.resolve(0),
      ]);
      result[strike] = { cePrevOI, pePrevOI };
    }));
  }

  return result;
}
