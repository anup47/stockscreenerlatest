'use client';
import { useState, useMemo } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import { useLivePrices }      from '@/app/hooks/useLivePrices';
import { useEffect }          from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tier       = 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP' | 'ANY';
type Conviction = 'HIGH' | 'MEDIUM-HIGH' | 'MEDIUM' | 'LOW-MED';
type SeptStance = 'ACCUMULATE' | 'WATCH' | 'MACRO' | 'RERATING';
type SortKey    = 'rank' | 'todayPct' | 'fromEntry';
type Tab        = 'aug26' | 'sep26';

interface AugStock {
  rank:       number;
  name:       string;
  symbol:     string;
  bse?:       true;
  tier:       Tier;
  mcap:       string;
  keySignal:  string;
  conviction: Conviction;
  entry:      number;
}

interface SeptStock {
  rank:       number;
  name:       string;
  symbol:     string;
  bse?:       true;
  tier:       Tier;
  mcap:       string;
  entryDate:  string;
  entry:      number;
  macroFill?: true;
  stale?:     true;
  keySignal:  string;
  stance:     SeptStance;
}

// ── Aug 2026 basket ────────────────────────────────────────────────────────────

const AUG_STOCKS: AugStock[] = [
  { rank:  1, name: 'MTAR Technologies',        symbol: 'MTARTECH',   tier: 'MIDCAP',   mcap: '16,782 Cr',    entry: 5726.00, keySignal: 'Q1 PAT +5x; guidance raised to 80%; Bloom Energy confirmed',         conviction: 'HIGH'        },
  { rank:  2, name: 'Muthoot Finance',           symbol: 'MUTHOOTFIN', tier: 'LARGECAP', mcap: '1,25,262 Cr',  entry: 3119.60, keySignal: 'PAT +43%, P/E 11.8x, gold AUM +44%; cheapest quality NBFC',          conviction: 'HIGH'        },
  { rank:  3, name: 'Emmvee Photovoltaic',       symbol: 'EMMVEE',     tier: 'MIDCAP',   mcap: '21,927 Cr',    entry:  317.60, keySignal: 'PAT +103%, order book 9.9 GW ATH; ALMM List II moat',                 conviction: 'HIGH'        },
  { rank:  4, name: 'Aeroflex Industries',       symbol: 'AEROFLEX',   tier: 'SMALLCAP', mcap: '~4,500 Cr',    entry:  435.45, keySignal: 'PAT +162%; liquid cooling 1,040 skids Q1; 9K→15K capacity Jul',        conviction: 'HIGH'        },
  { rank:  5, name: 'Laurus Labs',               symbol: 'LAURUSLABS', tier: 'LARGECAP', mcap: '96,245 Cr',    entry: 1816.20, keySignal: 'Q1 PAT +126%; CDMO 125 active projects; EBITDA margin record 31.8%',  conviction: 'HIGH'        },
  { rank:  6, name: 'Tatva Chintan Pharma',      symbol: 'TATVA',      tier: 'SMALLCAP', mcap: '~2,500 Cr',    entry: 1788.20, keySignal: 'PAT +140%, EBITDA 19.5%; Rs 200 Cr Dahej greenfield approved',         conviction: 'MEDIUM-HIGH' },
  { rank:  7, name: 'Genus Power',               symbol: 'GENUSPOWER', tier: 'MIDCAP',   mcap: '9,797 Cr',     entry:  312.70, keySignal: 'Rs 25,173 Cr order book (4x target); Q1 FY27 results Aug 5',           conviction: 'MEDIUM-HIGH' },
  { rank:  8, name: 'Ganesha Ecosphere',         symbol: 'GANECOS',    tier: 'MICROCAP', mcap: '~885 Cr',      entry: 1183.80, keySignal: 'India only FSSAI rPET mfr; EPR 40% mandate; Q1 call Aug 4',            conviction: 'MEDIUM-HIGH' },
  { rank:  9, name: 'Navin Fluorine',            symbol: 'NAVINFLUOR', tier: 'MIDCAP',   mcap: '~30,000 Cr',   entry: 7567.50, keySignal: 'AI cooling (Chemours) + HFO India-first (Honeywell); Q1 Aug 5',         conviction: 'MEDIUM-HIGH' },
  { rank: 10, name: 'Sobha Ltd',                 symbol: 'SOBHA',      tier: 'ANY',      mcap: '14,570 Cr',    entry: 1372.20, keySignal: 'Pre-sales +76% Q1; net cash achieved; luxury segment 42% of sales',    conviction: 'MEDIUM'      },
  { rank: 11, name: "Divi's Laboratories",       symbol: 'DIVISLAB',   tier: 'LARGECAP', mcap: '~1,20,000 Cr', entry: 8056.00, keySignal: 'Q1 PAT +65%; CDMO volume cycle maturing; quality compounder',          conviction: 'MEDIUM'      },
  { rank: 12, name: 'Syrma SGS Technology',      symbol: 'SYRMA',      tier: 'ANY',      mcap: '25,523 Cr',    entry: 1366.80, keySignal: 'Revenue +67%, PAT +112%; IND AA upgrade; ODM business expanding',      conviction: 'MEDIUM'      },
  { rank: 13, name: 'Venus Remedies',            symbol: 'VENUSREM',   tier: 'SMALLCAP', mcap: '2,101 Cr',     entry: 1581.60, keySignal: 'Q1 PAT +139%, Revenue +30%; hospital critical care export ramp',        conviction: 'MEDIUM'      },
  { rank: 14, name: 'DEE Development Engineers', symbol: 'DEEDEV',     tier: 'MICROCAP', mcap: '~850 Cr',      entry:  678.55, keySignal: 'India largest process piping; HRSG US$15.27M/yr contract Jun 2027',     conviction: 'MEDIUM'      },
  { rank: 15, name: 'HBL Engineering',           symbol: 'HBLENGINE',  tier: 'SMALLCAP', mcap: '~6,000 Cr',    entry:  718.70, keySignal: 'Kavach Rs 1,522 Cr + IAF smart bomb order Jul 2026',                   conviction: 'MEDIUM'      },
  { rank: 16, name: 'Bajaj Finance',             symbol: 'BAJFINANCE', tier: 'LARGECAP', mcap: '~4,80,000 Cr', entry: 1141.20, keySignal: 'Q1 PAT +29%, AUM +24%; 52W high; asset quality improving',              conviction: 'MEDIUM'      },
  { rank: 17, name: 'Data Patterns India',       symbol: 'DATAPATTNS', tier: 'ANY',      mcap: '~7,000 Cr',    entry: 4281.00, keySignal: 'L1 Rs 1,300 Cr HAL deal pending; contrarian buy post -8% dip',          conviction: 'MEDIUM'      },
  { rank: 18, name: 'L.T. Elevator',             symbol: 'LTELEVATOR', tier: 'MICROCAP', mcap: '~380 Cr',      entry:  279.50, bse: true,  keySignal: 'India only listed elevator; mfg facility bhoomi pujan Jul 13', conviction: 'LOW-MED'  },
  { rank: 19, name: 'Senco Gold',                symbol: 'SENCO',      tier: 'ANY',      mcap: '~3,500 Cr',    entry:  403.20, keySignal: 'Revenue +60%, SSSG +38%; festive season tailwind Q2-Q3 FY27',           conviction: 'LOW-MED'     },
  { rank: 20, name: 'Vintage Coffee',            symbol: 'VINCOFE',    tier: 'MICROCAP', mcap: '~750 Cr',      entry:  149.48, keySignal: 'FDC Rs 480 Cr plant (FY28); B2B instant coffee export structural play', conviction: 'LOW-MED'     },
];

