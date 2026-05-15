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

export async function fetchDhanOptionChain(
  symbol: string,
  expiry: string,
  clientId: string,
  accessToken: string,
): Promise<OptionChainData | null> {
  try {
    const res = await fetch(`${DHAN_BASE}/v2/optionchain`, {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({ UnderlyingSymbol: symbol, ExpiryDate: expiry, InstrumentType: 'OPTIDX' }),
    });
    if (!res.ok) return null;
    const body: Record<string, unknown> = await res.json();
    return parseDhanOptionChain(body, symbol, expiry);
  } catch { return null; }
}

export async function fetchDhanExpiry(
  symbol: string,
  clientId: string,
  accessToken: string,
): Promise<{ data: ExpiryList | null; error?: string }> {
  try {
    const res = await fetch(`${DHAN_BASE}/v2/optionchain/expirylist`, {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({ UnderlyingSymbol: symbol }),
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
