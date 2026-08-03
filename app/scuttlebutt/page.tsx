'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDhanCredentials }                         from '@/app/hooks/useDhanCredentials';
import { useLivePrices }                              from '@/app/hooks/useLivePrices';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tier       = 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP' | 'ANY';
type Conviction = 'HIGH' | 'MEDIUM-HIGH' | 'MEDIUM' | 'LOW-MED';
type SortKey    = 'rank' | 'todayPct' | 'fromEntry';

interface Stock {
  rank:       number;
  name:       string;
  symbol:     string;    // NSE ticker (or LTELEVATOR for BSE SME)
  bse?:       true;      // flag for BSE-only stocks
  tier:       Tier;
  mcap:       string;
  keySignal:  string;
  conviction: Conviction;
  jul31Close: number;    // Jul 31, 2026 NSE/BSE closing price (hardcoded)
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

const ENTRY_KEY  = 'scuttlebutt_aug2026_entry_v4';
const ENTRY_DATE = '31 Jul 2026';

const STOCKS: Stock[] = [
  { rank: 1,  name: 'MTAR Technologies',        symbol: 'MTARTECH',   tier: 'MIDCAP',   mcap: '16,782 Cr',    jul31Close: 5726.00, keySignal: 'Q1 PAT +5x; guidance raised to 80%; Bloom Energy confirmed',         conviction: 'HIGH'        },
  { rank: 2,  name: 'Muthoot Finance',           symbol: 'MUTHOOTFIN', tier: 'LARGECAP', mcap: '1,25,262 Cr',  jul31Close: 3119.60, keySignal: 'PAT +43%, P/E 11.8x, gold AUM +44%; cheapest quality NBFC',          conviction: 'HIGH'        },
  { rank: 3,  name: 'Emmvee Photovoltaic',       symbol: 'EMMVEE',     tier: 'MIDCAP',   mcap: '21,927 Cr',    jul31Close:  317.60, keySignal: 'PAT +103%, order book 9.9 GW ATH; ALMM List II moat',                 conviction: 'HIGH'        },
  { rank: 4,  name: 'Aeroflex Industries',       symbol: 'AEROFLEX',   tier: 'SMALLCAP', mcap: '~4,500 Cr',    jul31Close:  435.45, keySignal: 'PAT +162%; liquid cooling 1,040 skids Q1; 9K→15K capacity Jul',        conviction: 'HIGH'        },
  { rank: 5,  name: 'Laurus Labs',               symbol: 'LAURUSLABS', tier: 'LARGECAP', mcap: '96,245 Cr',    jul31Close: 1816.20, keySignal: 'Q1 PAT +126%; CDMO 125 active projects; EBITDA margin record 31.8%',  conviction: 'HIGH'        },
  { rank: 6,  name: 'Tatva Chintan Pharma',      symbol: 'TATVA',      tier: 'SMALLCAP', mcap: '~2,500 Cr',    jul31Close: 1788.20, keySignal: 'PAT +140%, EBITDA 19.5%; Rs 200 Cr Dahej greenfield approved',         conviction: 'MEDIUM-HIGH' },
  { rank: 7,  name: 'Genus Power',               symbol: 'GENUSPOWER', tier: 'MIDCAP',   mcap: '9,797 Cr',     jul31Close:  312.70, keySignal: 'Rs 25,173 Cr order book (4x target); Q1 FY27 results Aug 5',           conviction: 'MEDIUM-HIGH' },
  { rank: 8,  name: 'Ganesha Ecosphere',         symbol: 'GANECOS',    tier: 'MICROCAP', mcap: '~885 Cr',      jul31Close: 1183.80, keySignal: 'India only FSSAI rPET mfr; EPR 40% mandate; Q1 call Aug 4',            conviction: 'MEDIUM-HIGH' },
  { rank: 9,  name: 'Navin Fluorine',            symbol: 'NAVINFLUOR', tier: 'MIDCAP',   mcap: '~30,000 Cr',   jul31Close: 7567.50, keySignal: 'AI cooling (Chemours) + HFO India-first (Honeywell); Q1 Aug 5',         conviction: 'MEDIUM-HIGH' },
  { rank: 10, name: 'Sobha Ltd',                 symbol: 'SOBHA',      tier: 'ANY',      mcap: '14,570 Cr',    jul31Close: 1372.20, keySignal: 'Pre-sales +76% Q1; net cash achieved; luxury segment 42% of sales',    conviction: 'MEDIUM'      },
  { rank: 11, name: "Divi's Laboratories",       symbol: 'DIVISLAB',   tier: 'LARGECAP', mcap: '~1,20,000 Cr', jul31Close: 8056.00, keySignal: 'Q1 PAT +65%; CDMO volume cycle maturing; quality compounder',          conviction: 'MEDIUM'      },
  { rank: 12, name: 'Syrma SGS Technology',      symbol: 'SYRMA',      tier: 'ANY',      mcap: '25,523 Cr',    jul31Close: 1366.80, keySignal: 'Revenue +67%, PAT +112%; IND AA upgrade; ODM business expanding',      conviction: 'MEDIUM'      },
  { rank: 13, name: 'Venus Remedies',            symbol: 'VENUSREM',   tier: 'SMALLCAP', mcap: '2,101 Cr',     jul31Close: 1581.60, keySignal: 'Q1 PAT +139%, Revenue +30%; hospital critical care export ramp',        conviction: 'MEDIUM'      },
  { rank: 14, name: 'DEE Development Engineers', symbol: 'DEEDEV',     tier: 'MICROCAP', mcap: '~850 Cr',      jul31Close:  678.55, keySignal: 'India largest process piping; HRSG US$15.27M/yr contract Jun 2027',     conviction: 'MEDIUM'      },
  { rank: 15, name: 'HBL Engineering',           symbol: 'HBLENGINE',  tier: 'SMALLCAP', mcap: '~6,000 Cr',    jul31Close:  718.70, keySignal: 'Kavach Rs 1,522 Cr + IAF smart bomb order Jul 2026',                   conviction: 'MEDIUM'      },
  { rank: 16, name: 'Bajaj Finance',             symbol: 'BAJFINANCE', tier: 'LARGECAP', mcap: '~4,80,000 Cr', jul31Close: 1141.20, keySignal: 'Q1 PAT +29%, AUM +24%; 52W high; asset quality improving',              conviction: 'MEDIUM'      },
  { rank: 17, name: 'Data Patterns India',       symbol: 'DATAPATTNS', tier: 'ANY',      mcap: '~7,000 Cr',    jul31Close: 4281.00, keySignal: 'L1 Rs 1,300 Cr HAL deal pending; contrarian buy post -8% dip',          conviction: 'MEDIUM'      },
  { rank: 18, name: 'L.T. Elevator',             symbol: 'LTELEVATOR', tier: 'MICROCAP', mcap: '~380 Cr',      jul31Close:  279.50, bse: true,  keySignal: 'India only listed elevator; mfg facility bhoomi pujan Jul 13', conviction: 'LOW-MED'  },
  { rank: 19, name: 'Senco Gold',                symbol: 'SENCO',      tier: 'ANY',      mcap: '~3,500 Cr',    jul31Close:  403.20, keySignal: 'Revenue +60%, SSSG +38%; festive season tailwind Q2-Q3 FY27',           conviction: 'LOW-MED'     },
  { rank: 20, name: 'Vintage Coffee',            symbol: 'VINCOFE',    tier: 'MICROCAP', mcap: '~750 Cr',      jul31Close:  149.48, keySignal: 'FDC Rs 480 Cr plant (FY28); B2B instant coffee export structural play', conviction: 'LOW-MED'     },
];

// NSE-listed symbols (exclude BSE-only); used for live price lookups
const NSE_SYMBOLS = STOCKS.filter(s => !s.bse).map(s => s.symbol);

// ── Style maps ────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<Tier, string> = {
  LARGECAP: 'bg-amber-900/50 text-amber-300 border border-amber-700/50',
  MIDCAP:   'bg-sky-900/50 text-sky-300 border border-sky-700/50',
  SMALLCAP: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50',
  MICROCAP: 'bg-purple-900/50 text-purple-300 border border-purple-700/50',
  ANY:      'bg-rose-900/50 text-rose-300 border border-rose-700/50',
};