// ── Sep 2026 basket (Scuttlebutt Run — Sep 13, 2026) ─────────────────────────

const SEPT_STOCKS: SeptStock[] = [
  // Large Cap
  { rank:  1, name: 'Bajaj Finserv',           symbol: 'BAJAJFINSV', tier: 'LARGECAP', mcap: '~2.5L Cr',     entryDate: 'Aug 9',  entry: 2009.00,   keySignal: 'BFL stake (Rs 3.66L Cr) alone exceeds own mkt cap; insurance subs at ~zero value in price', stance: 'ACCUMULATE' },
  { rank:  2, name: 'Hindalco Industries',      symbol: 'HINDALCO',   tier: 'LARGECAP', mcap: '~90,000 Cr',   entryDate: 'Jun',    entry: 1010.00,   keySignal: 'Bay Minette peak capex passed; India alumina EBITDA/t at ATH',                            stance: 'ACCUMULATE' },
  { rank:  3, name: 'Oil India',               symbol: 'OIL',        tier: 'LARGECAP', mcap: '~55,000 Cr',   entryDate: 'Aug 10', entry:  453.00,   keySignal: 'NRL refinery tripling to 9 MMTPA; reserve replacement ratio >1.5x',                       stance: 'ACCUMULATE' },
  { rank:  4, name: 'Maruti Suzuki',           symbol: 'MARUTI',     tier: 'LARGECAP', mcap: '~3.8L Cr',     entryDate: '—',      entry:    0,      macroFill: true, keySignal: 'GST 2.0 auto beneficiary (28%→18% on small cars/2W); festive volume tailwind — macro theme, not deep-dive', stance: 'MACRO' },
  { rank:  5, name: 'Britannia Industries',    symbol: 'BRITANNIA',  tier: 'LARGECAP', mcap: '~62,000 Cr',   entryDate: '—',      entry:    0,      macroFill: true, keySignal: 'Named Nomura GST-cut FMCG beneficiary; festive pricing multiplier on volumes — macro theme, not deep-dive', stance: 'MACRO' },
  // Mid Cap
  { rank:  6, name: 'APL Apollo Tubes',        symbol: 'APLAPOLLO',  tier: 'MIDCAP',   mcap: '~26,000 Cr',   entryDate: 'Aug 3',  entry: 1944.00,   keySignal: 'Record EBITDA/t (Rs 5,522 Q1FY27); dual AA+ rating; 8 MTPA capacity path by FY28',       stance: 'ACCUMULATE' },
  { rank:  7, name: 'Delhivery',               symbol: 'DELHIVERY',  tier: 'MIDCAP',   mcap: '~34,000 Cr',   entryDate: 'Aug 11', entry:  473.00,   keySignal: 'Ecom Express integration complete; Rs 4,555 Cr net cash; no negative news found for the drop', stance: 'ACCUMULATE' },
  { rank:  8, name: 'Himadri Speciality',      symbol: 'HIMADRI',    tier: 'MIDCAP',   mcap: '~29,000 Cr',   entryDate: 'Jul 3',  entry:  662.65,   stale: true, keySignal: "India's first anode plant commissioned; LFP cathode Q3 FY27 milestone pending",  stance: 'WATCH'      },
  { rank:  9, name: 'Endurance Technologies',  symbol: 'ENDURANCE',  tier: 'MIDCAP',   mcap: '~42,000 Cr',   entryDate: 'Jun',    entry: 2477.80,   stale: true, keySignal: 'EV battery-pack SOP (Jun 2026) ramping; 4-vertical autocomponent moat',          stance: 'ACCUMULATE' },
  { rank: 10, name: 'Emmvee Photovoltaic',     symbol: 'EMMVEE',     tier: 'MIDCAP',   mcap: '~21,000 Cr',   entryDate: 'Aug 3',  entry:  325.00,   stale: true, keySignal: 'Only large-scale India TOPCon cell line; Q1 FY27 record 35.2% EBITDA margin',   stance: 'ACCUMULATE' },
  // Small Cap
  { rank: 11, name: 'ASM Technologies',        symbol: 'ASMTECHN',   tier: 'SMALLCAP', mcap: '~6,500 Cr',    entryDate: 'Sep 3',  entry: 4574.00,   keySignal: 'Rs 526 Cr preferential issue to SBI MF + Damani entity + Mukul Agrawal wife; EGM Oct 4 — re-rating already in price (+49% in 6 sessions)', stance: 'RERATING' },
  { rank: 12, name: 'Gravita India',           symbol: 'GRAVITA',    tier: 'SMALLCAP', mcap: '~20,000 Cr',   entryDate: 'Jul',    entry: 1855.00,   keySignal: 'RMIL copper acquisition scaling to 60,000 MTPA; ICRA upgraded to AA in June',           stance: 'ACCUMULATE' },
  { rank: 13, name: 'Inox India',              symbol: 'INOXINDIA',  tier: 'SMALLCAP', mcap: '~6,800 Cr',    entryDate: 'Sep 1',  entry: 2183.00,   stale: true, keySignal: 'Record order book; investor/analyst meet held Sep 11 — outcome not yet public', stance: 'ACCUMULATE' },
  { rank: 14, name: 'RPEL',                    symbol: 'RPEL',       tier: 'SMALLCAP', mcap: '—',            entryDate: '—',      entry: 1748.00,   stale: true, keySignal: 'New Nippon-Steel-lineage JV (Sep 4); own capacity 414K→534K MTPA from Oct 1',   stance: 'WATCH'      },
  { rank: 15, name: 'Sunflag Iron & Steel',    symbol: 'SUNFLAG',    tier: 'SMALLCAP', mcap: '~6,652 Cr',    entryDate: 'Sep 2',  entry:  369.00,   stale: true, keySignal: "Lloyds Metals stake (Rs 10,860 Cr) alone exceeds Sunflag's own Rs 6,652 Cr mkt cap", stance: 'ACCUMULATE' },
  // Micro Cap
  { rank: 16, name: 'Devson Catalyst',         symbol: 'DEVSON',     tier: 'MICROCAP', mcap: '~350 Cr',      entryDate: 'Aug 11', entry:  236.60,   stale: true, keySignal: "India's only listed catalyst/adsorbent maker; new plant doubles capacity by H1 FY28", stance: 'ACCUMULATE' },
  { rank: 17, name: 'Yasho Industries',        symbol: 'YASHO',      tier: 'MICROCAP', mcap: '~1,200 Cr',    entryDate: 'Sep 5',  entry: 4129.00,   stale: true, keySignal: '15-year, Rs 150 Cr/yr MNC supply deal; Q1 FY27 EBITDA jumped to 24.2%',        stance: 'ACCUMULATE' },
  { rank: 18, name: 'Krishna Defence',         symbol: 'KRISHNADEF', tier: 'MICROCAP', mcap: '~900 Cr',      entryDate: 'Jul',    entry: 1280.00,   bse: true,   keySignal: 'Sole naval bulb-bar manufacturer; Jalkapi XLUUV (India\'s first) delivery ~Dec 2026', stance: 'WATCH' },
  { rank: 19, name: 'Monolithisch India',      symbol: 'MONOLITHIS', tier: 'MICROCAP', mcap: '—',            entryDate: 'Aug',    entry: 1226.00,   bse: true,   keySignal: 'New 575,000 MTPA ramming-mass unit commissioning Sep 2026',                    stance: 'WATCH'      },
  { rank: 20, name: 'CMS Info Systems',        symbol: 'CMSINFO',    tier: 'MICROCAP', mcap: '~13,000 Cr',   entryDate: 'Sep 4',  entry:  242.00,   keySignal: "India's #1 outsourced ATM operator; new 10-yr, Rs 1,000 Cr SBI contract",           stance: 'ACCUMULATE' },
];

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

