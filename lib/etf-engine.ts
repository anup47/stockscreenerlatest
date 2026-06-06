import { ETF_UNIVERSE, MACRO_PROXY_SYMBOLS, FACTOR_PROXY, type EtfEntry, type Region } from './etf-universe';

// ── Types ─────────────────────────────────────────────────────────────────────
export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';

export interface EtfResult extends EtfEntry {
  rank:              number;
  returnPct:         number;
  currentPrice:      number;
  prev1dPct:         number;      // always 1-day change regardless of selected timeframe
  pct52w:            number;      // 0-100 percentile in 52-week range
  primaryDrivers:    string[];
  secondaryDrivers:  string[];
  reasonSummary:     string;
  confidence:        'High' | 'Medium' | 'Low';
  explanationType:   'deterministic';
  dataQuality:       'full' | 'partial' | 'stale';
}

export interface LeadersResponse {
  metadata: {
    timeframe:    Timeframe;
    region:       string;
    type:         string;
    theme:        string | null;
    limit:        number;
    fetchedAt:    string;
    elapsedMs:    number;
    totalUniverse:number;
    filtered:     number;
  };
  leaders:  EtfResult[];
  laggards: EtfResult[];
  summary: {
    strongestEtf:    { symbol: string; name: string; returnPct: number } | null;
    weakestEtf:      { symbol: string; name: string; returnPct: number } | null;
    strongestRegion: string | null;
    weakestRegion:   string | null;
    strongestTheme:  string | null;
    weakestTheme:    string | null;
    riskOn:          boolean | null;
    marketSnapshot:  string;
  };
  warnings: string[];
}

// ── Yahoo Finance fetch (identical pattern to btst-screen) ────────────────────
interface YFBar { date: string; close: number }

async function fetchBars(symbol: string): Promise<YFBar[] | null> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache:   'no-store',
      signal:  ctrl.signal,
    } as RequestInit);
    if (!res.ok) return null;
    const json = await res.json() as {
      chart?: { result?: Array<{ timestamp: number[]; indicators: { quote: Array<{ close: number[] }> } }> }
    };
    const r = json.chart?.result?.[0];
    if (!r) return null;
    const closes = r.indicators.quote[0].close;
    const bars: YFBar[] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      if (closes[i] == null || isNaN(closes[i])) continue;
      bars.push({ date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10), close: closes[i] });
    }
    return bars.length >= 5 ? bars : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// ── Return computation ────────────────────────────────────────────────────────
const LOOKBACK: Record<Timeframe, number> = {
  '1D': 1, '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 252,
};

function pct(from: number, to: number): number {
  return Math.round((to - from) / from * 1000) / 10;
}

function getReturn(bars: YFBar[], tf: Timeframe): number | null {
  if (bars.length < 2) return null;
  const current = bars[bars.length - 1].close;
  const lookback = LOOKBACK[tf];
  const refIdx = bars.length - 1 - Math.min(lookback, bars.length - 1);
  const ref = bars[refIdx].close;
  return pct(ref, current);
}

function pct52w(bars: YFBar[]): number {
  const year  = bars.slice(-252);
  const closes = year.map(b => b.close);
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const cur = closes[closes.length - 1];
  if (hi === lo) return 50;
  return Math.round((cur - lo) / (hi - lo) * 100);
}

// ── Explanation engine ────────────────────────────────────────────────────────
// Signal thresholds per timeframe (percentage)
const THRESHOLD: Record<Timeframe, { strong: number; weak: number }> = {
  '1D':  { strong: 0.5,  weak: 0.2  },
  '1W':  { strong: 2.0,  weak: 0.8  },
  '1M':  { strong: 5.0,  weak: 2.0  },
  '3M':  { strong: 10.0, weak: 4.0  },
  '6M':  { strong: 15.0, weak: 6.0  },
  '1Y':  { strong: 25.0, weak: 10.0 },
};