const CONVICTION_STYLE: Record<Conviction, string> = {
  'HIGH':        'text-emerald-400 font-bold',
  'MEDIUM-HIGH': 'text-sky-400 font-semibold',
  'MEDIUM':      'text-amber-400',
  'LOW-MED':     'text-slate-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fromEntry(ltp: number, ep: number) {
  if (!ep || ep <= 0 || ltp <= 0) return null;
  return ((ltp - ep) / ep) * 100;
}

// Build the default entry map from hardcoded Jul 31 closes
function defaultEntryPrices(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of STOCKS) m[s.symbol] = s.jul31Close;
  return m;
}

// ── Dhan equity prices hook ───────────────────────────────────────────────────

interface DhanEqQ { ltp: number; prevClose: number; changePct: number; }

function useDhanEquityPrices(
  symbols: string[],
  isConfigured: boolean,
  headers: Record<string, string>,
): Map<string, DhanEqQ> {
  const [prices, setPrices] = useState<Map<string, DhanEqQ>>(new Map());
  const symKey = symbols.slice().sort().join(',');

  const load = useCallback(async () => {
    if (!symKey || !isConfigured) return;
    try {
      const res = await fetch(
        `/api/dhan/equity-prices?symbols=${encodeURIComponent(symKey)}`,
        { headers, cache: 'no-store' },
      );
      if (!res.ok) return;
      const json = await res.json() as { quotes?: Record<string, DhanEqQ> };
      setPrices(new Map(Object.entries(json.quotes ?? {})));
    } catch { /* silent */ }
  }, [symKey, isConfigured, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isConfigured) return;
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [isConfigured, load]);

  return prices;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScuttlebuttPage() {
  const creds      = useDhanCredentials();
  const dhanPrices = useDhanEquityPrices(NSE_SYMBOLS, creds.isConfigured, creds.headers);

  // Yahoo Finance for NSE symbols (fallback / supplement for Dhan gaps)
  const yahooPrices = useLivePrices(NSE_SYMBOLS);

  // ── Entry prices ──────────────────────────────────────────────────────────
  const [entryPrices, setEntryPrices] = useState<Record<string, number>>(defaultEntryPrices);
  const [entryDate,   setEntryDate]   = useState(ENTRY_DATE);

  // Load from localStorage (or seed from hardcoded Jul31 closes)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ENTRY_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as { date: string; prices: Record<string, number> };
        if (stored?.prices && Object.keys(stored.prices).length > 0) {
          setEntryPrices(stored.prices);
          setEntryDate(stored.date ?? ENTRY_DATE);
          return;
        }
      }
    } catch { /* ignore */ }
    // No stored entry → seed from hardcoded Jul31 closes and persist
    const defaults = defaultEntryPrices();
    localStorage.setItem(ENTRY_KEY, JSON.stringify({ date: ENTRY_DATE, prices: defaults }));
    setEntryPrices(defaults);
    setEntryDate(ENTRY_DATE);
  }, []);

  const resetToJul31 = useCallback(() => {
    const defaults = defaultEntryPrices();
    localStorage.setItem(ENTRY_KEY, JSON.stringify({ date: ENTRY_DATE, prices: defaults }));
    setEntryPrices(defaults);
    setEntryDate(ENTRY_DATE);
  }, []);

  // ── Unified live price map (Dhan preferred, Yahoo fallback) ──────────────
  const liveMap = useMemo(() => {
    const m = new Map<string, { ltp: number; changePct: number }>();
    for (const [sym, q] of yahooPrices) {
      m.set(sym, { ltp: q.price, changePct: q.changePct });
    }
    for (const [sym, q] of dhanPrices) {
      if (q.ltp > 0) m.set(sym, { ltp: q.ltp, changePct: q.changePct });
    }
    return m;
  }, [yahooPrices, dhanPrices]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortKey>('rank');
  const [asc,    setAsc]    = useState(true);

  function handleSort(key: SortKey) {
    if (sortBy === key) { setAsc(a => !a); return; }
    setSortBy(key);
    setAsc(key === 'rank');
  }

  const sorted = useMemo(() => [...STOCKS].sort((a, b) => {
    let va = 0, vb = 0;
    if (sortBy === 'rank') {
      va = a.rank; vb = b.rank;
    } else if (sortBy === 'todayPct') {
      va = liveMap.get(a.symbol)?.changePct ?? -999;
      vb = liveMap.get(b.symbol)?.changePct ?? -999;
    } else {
      const feA = fromEntry(liveMap.get(a.symbol)?.ltp ?? 0, entryPrices[a.symbol] ?? 0);
      const feB = fromEntry(liveMap.get(b.symbol)?.ltp ?? 0, entryPrices[b.symbol] ?? 0);
      va = feA ?? -999; vb = feB ?? -999;
    }
    return asc ? va - vb : vb - va;
  }), [sortBy, asc, liveMap, entryPrices]);

  // ── Portfolio summary ─────────────────────────────────────────────────────
  const { liveCount, gainers, losers, avgReturn } = useMemo(() => {
    let live = 0, g = 0, l = 0, total = 0;
    for (const s of STOCKS) {
      const ep  = entryPrices[s.symbol];
      // For BSE-only stocks, use jul31Close as "ltp" since no live feed
      const ltp = s.bse ? s.jul31Close : (liveMap.get(s.symbol)?.ltp ?? 0);
      if (!ep || !ltp || ltp <= 0) continue;
      live++;
      const ret = fromEntry(ltp, ep)!;
      total += ret;
      if (ret >= 0) g++; else l++;
    }
    return { liveCount: live, gainers: g, losers: l, avgReturn: live > 0 ? total / live : null };
  }, [liveMap, entryPrices]);

  // ── Price source label ────────────────────────────────────────────────────
  const priceSource = creds.isConfigured
    ? `Dhan${dhanPrices.size > 0 ? ` (${dhanPrices.size}/${NSE_SYMBOLS.length})` : ''} + Yahoo`
    : 'Yahoo Finance';

  // ── Sort header ───────────────────────────────────────────────────────────
  function SortTh({ col, label, right = true }: { col: SortKey; label: string; right?: boolean }) {
    const active = sortBy === col;
    return (
      <th onClick={() => handleSort(col)}
        className={[
          'px-3 py-2.5 text-xs uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors',
          right ? 'text-right' : 'text-left',
          active ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300',
        ].join(' ')}>
        {label}{active ? (asc ? ' ▲' : ' ▼') : ''}
      </th>
    );
  }

  return (
    <main className="w-full px-4 py-5 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Scuttlebutt Run</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-mono">Aug 2026</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">20-Stock Equal-Weight Portfolio</h1>
          <p className="text-slate-400 text-sm mt-1">
            Entry = <span className="text-emerald-400 font-medium">31 Jul 2026 closing prices</span>
            &nbsp;·&nbsp; 5% per stock &nbsp;·&nbsp; Review window: Q2 FY27 (to Nov 2026)
          </p>
        </div>

        <div className="text-right space-y-1.5 shrink-0">
          <div className="text-xs text-slate-500">
            Live: <span className={creds.isConfigured ? 'text-emerald-400' : 'text-amber-400'}>{priceSource}</span>
            <span className="text-slate-600 ml-1">· 30s</span>
          </div>
          <div className="text-xs text-slate-500">
            Entry: <span className="text-slate-300">{entryDate} close</span>
          </div>
          <button
            onClick={resetToJul31}
            className="text-xs px-2.5 py-1 rounded border border-slate-600 text-slate-400 hover:text-slate-200
              hover:border-slate-400 transition-colors"
          >
            Reset to Jul 31 Close
          </button>
        </div>
      </div>

      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Stocks',       v: '20',        c: 'text-slate-100' },
          { label: 'Equal Weight', v: '5% each',   c: 'text-slate-100' },
          {
            label: 'Avg Return',
            v: avgReturn !== null
              ? `${avgReturn >= 0 ? '+' : ''}${fmt(avgReturn)}%`
              : `-- (${liveCount}/20)`,
            c: avgReturn === null ? 'text-slate-500' : avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
          { label: 'Gainers', v: String(gainers), c: gainers > 0 ? 'text-emerald-400' : 'text-slate-500' },
          { label: 'Losers',  v: String(losers),  c: losers  > 0 ? 'text-red-400'     : 'text-slate-500' },
        ].map(({ label, v, c }) => (
          <div key={label} className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center">
            <div className={`text-xl font-bold font-mono ${c}`}>{v}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tier legend ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.entries(TIER_STYLE) as [Tier, string][]).map(([tier, style]) => (
          <span key={tier} className={`px-2 py-0.5 rounded text-[10px] font-bold ${style}`}>{tier}</span>
        ))}
        <span className="text-xs text-slate-600 ml-1">· ANY = wildcard picks from any cap tier</span>
      </div>

      {/* ── Dhan notice ───────────────────────────────────────────────────── */}
      {creds.isHydrated && !creds.isConfigured && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded px-3 py-2 text-amber-300 text-sm">
          Dhan not configured — live prices via Yahoo Finance (30s refresh).{' '}
          <a href="/settings" className="underline hover:text-amber-200">Configure in Settings</a>
          {' '}for Dhan market feed.
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1080px]">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <SortTh col="rank"      label="#"             right={false} />
                <th className="px-3 py-2.5 text-left   text-slate-500 text-xs uppercase tracking-wide">Company</th>
                <th className="px-3 py-2.5 text-center text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Tier</th>
                <th className="px-3 py-2.5 text-right  text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">MCap</th>
                <th className="px-3 py-2.5 text-right  text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Entry Rs</th>
                <th className="px-3 py-2.5 text-right  text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">LTP Rs</th>
                <SortTh col="todayPct"  label="Today %" />
                <SortTh col="fromEntry" label="From Entry %" />
                <th className="px-3 py-2.5 text-left   text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Conviction</th>
                <th className="px-3 py-2.5 text-left   text-slate-500 text-xs uppercase tracking-wide">Signal</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((s, idx) => {
                const q        = s.bse ? null : liveMap.get(s.symbol);
                const ep       = entryPrices[s.symbol] ?? s.jul31Close;
                const ltp      = q?.ltp ?? 0;
                const todayPct = q?.changePct ?? null;
                const feRet    = ltp > 0 ? fromEntry(ltp, ep) : null;
                const rowBg    = idx % 2 === 1 ? 'bg-slate-900/40' : '';
                const isDhan   = dhanPrices.has(s.symbol);

                return (
                  <tr key={s.symbol}
                    className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${rowBg}`}>

                    {/* # */}
                    <td className="px-3 py-2.5">
                      <span className="text-slate-500 font-mono text-xs">{s.rank}</span>
                    </td>

                    {/* Company */}
                    <td className="px-3 py-2.5 min-w-[180px]">
                      <div className="font-semibold text-slate-100 text-sm leading-tight">{s.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500 font-mono">{s.symbol}</span>
                        {s.bse && (
                          <span className="text-[9px] px-1 py-0 rounded bg-slate-700 text-slate-400 border border-slate-600 font-bold">BSE SME</span>
                        )}
                        {isDhan && (
                          <span className="text-[9px] px-1 py-0 rounded bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 font-bold">DHAN</span>
                        )}
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_STYLE[s.tier]}`}>
                        {s.tier}
                      </span>
                    </td>

                    {/* MCap */}
                    <td className="px-3 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {s.mcap}
                    </td>

                    {/* Entry price (Jul 31 close) */}
                    <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                      <span className="text-slate-400">{fmt(ep)}</span>
                    </td>

                    {/* LTP */}
                    <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                      {s.bse
                        ? <span className="text-slate-600 text-xs">BSE only</span>
                        : ltp > 0
                          ? <span className="text-slate-100">{fmt(ltp)}</span>
                          : <span className="text-slate-600 text-xs animate-pulse">loading</span>
                      }
                    </td>

                    {/* Today % */}
                    <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                      {todayPct !== null
                        ? <span className={todayPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {todayPct >= 0 ? '+' : ''}{fmt(todayPct)}%
                          </span>
                        : <span className="text-slate-600 text-xs">--</span>
                      }
                    </td>

                    {/* From entry % */}
                    <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                      {feRet !== null
                        ? <span className={`font-bold ${feRet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {feRet >= 0 ? '+' : ''}{fmt(feRet)}%
                          </span>
                        : <span className="text-slate-600 text-xs">--</span>
                      }
                    </td>

                    {/* Conviction */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs ${CONVICTION_STYLE[s.conviction]}`}>{s.conviction}</span>
                    </td>

                    {/* Signal */}
                    <td className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed min-w-[220px]">
                      {s.keySignal}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Portfolio total footer */}
            {avgReturn !== null && (
              <tfoot>
                <tr className="bg-slate-800/80 border-t-2 border-slate-600">
                  <td colSpan={7} className="px-3 py-2.5 text-xs text-slate-400 font-semibold">
                    Equal-weight portfolio &nbsp;·&nbsp; {liveCount}/20 stocks with live data
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold text-sm tabular-nums
                    ${avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {avgReturn >= 0 ? '+' : ''}{fmt(avgReturn)}%
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="text-xs text-slate-600 space-y-1">
        <p>
          Entry prices = NSE/BSE closing prices on <span className="text-slate-500">July 31, 2026</span> (sourced from Yahoo Finance v8 chart API).
          <span className="text-emerald-700 ml-1">DHAN</span> badge = live price from Dhan market feed; others via Yahoo Finance.
        </p>
        <p>
          L.T. Elevator (BSE SME: 544518, LTELEVATOR.BO) is not NSE-listed — live prices unavailable;
          entry price Rs 279.50 is the Jul 31 BSE close.
          Target review: November 2026 (end of Q2 FY27).
        </p>
      </div>
    </main>
  );
}