const SEPT_STANCE_STYLE: Record<SeptStance, string> = {
  ACCUMULATE: 'text-emerald-400 font-bold',
  WATCH:      'text-amber-400 font-semibold',
  MACRO:      'text-sky-400',
  RERATING:   'text-purple-400 font-bold',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pct(ltp: number, entry: number) {
  if (!entry || !ltp) return null;
  return ((ltp - entry) / entry) * 100;
}

// ── Dhan equity prices hook ───────────────────────────────────────────────────

interface DhanEqQ { ltp: number; changePct: number; }

function useDhanEquityPrices(
  symbols: string[],
  isConfigured: boolean,
  headers: Record<string, string>,
): Map<string, DhanEqQ> {
  const [prices, setPrices] = useState<Map<string, DhanEqQ>>(new Map());
  const symKey = [...symbols].sort().join(',');

  useEffect(() => {
    if (!isConfigured || !symKey) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/dhan/equity-prices?symbols=${encodeURIComponent(symKey)}`,
          { headers, cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json() as { quotes?: Record<string, DhanEqQ> };
        if (!cancelled) setPrices(new Map(Object.entries(json.quotes ?? {})));
      } catch { /* silent */ }
    }

    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [symKey, isConfigured, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  return prices;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScuttlebuttPage() {
  const [activeTab, setActiveTab] = useState<Tab>('aug26');

  // Collect all NSE symbols from both baskets (deduplicated)
  const allNseSymbols = useMemo(() => {
    const aug  = AUG_STOCKS.filter(s => !s.bse).map(s => s.symbol);
    const sep  = SEPT_STOCKS.filter(s => !s.bse && !s.macroFill).map(s => s.symbol);
    return [...new Set([...aug, ...sep])];
  }, []);

  const creds      = useDhanCredentials();
  const dhanPrices = useDhanEquityPrices(allNseSymbols, creds.isConfigured, creds.headers);
  const yahooPrices = useLivePrices(allNseSymbols);

  // Merge: Dhan preferred, Yahoo fallback per symbol
  const liveMap = useMemo(() => {
    const m = new Map<string, { ltp: number; changePct: number }>();
    for (const [sym, q] of yahooPrices) m.set(sym, { ltp: q.price, changePct: q.changePct });
    for (const [sym, q] of dhanPrices)  if (q.ltp > 0) m.set(sym, { ltp: q.ltp, changePct: q.changePct });
    return m;
  }, [yahooPrices, dhanPrices]);

  // Sort state
  const [sortBy, setSortBy] = useState<SortKey>('rank');
  const [asc, setAsc]       = useState(true);

  function handleSort(key: SortKey) {
    if (sortBy === key) { setAsc(a => !a); return; }
    setSortBy(key);
    setAsc(key === 'rank');
  }

  // Sorted Aug stocks
  const sortedAug = useMemo(() => [...AUG_STOCKS].sort((a, b) => {
    if (sortBy === 'rank')      return asc ? a.rank - b.rank : b.rank - a.rank;
    if (sortBy === 'todayPct') {
      const va = liveMap.get(a.symbol)?.changePct ?? -999;
      const vb = liveMap.get(b.symbol)?.changePct ?? -999;
      return asc ? va - vb : vb - va;
    }
    const va = pct(liveMap.get(a.symbol)?.ltp ?? 0, a.entry) ?? -999;
    const vb = pct(liveMap.get(b.symbol)?.ltp ?? 0, b.entry) ?? -999;
    return asc ? va - vb : vb - va;
  }), [sortBy, asc, liveMap]);

  // Sorted Sep stocks
  const sortedSep = useMemo(() => [...SEPT_STOCKS].sort((a, b) => {
    if (sortBy === 'rank')      return asc ? a.rank - b.rank : b.rank - a.rank;
    if (sortBy === 'todayPct') {
      const va = liveMap.get(a.symbol)?.changePct ?? -999;
      const vb = liveMap.get(b.symbol)?.changePct ?? -999;
      return asc ? va - vb : vb - va;
    }
    const va = (a.macroFill || a.bse) ? -999 : (pct(liveMap.get(a.symbol)?.ltp ?? 0, a.entry) ?? -999);
    const vb = (b.macroFill || b.bse) ? -999 : (pct(liveMap.get(b.symbol)?.ltp ?? 0, b.entry) ?? -999);
    return asc ? va - vb : vb - va;
  }), [sortBy, asc, liveMap]);

  // Aug portfolio summary
  const augSummary = useMemo(() => {
    let g = 0, l = 0, total = 0, count = 0;
    for (const s of AUG_STOCKS) {
      const ltp = s.bse ? 0 : (liveMap.get(s.symbol)?.ltp ?? 0);
      if (!ltp) continue;
      count++;
      const r = pct(ltp, s.entry)!;
      total += r;
      if (r >= 0) g++; else l++;
    }
    return { count, gainers: g, losers: l, avg: count > 0 ? total / count : null };
  }, [liveMap]);

  // Sep portfolio summary (skip macroFill and bse)
  const sepSummary = useMemo(() => {
    let g = 0, l = 0, total = 0, count = 0;
    for (const s of SEPT_STOCKS) {
      if (s.macroFill || s.bse) continue;
      const ltp = liveMap.get(s.symbol)?.ltp ?? 0;
      if (!ltp) continue;
      count++;
      const r = pct(ltp, s.entry)!;
      total += r;
      if (r >= 0) g++; else l++;
    }
    return { count, gainers: g, losers: l, avg: count > 0 ? total / count : null };
  }, [liveMap]);

  const priceSource = creds.isConfigured
    ? `Dhan${dhanPrices.size > 0 ? ` (${dhanPrices.size}/${allNseSymbols.length})` : ''} + Yahoo`
    : 'Yahoo Finance';

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

  const summary = activeTab === 'aug26' ? augSummary : sepSummary;

  return (
    <main className="w-full px-4 py-5 space-y-5">

      {/* Tab selector */}
      <div className="flex items-center gap-1 border-b border-slate-700 pb-0">
        {([['aug26', 'Aug 2026'], ['sep26', 'Sep 2026']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSortBy('rank'); setAsc(true); }}
            className={[
              'px-4 py-2 text-sm font-semibold rounded-t transition-colors -mb-px border border-b-0',
              activeTab === id
                ? 'bg-slate-800 border-slate-700 text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-300',
            ].join(' ')}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Aug 2026 Header ── */}
      {activeTab === 'aug26' && (
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Scuttlebutt Run</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-mono">Aug 2026</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">20-Stock Equal-Weight Portfolio</h1>
            <p className="text-slate-400 text-sm mt-1">
              Entry = <span className="text-emerald-400 font-medium">31 Jul 2026 closing prices</span>
              &nbsp;·&nbsp; 5% per stock &nbsp;·&nbsp; Review: Q2 FY27 (Nov 2026)
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 shrink-0 space-y-0.5 pt-1">
            <div>Live: <span className={creds.isConfigured ? 'text-emerald-400' : 'text-amber-400'}>{priceSource}</span><span className="text-slate-600"> · 30s</span></div>
            <div>Entry: <span className="text-slate-300">31 Jul 2026 close (fixed)</span></div>
          </div>
        </div>
      )}

      {/* ── Sep 2026 Header ── */}
      {activeTab === 'sep26' && (
        <div className="space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Scuttlebutt Run</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-mono">Sep 2026</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-[10px] text-amber-400 font-mono">Data: Sep 13, 2026</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100">20-Stock Scuttlebutt Basket</h1>
              <p className="text-slate-400 text-sm mt-1">
                4 Cap Tiers · 5 names each &nbsp;·&nbsp; Entry prices vary per stock
              </p>
            </div>
            <div className="flex gap-3">
              <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-emerald-500 font-bold uppercase tracking-wide mb-0.5">Top Mover</div>
                <div className="text-sm font-bold text-emerald-400">ASM Tech</div>
                <div className="text-xs text-emerald-300">+58.5% · 6 sessions</div>
              </div>
              <div className="bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-red-500 font-bold uppercase tracking-wide mb-0.5">Weak Spot</div>
                <div className="text-sm font-bold text-red-400">Bajaj Finserv</div>
                <div className="text-xs text-red-300">-11.2% since entry</div>
              </div>
            </div>
          </div>
          {/* Basket read */}
          <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg px-4 py-3">
            <span className="text-amber-400 text-xs font-bold uppercase tracking-wide">Basket Read · </span>
            <span className="text-slate-300 text-sm">Constructive but not uniformly bullish — a standout smart-money-backed re-rating (ASM Technologies) offsets financial-services softness (Bajaj twins) and broad mid/small-cap profit-taking (Gravita, Delhivery). </span>
            <span className="text-amber-500 text-xs">8 of 20 names have stale prices (marked below).</span>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Stocks',       v: '20',      c: 'text-slate-100' },
          { label: activeTab === 'aug26' ? 'Equal Weight' : 'Cap Tiers', v: activeTab === 'aug26' ? '5% each' : '4 × 5',  c: 'text-slate-100' },
          {
            label: 'Avg Return',
            v: summary.avg !== null ? `${summary.avg >= 0 ? '+' : ''}${fmt(summary.avg)}%` : `-- (${summary.count}/20)`,
            c: summary.avg === null ? 'text-slate-500' : summary.avg >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
          { label: 'Gainers', v: String(summary.gainers), c: summary.gainers > 0 ? 'text-emerald-400' : 'text-slate-500' },
          { label: 'Losers',  v: String(summary.losers),  c: summary.losers  > 0 ? 'text-red-400'     : 'text-slate-500' },
        ].map(({ label, v, c }) => (
          <div key={label} className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center">
            <div className={`text-xl font-bold font-mono ${c}`}>{v}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Tier legend */}
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.entries(TIER_STYLE) as [Tier, string][])
          .filter(([t]) => activeTab === 'aug26' || t !== 'ANY')
          .map(([tier, style]) => (
            <span key={tier} className={`px-2 py-0.5 rounded text-[10px] font-bold ${style}`}>{tier}</span>
          ))}
        {activeTab === 'aug26' && (
          <span className="text-xs text-slate-600 ml-1">· ANY = wildcard from any cap tier</span>
        )}
        {activeTab === 'sep26' && (
          <>
            {(['ACCUMULATE', 'WATCH', 'MACRO', 'RERATING'] as SeptStance[]).map(s => (
              <span key={s} className={`px-2 py-0.5 rounded text-[10px] font-bold ${SEPT_STANCE_STYLE[s]} bg-slate-800 border border-slate-700`}>{s}</span>
            ))}
          </>
        )}
      </div>

      {/* Dhan notice */}
      {creds.isHydrated && !creds.isConfigured && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded px-3 py-2 text-amber-300 text-sm">
          Dhan not configured — live prices via Yahoo Finance.{' '}
          <a href="/settings" className="underline hover:text-amber-200">Configure in Settings</a> for Dhan market feed.
        </div>
      )}

      {/* ── Aug 2026 Table ── */}
      {activeTab === 'aug26' && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1080px]">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <SortTh col="rank"     label="#"            right={false} />
                  <th className="px-3 py-2.5 text-left   text-slate-500 text-xs uppercase tracking-wide">Company</th>
                  <th className="px-3 py-2.5 text-center text-slate-500 text-xs uppercase tracking-wide">Tier</th>
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
                {sortedAug.map((s, idx) => {
                  const q        = s.bse ? null : liveMap.get(s.symbol);
                  const ltp      = q?.ltp ?? 0;
                  const todayPct = q?.changePct ?? null;
                  const feRet    = ltp > 0 ? pct(ltp, s.entry) : null;
                  const rowBg    = idx % 2 === 1 ? 'bg-slate-900/40' : '';
                  const isDhan   = !s.bse && dhanPrices.has(s.symbol);
                  return (
                    <tr key={s.symbol} className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${rowBg}`}>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{s.rank}</td>
                      <td className="px-3 py-2.5 min-w-[180px]">
                        <div className="font-semibold text-slate-100 text-sm">{s.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-500 font-mono">{s.symbol}</span>
                          {s.bse  && <span className="text-[9px] px-1 rounded bg-slate-700 text-slate-400 border border-slate-600 font-bold">BSE SME</span>}
                          {isDhan && <span className="text-[9px] px-1 rounded bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 font-bold">DHAN</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{s.mcap}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">{fmt(s.entry)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {s.bse ? <span className="text-slate-600 text-xs">BSE only</span>
                          : ltp > 0 ? <span className="text-slate-100">{fmt(ltp)}</span>
                          : <span className="text-slate-600 text-xs animate-pulse">loading</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {todayPct !== null
                          ? <span className={todayPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{todayPct >= 0 ? '+' : ''}{fmt(todayPct)}%</span>
                          : <span className="text-slate-600 text-xs">--</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {feRet !== null
                          ? <span className={`font-bold ${feRet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{feRet >= 0 ? '+' : ''}{fmt(feRet)}%</span>
                          : <span className="text-slate-600 text-xs">--</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs ${CONVICTION_STYLE[s.conviction]}`}>{s.conviction}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed min-w-[220px]">{s.keySignal}</td>
                    </tr>
                  );
                })}
              </tbody>
              {augSummary.avg !== null && (
                <tfoot>
                  <tr className="bg-slate-800/80 border-t-2 border-slate-600">
                    <td colSpan={7} className="px-3 py-2.5 text-xs text-slate-400 font-semibold">
                      Equal-weight avg &nbsp;·&nbsp; {augSummary.count}/19 NSE stocks with live data
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold text-sm tabular-nums ${augSummary.avg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {augSummary.avg >= 0 ? '+' : ''}{fmt(augSummary.avg)}%
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Sep 2026 Table ── */}
      {activeTab === 'sep26' && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <SortTh col="rank"     label="#"            right={false} />
                  <th className="px-3 py-2.5 text-left   text-slate-500 text-xs uppercase tracking-wide">Company</th>
                  <th className="px-3 py-2.5 text-center text-slate-500 text-xs uppercase tracking-wide">Tier</th>
                  <th className="px-3 py-2.5 text-right  text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">MCap</th>
                  <th className="px-3 py-2.5 text-right  text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Entry Rs</th>
                  <th className="px-3 py-2.5 text-right  text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">LTP Rs</th>
                  <SortTh col="todayPct"  label="Today %" />
                  <SortTh col="fromEntry" label="From Entry %" />
                  <th className="px-3 py-2.5 text-left   text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Stance</th>
                  <th className="px-3 py-2.5 text-left   text-slate-500 text-xs uppercase tracking-wide">Signal / Thesis</th>
                </tr>
              </thead>
              <tbody>
                {sortedSep.map((s, idx) => {
                  const q        = (s.bse || s.macroFill) ? null : liveMap.get(s.symbol);
                  const ltp      = q?.ltp ?? 0;
                  const todayPct = q?.changePct ?? null;
                  const feRet    = (!s.macroFill && !s.bse && ltp > 0) ? pct(ltp, s.entry) : null;
                  const rowBg    = idx % 2 === 1 ? 'bg-slate-900/40' : '';
                  const isDhan   = !s.bse && !s.macroFill && dhanPrices.has(s.symbol);

                  return (
                    <tr key={`${s.symbol}-${s.rank}`} className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${rowBg}`}>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{s.rank}</td>
                      <td className="px-3 py-2.5 min-w-[180px]">
                        <div className="font-semibold text-slate-100 text-sm">{s.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-slate-500 font-mono">{s.symbol}</span>
                          {s.bse      && <span className="text-[9px] px-1 rounded bg-slate-700 text-slate-400 border border-slate-600 font-bold">BSE</span>}
                          {s.stale    && <span className="text-[9px] px-1 rounded bg-amber-900/50 text-amber-400 border border-amber-700/50 font-bold">STALE</span>}
                          {s.macroFill && <span className="text-[9px] px-1 rounded bg-sky-900/50 text-sky-400 border border-sky-700/50 font-bold">MACRO FILL</span>}
                          {isDhan     && <span className="text-[9px] px-1 rounded bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 font-bold">DHAN</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{s.mcap}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {s.macroFill
                          ? <span className="text-slate-600 text-xs">macro</span>
                          : <div>
                              <div className="text-slate-300">{fmt(s.entry)}</div>
                              <div className="text-[10px] text-slate-600">{s.entryDate}</div>
                            </div>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {s.bse ? <span className="text-slate-600 text-xs">BSE only</span>
                          : ltp > 0 ? <span className="text-slate-100">{fmt(ltp)}</span>
                          : <span className="text-slate-600 text-xs animate-pulse">loading</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {todayPct !== null
                          ? <span className={todayPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{todayPct >= 0 ? '+' : ''}{fmt(todayPct)}%</span>
                          : <span className="text-slate-600 text-xs">--</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {feRet !== null
                          ? <span className={`font-bold ${feRet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{feRet >= 0 ? '+' : ''}{fmt(feRet)}%</span>
                          : <span className="text-slate-600 text-xs">--</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs ${SEPT_STANCE_STYLE[s.stance]}`}>{s.stance}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed min-w-[220px]">{s.keySignal}</td>
                    </tr>
                  );
                })}
              </tbody>
              {sepSummary.avg !== null && (
                <tfoot>
                  <tr className="bg-slate-800/80 border-t-2 border-slate-600">
                    <td colSpan={7} className="px-3 py-2.5 text-xs text-slate-400 font-semibold">
                      Equal-weight avg (excl. macro fills & BSE) &nbsp;·&nbsp; {sepSummary.count} stocks with live data
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold text-sm tabular-nums ${sepSummary.avg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {sepSummary.avg >= 0 ? '+' : ''}{fmt(sepSummary.avg)}%
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-slate-600 space-y-0.5">
        {activeTab === 'aug26' && (
          <>
            <p>Entry = NSE/BSE closing prices on <span className="text-slate-500">31 Jul 2026</span> (sourced from Yahoo Finance chart API). Static — no fetch required.</p>
            <p>L.T. Elevator (BSE SME 544518) is not NSE-listed; live price unavailable. Entry Rs 279.50 = Jul 31 BSE close.</p>
          </>
        )}
        {activeTab === 'sep26' && (
          <>
            <p>Data as of <span className="text-slate-500">Sep 13, 2026</span> (Scuttlebutt Research run). Entry prices vary per stock — see entry date column.</p>
            <p>STALE = price could not be sourced this week; last-confirmed price used. MACRO FILL = macro-theme picks with no defined entry price.</p>
            <p>Krishna Defence & Monolithisch India are BSE-listed micro-caps; live price unavailable via this feed.</p>
          </>
        )}
      </div>
    </main>
  );
}