function fmt(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function explainETF(
  entry:       EtfEntry,
  etfReturn:   number,
  proxyRets:   Record<string, number>,
  tf:          Timeframe,
): Pick<EtfResult, 'primaryDrivers' | 'secondaryDrivers' | 'reasonSummary' | 'confidence' | 'explanationType'> {
  const { strong, weak } = THRESHOLD[tf];
  const etfUp = etfReturn >= 0;

  const confirmed: string[] = [];
  const supporting: string[] = [];
  const seen = new Set<string>();

  for (const tag of entry.factorTags) {
    const proxy = FACTOR_PROXY[tag];
    if (!proxy || seen.has(proxy.proxy)) continue;
    seen.add(proxy.proxy);

    const pr = proxyRets[proxy.proxy];
    if (pr == null) continue;

    const sameDir = (pr >= 0) === etfUp;
    const mag = Math.abs(pr);

    if (sameDir && mag >= strong) {
      confirmed.push(`${proxy.label} ${fmt(pr)}`);
    } else if (sameDir && mag >= weak) {
      supporting.push(`${proxy.label} ${fmt(pr)}`);
    }
  }

  // ── Special cross-asset rules ─────────────────────────────────────────────
  // USD headwind/tailwind for international & EM
  const uup = proxyRets['UUP'] ?? 0;
  if ((entry.region !== 'us' || entry.factorTags.includes('dollar')) && Math.abs(uup) >= weak && !seen.has('UUP')) {
    const oppDir = (uup < 0) === etfUp; // weak USD helps int'l
    if (oppDir) {
      const label = `USD ${uup < 0 ? 'weakness' : 'strength'} ${fmt(uup)} ${etfUp ? 'tailwind' : 'headwind'}`;
      Math.abs(uup) >= strong ? confirmed.push(label) : supporting.push(label);
    }
  }

  // Risk-on/off regime check
  const spy   = proxyRets['SPY']  ?? 0;
  const vixy  = proxyRets['VIXY'] ?? 0;
  const riskOn = spy >= weak && vixy <= -weak;
  const riskOff = spy <= -weak && vixy >= weak;

  if ((entry.factorTags.includes('defensive') || entry.factorTags.includes('risk-off')) && riskOff && etfUp) {
    if (!seen.has('SPY')) confirmed.push(`Risk-off rotation (SPY ${fmt(spy)}, VIX ${fmt(vixy)})`);
  }
  if ((entry.factorTags.includes('risk-on') || entry.factorTags.includes('high-beta')) && riskOn && etfUp) {
    if (!seen.has('SPY')) confirmed.push(`Risk-on environment (SPY ${fmt(spy)}, VIX ${fmt(vixy)})`);
  }

  // ── Build outputs ─────────────────────────────────────────────────────────
  const primary   = confirmed.slice(0, 2);
  const secondary = [...confirmed.slice(2), ...supporting].slice(0, 3);

  const confidence: EtfResult['confidence'] =
    confirmed.length >= 2 ? 'High'   :
    confirmed.length === 1 ? 'Medium' : 'Low';

  let reasonSummary: string;
  const dir = etfReturn >= 0 ? 'outperformance' : 'underperformance';
  if (primary.length > 0) {
    reasonSummary = `${dir.charAt(0).toUpperCase() + dir.slice(1)} driven by ${primary.join(' and ')}${secondary.length ? '; ' + secondary[0] : ''}.`;
  } else if (supporting.length > 0) {
    reasonSummary = `Weak signal alignment with ${supporting[0]}. Move may reflect ETF-specific dynamics.`;
  } else {
    reasonSummary = 'Performance move detected, but supporting driver evidence is limited.';
  }

  return { primaryDrivers: primary, secondaryDrivers: secondary, reasonSummary, confidence, explanationType: 'deterministic' };
}

// ── Region average helper (for summary) ──────────────────────────────────────
function bestWorst<T extends string>(
  results: EtfResult[],
  key: (r: EtfResult) => T,
): { best: T | null; worst: T | null } {
  const map = new Map<T, number[]>();
  for (const r of results) {
    const k = key(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r.returnPct);
  }
  const avgs = [...map.entries()].map(([k, vs]) => ({ k, avg: vs.reduce((a, b) => a + b, 0) / vs.length }));
  if (!avgs.length) return { best: null, worst: null };
  avgs.sort((a, b) => b.avg - a.avg);
  return { best: avgs[0].k, worst: avgs[avgs.length - 1].k };
}

// ── Main builder ──────────────────────────────────────────────────────────────
export async function buildLeadersResponse(params: {
  timeframe: Timeframe;
  region:    string;
  type:      string;
  theme:     string | null;
  limit:     number;
}): Promise<LeadersResponse> {
  const startMs = Date.now();
  const { timeframe, region, type, theme, limit } = params;
  const warnings: string[] = [];

  // Build combined fetch list: universe + macro proxies
  const universeSymbols   = ETF_UNIVERSE.map(e => e.symbol);
  const allSymbols        = [...new Set([...universeSymbols, ...MACRO_PROXY_SYMBOLS])];

  // Parallel fetch — all tickers at once (same pattern as btst-screen)
  const allBars = await Promise.all(allSymbols.map(s => fetchBars(s)));
  const barsMap = new Map<string, YFBar[]>();
  allSymbols.forEach((s, i) => { if (allBars[i]) barsMap.set(s, allBars[i]!); });

  // Build proxy returns map
  const proxyRets: Record<string, number> = {};
  for (const sym of MACRO_PROXY_SYMBOLS) {
    const b = barsMap.get(sym);
    if (b) {
      const r = getReturn(b, timeframe);
      if (r != null) proxyRets[sym] = r;
    }
  }

  // Compute results for universe
  let universe = ETF_UNIVERSE;

  // Apply filters
  if (region !== 'all') universe = universe.filter(e => e.region === (region as Region));
  if (type   !== 'all') universe = universe.filter(e => e.assetType === type);
  if (theme)            universe = universe.filter(e => e.theme.toLowerCase().includes(theme.toLowerCase()));

  const results: EtfResult[] = [];

  for (const entry of universe) {
    const bars = barsMap.get(entry.symbol);
    if (!bars) { warnings.push(`No data for ${entry.symbol}`); continue; }

    const ret1d  = getReturn(bars, '1D');
    const retTf  = getReturn(bars, timeframe);
    if (retTf == null) { warnings.push(`Insufficient history for ${entry.symbol}`); continue; }

    const current = bars[bars.length - 1].close;
    const p52     = pct52w(bars);
    const dq: EtfResult['dataQuality'] = bars.length >= 200 ? 'full' : bars.length >= 50 ? 'partial' : 'stale';

    const explanation = explainETF(entry, retTf, proxyRets, timeframe);

    results.push({
      ...entry,
      rank:         0,
      returnPct:    retTf,
      currentPrice: Math.round(current * 100) / 100,
      prev1dPct:    ret1d ?? 0,
      pct52w:       p52,
      dataQuality:  dq,
      ...explanation,
    });
  }

  // Sort and assign ranks
  const sorted = [...results].sort((a, b) => b.returnPct - a.returnPct);
  sorted.forEach((r, i) => { r.rank = i + 1; });

  const leaders  = sorted.slice(0, limit);
  const laggards = [...sorted].reverse().slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));

  // Summary
  const { best: bestRegion,  worst: worstRegion  } = bestWorst(sorted, r => r.region);
  const { best: bestTheme,   worst: worstTheme   } = bestWorst(sorted, r => r.theme);
  const spy1d = proxyRets['SPY'] ?? 0;
  const vixy1d = proxyRets['VIXY'] ?? 0;

  // Market snapshot sentence
  const riskOn = spy1d > 0.3 && vixy1d < -0.3;
  const riskOff = spy1d < -0.3 && vixy1d > 0.5;
  let marketSnapshot = '';
  if (riskOn)  marketSnapshot = `Risk-on: SPY ${fmt(spy1d)}, VIX declining. Equities broadly favoured.`;
  else if (riskOff) marketSnapshot = `Risk-off: SPY ${fmt(spy1d)}, VIX elevated. Defensive assets leading.`;
  else marketSnapshot = `Mixed signals: SPY ${fmt(spy1d)}. No clear risk-on/risk-off regime.`;

  return {
    metadata: {
      timeframe, region, type, theme, limit,
      fetchedAt:     new Date().toISOString(),
      elapsedMs:     Date.now() - startMs,
      totalUniverse: ETF_UNIVERSE.length,
      filtered:      results.length,
    },
    leaders,
    laggards,
    summary: {
      strongestEtf:    sorted[0]                ? { symbol: sorted[0].symbol, name: sorted[0].name, returnPct: sorted[0].returnPct } : null,
      weakestEtf:      sorted[sorted.length - 1]? { symbol: sorted[sorted.length - 1].symbol, name: sorted[sorted.length - 1].name, returnPct: sorted[sorted.length - 1].returnPct } : null,
      strongestRegion: bestRegion,
      weakestRegion:   worstRegion,
      strongestTheme:  bestTheme,
      weakestTheme:    worstTheme,
      riskOn:          riskOn ? true : riskOff ? false : null,
      marketSnapshot,
    },
    warnings,
  };
}
