'use client';
import { useState, useEffect, useMemo } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import { useLivePrices }      from '@/app/hooks/useLivePrices';
import type { ScuttlebuttBasket, BasketStock } from '@/app/api/scuttlebutt/route';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tier       = 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP' | 'ANY';
type Conviction = 'HIGH' | 'MEDIUM-HIGH' | 'MEDIUM' | 'LOW-MED';
type SeptStance = 'ACCUMULATE' | 'WATCH' | 'MACRO' | 'RERATING';
type SortKey    = 'rank' | 'todayPct' | 'fromEntry';

interface AugStock {
  rank: number; name: string; symbol: string; bse?: true;
  tier: Tier; mcap: string; keySignal: string; conviction: Conviction; entry: number;
}

// ── Aug 2026 basket (hardcoded, static) ───────────────────────────────────────

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

// ── Sep 2026 basket (hardcoded from PDF; API sync replaces this once uploaded) ─

const SEP26_BASKET: ScuttlebuttBasket = {
  id:         'sep2026',
  fileName:   'ScuttlebuttBasket_Research_September2026.pdf',
  runDate:    '2026-09-13',
  basketName: 'Sep 2026',
  basketRead: 'Basket tilted toward domestic cyclicals and quality mid/small caps. Top mover: ASM Technologies (+58.5% rerating underway). Watchlist caution on Bajaj Finserv (-11.2%). Macro fills: Maruti (auto recovery) + Britannia (rural FMCG revival). Several stale entries pending price refresh.',
  topMover:   { name: 'ASM Technologies', pct: 58.5 },
  weakSpot:   { name: 'Bajaj Finserv', pct: -11.2 },
  stocks: [
    // LARGECAP
    { rank: 1,  name: 'Bajaj Finserv',       symbol: 'BAJAJFINSV', tier: 'LARGECAP', entryDate: 'Aug 9',  entry: 2009.00, macroFill: false, stale: false, keySignal: 'Insurance + AMC dual engine; BAGIC loss ratio improved; re-entry after -11.2% correction', stance: 'ACCUMULATE' },
    { rank: 2,  name: 'Hindalco Industries', symbol: 'HINDALCO',   tier: 'LARGECAP', entryDate: 'Jun',    entry: 1010.00, macroFill: false, stale: false, keySignal: 'Novelis EBITDA/t expanding; aluminium deficit deepening; China export tax removes overhang', stance: 'ACCUMULATE' },
    { rank: 3,  name: 'Oil India',           symbol: 'OIL',        tier: 'LARGECAP', entryDate: 'Aug 10', entry:  453.00, macroFill: false, stale: false, keySignal: 'Upstream PSU; high dividend yield; Numaligarh refinery ramp; gas monetisation optionality', stance: 'ACCUMULATE' },
    { rank: 4,  name: 'Maruti Suzuki',       symbol: 'MARUTI',     tier: 'LARGECAP', entryDate: '—',      entry:    0.00, macroFill: true,  stale: false, keySignal: 'Auto recovery; rural demand revival + EV optionality (e-Vitara FY26 launch)',               stance: 'MACRO'      },
    { rank: 5,  name: 'Britannia Industries',symbol: 'BRITANNIA',  tier: 'LARGECAP', entryDate: '—',      entry:    0.00, macroFill: true,  stale: false, keySignal: 'Rural FMCG revival; volume-led growth; margin stability; steady compounder at scale',       stance: 'MACRO'      },
    // MIDCAP
    { rank: 6,  name: 'APL Apollo Tubes',    symbol: 'APLAPOLLO',  tier: 'MIDCAP',   entryDate: 'Aug 3',  entry: 1944.00, macroFill: false, stale: false, keySignal: 'Structural steel demand; capacity 5→10 MTPA; export ramp; direct-forming moat', stance: 'ACCUMULATE' },
    { rank: 7,  name: 'Delhivery',           symbol: 'DELHIVERY',  tier: 'MIDCAP',   entryDate: 'Aug 11', entry:  473.00, macroFill: false, stale: false, keySignal: 'Q1 EBITDA breakeven achieved; market share gains from Xpressbees; network leverage', stance: 'ACCUMULATE' },
    { rank: 8,  name: 'Himadri Speciality',  symbol: 'HIMADRI',    tier: 'MIDCAP',   entryDate: 'Jul 3',  entry:  662.65, macroFill: false, stale: true,  keySignal: 'Carbon black + anode material (EV battery) pivot; margins expanding; re-rating candidate', stance: 'WATCH'      },
    { rank: 9,  name: 'Endurance Technologies', symbol: 'ENDURANCE',tier: 'MIDCAP',  entryDate: 'Jun',    entry: 2477.80, macroFill: false, stale: true,  keySignal: 'Auto ancillary; EV exposure via braking/casting; Europe ops turning; quality franchise', stance: 'ACCUMULATE' },
    { rank: 10, name: 'Emmvee Photovoltaic', symbol: 'EMMVEE',     tier: 'MIDCAP',   entryDate: 'Aug 3',  entry:  325.00, macroFill: false, stale: true,  keySignal: 'ALMM List II moat; 9.9 GW order book; PAT +103% YoY; domestic solar manufacturing play', stance: 'ACCUMULATE' },
    // SMALLCAP
    { rank: 11, name: 'ASM Technologies',    symbol: 'ASMTECHN',   tier: 'SMALLCAP', entryDate: 'Sep 3',  entry: 4574.00, macroFill: false, stale: false, keySignal: 'Aerospace PCB + VLSI design; US defence + semiconductor clients; +58.5% rerating in motion', stance: 'RERATING'   },
    { rank: 12, name: 'Gravita India',       symbol: 'GRAVITA',    tier: 'SMALLCAP', entryDate: 'Jul',    entry: 1855.00, macroFill: false, stale: false, keySignal: 'Lead recycling monopoly; battery scrap volumes rising; ESG premium valuation unlocking', stance: 'ACCUMULATE' },
    { rank: 13, name: 'Inox India',          symbol: 'INOXINDIA',  tier: 'SMALLCAP', entryDate: 'Sep 1',  entry: 2183.00, macroFill: false, stale: true,  keySignal: 'Industrial gas cylinder + cryo equipment; LNG truck + hospital O2 demand structural', stance: 'ACCUMULATE' },
    { rank: 14, name: 'RPEL',               symbol: 'RPEL',       tier: 'SMALLCAP', entryDate: '—',      entry: 1748.00, macroFill: false, stale: true,  keySignal: 'Watching for confirmation; entry level under review', stance: 'WATCH'      },
    { rank: 15, name: 'Sunflag Iron & Steel',symbol: 'SUNFLAG',    tier: 'SMALLCAP', entryDate: 'Sep 2',  entry:  369.00, macroFill: false, stale: true,  keySignal: 'Specialty steel; alloy steel demand from auto + defence; debt-light balance sheet', stance: 'ACCUMULATE' },
    // MICROCAP
    { rank: 16, name: 'Devson Pharma',       symbol: 'DEVSON',     tier: 'MICROCAP', entryDate: 'Aug 11', entry:  236.60, macroFill: false, stale: true,  keySignal: 'API manufacturer; domestic formulation ramp; small but EBITDA positive inflection', stance: 'ACCUMULATE' },
    { rank: 17, name: 'Yasho Industries',    symbol: 'YASHO',      tier: 'MICROCAP', entryDate: 'Sep 5',  entry: 4129.00, macroFill: false, stale: true,  keySignal: 'Rubber chemicals + FMCG fragrance; specialty chem re-rating; founder-led, debt-free', stance: 'ACCUMULATE' },
    { rank: 18, name: 'Krishna Defence',     symbol: 'KRISHNADEF', tier: 'MICROCAP', entryDate: 'Jul',    entry: 1280.00, macroFill: false, stale: false, keySignal: 'Naval systems; submarine sonar + torpedo decoys; classified contract visibility', stance: 'WATCH',      bse: true },
    { rank: 19, name: 'Monolithis',          symbol: 'MONOLITHIS', tier: 'MICROCAP', entryDate: 'Aug',    entry: 1226.00, macroFill: false, stale: false, keySignal: 'Refractory products; steel sector demand driven; niche high-margin specialty play', stance: 'WATCH',      bse: true },
    { rank: 20, name: 'CMS Info Systems',    symbol: 'CMSINFO',    tier: 'MICROCAP', entryDate: 'Sep 4',  entry:  242.00, macroFill: false, stale: false, keySignal: 'Cash logistics + ATM outsourcing; digital payment paradox winner; recurring cash flows', stance: 'ACCUMULATE' },
  ],
};

// ── Style maps ────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<string, string> = {
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

const STANCE_STYLE: Record<SeptStance, string> = {
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
  symbols: string[], isConfigured: boolean, headers: Record<string, string>,
): Map<string, DhanEqQ> {
  const [prices, setPrices] = useState<Map<string, DhanEqQ>>(new Map());
  const symKey = [...symbols].sort().join(',');

  useEffect(() => {
    if (!isConfigured || !symKey) return;
    let cancelled = false;
    async function load() {
      try {
        const res  = await fetch(`/api/dhan/equity-prices?symbols=${encodeURIComponent(symKey)}`, { headers, cache: 'no-store' });
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
  // Dynamic baskets from OneDrive sync
  const [apiBaskets, setApiBaskets] = useState<ScuttlebuttBasket[]>([]);
  const [apiLoaded,  setApiLoaded]  = useState(false);
  const [syncState,  setSyncState]  = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [syncLog,    setSyncLog]    = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/scuttlebutt')
      .then(r => r.json())
      .then((d: { baskets?: ScuttlebuttBasket[] }) => { setApiBaskets(d.baskets ?? []); setApiLoaded(true); })
      .catch(() => setApiLoaded(true));
  }, []);

  async function handleSync() {
    setSyncState('syncing');
    setSyncLog([]);
    try {
      const res  = await fetch('/api/scuttlebutt', { method: 'POST' });
      const data = await res.json() as { synced?: number; results?: string[]; baskets?: ScuttlebuttBasket[]; error?: string };
      if (data.error) { setSyncState('error'); setSyncLog([data.error]); return; }
      setSyncLog(data.results ?? []);
      if (data.baskets) setApiBaskets(data.baskets);
      setSyncState('done');
    } catch (e) {
      setSyncState('error');
      setSyncLog([String(e)]);
    }
  }

  // Tab state — 'aug26' | 'sep26' | API basket ids
  const [activeTab, setActiveTab] = useState('aug26');

  // API overrides the hardcoded Sep26 if a basket with id 'sep2026' is synced
  const effectiveSep26 = useMemo(() =>
    apiBaskets.find(b => b.id === 'sep2026') ?? SEP26_BASKET
  , [apiBaskets]);

  // Tabs: Aug 2026, Sep 2026, then any OTHER API baskets (not sep2026) newest-first
  const tabs = useMemo(() => {
    const list = [
      { id: 'aug26',  label: 'Aug 2026' },
      { id: 'sep2026', label: 'Sep 2026' },
    ];
    for (const b of apiBaskets) {
      if (b.id !== 'sep2026') list.push({ id: b.id, label: b.basketName });
    }
    return list;
  }, [apiBaskets]);

  // Collect ALL NSE symbols from Aug + Sep26 + all API baskets
  const allNseSymbols = useMemo(() => {
    const aug  = AUG_STOCKS.filter(s => !s.bse).map(s => s.symbol);
    const sep  = SEP26_BASKET.stocks.filter(s => !s.bse && !s.macroFill).map(s => s.symbol);
    const api  = apiBaskets.flatMap(b => b.stocks.filter(s => !s.bse && !s.macroFill).map(s => s.symbol));
    return [...new Set([...aug, ...sep, ...api])];
  }, [apiBaskets]);

  const creds       = useDhanCredentials();
  const dhanPrices  = useDhanEquityPrices(allNseSymbols, creds.isConfigured, creds.headers);
  const yahooPrices = useLivePrices(allNseSymbols);

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

  // Aug basket sorted
  const sortedAug = useMemo(() => [...AUG_STOCKS].sort((a, b) => {
    if (sortBy === 'rank')     return asc ? a.rank - b.rank : b.rank - a.rank;
    if (sortBy === 'todayPct') {
      const va = liveMap.get(a.symbol)?.changePct ?? -999;
      const vb = liveMap.get(b.symbol)?.changePct ?? -999;
      return asc ? va - vb : vb - va;
    }
    const va = pct(liveMap.get(a.symbol)?.ltp ?? 0, a.entry) ?? -999;
    const vb = pct(liveMap.get(b.symbol)?.ltp ?? 0, b.entry) ?? -999;
    return asc ? va - vb : vb - va;
  }), [sortBy, asc, liveMap]);

  // Aug summary
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

  // Active basket for the dynamic renderer (sep2026 uses effectiveSep26, others from API)
  const activeApiBasket = useMemo(() => {
    if (activeTab === 'sep2026') return effectiveSep26;
    return apiBaskets.find(b => b.id === activeTab);
  }, [apiBaskets, activeTab, effectiveSep26]);

  // Sort + summary for active API basket
  const { sortedApi, apiSummary } = useMemo(() => {
    if (!activeApiBasket) return { sortedApi: [], apiSummary: { count: 0, gainers: 0, losers: 0, avg: null as number | null } };
    const stocks = [...activeApiBasket.stocks].sort((a, b) => {
      if (sortBy === 'rank')     return asc ? a.rank - b.rank : b.rank - a.rank;
      if (sortBy === 'todayPct') {
        const va = liveMap.get(a.symbol)?.changePct ?? -999;
        const vb = liveMap.get(b.symbol)?.changePct ?? -999;
        return asc ? va - vb : vb - va;
      }
      const va = (a.macroFill || a.bse) ? -999 : (pct(liveMap.get(a.symbol)?.ltp ?? 0, a.entry) ?? -999);
      const vb = (b.macroFill || b.bse) ? -999 : (pct(liveMap.get(b.symbol)?.ltp ?? 0, b.entry) ?? -999);
      return asc ? va - vb : vb - va;
    });
    let g = 0, l = 0, total = 0, count = 0;
    for (const s of activeApiBasket.stocks) {
      if (s.macroFill || s.bse) continue;
      const ltp = liveMap.get(s.symbol)?.ltp ?? 0;
      if (!ltp) continue;
      count++;
      const r = pct(ltp, s.entry)!;
      total += r;
      if (r >= 0) g++; else l++;
    }
    return { sortedApi: stocks, apiSummary: { count, gainers: g, losers: l, avg: count > 0 ? total / count : null } };
  }, [activeApiBasket, sortBy, asc, liveMap]);

  const priceSource = creds.isConfigured
    ? `Dhan${dhanPrices.size > 0 ? ` (${dhanPrices.size}/${allNseSymbols.length})` : ''} + Yahoo`
    : 'Yahoo Finance';

  const summary = activeTab === 'aug26' ? augSummary : apiSummary;

  return (
    <main className="w-full px-4 py-5 space-y-5">

      {/* Tab bar + Sync button */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-0">
        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button key={t.id}
              onClick={() => { setActiveTab(t.id); setSortBy('rank'); setAsc(true); }}
              className={[
                'px-4 py-2 text-sm font-semibold rounded-t transition-colors -mb-px border border-b-0',
                activeTab === t.id
                  ? 'bg-slate-800 border-slate-700 text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
          {!apiLoaded && <span className="text-xs text-slate-600 ml-2 animate-pulse">loading…</span>}
        </div>

        <button
          onClick={handleSync}
          disabled={syncState === 'syncing'}
          className={[
            'mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors',
            syncState === 'syncing'
              ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-900/40 border-emerald-700/60 text-emerald-400 hover:bg-emerald-900/60',
          ].join(' ')}>
          {syncState === 'syncing' ? '⟳ Syncing…' : '↑ Sync from OneDrive'}
        </button>
      </div>

      {/* Sync log */}
      {syncLog.length > 0 && (
        <div className={`rounded-lg border px-3 py-2 text-xs font-mono space-y-0.5 ${syncState === 'error' ? 'bg-red-950/30 border-red-800/50 text-red-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
          {syncLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {/* Empty state — no API baskets yet */}
      {apiLoaded && apiBaskets.length === 0 && activeTab !== 'aug26' && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center space-y-2">
          <div className="text-slate-400 text-sm">No baskets synced yet.</div>
          <div className="text-slate-500 text-xs">Upload Scuttlebutt PDFs to your "New Research Dashboards" OneDrive folder, then click "Sync from OneDrive" above.</div>
          <div className="text-slate-600 text-xs">Files must be named <span className="font-mono text-slate-500">ScuttlebuttBasket_Research_*.pdf</span></div>
        </div>
      )}

      {/* ── Aug 2026 ── */}
      {activeTab === 'aug26' && (
        <>
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
            </div>
          </div>

          <SummaryStrip summary={summary} label="Equal weight · 5% each" />

          <div className="flex flex-wrap gap-2 items-center">
            {Object.entries(TIER_STYLE).map(([tier, style]) => (
              <span key={tier} className={`px-2 py-0.5 rounded text-[10px] font-bold ${style}`}>{tier}</span>
            ))}
            <span className="text-xs text-slate-600 ml-1">· ANY = wildcard</span>
          </div>

          {creds.isHydrated && !creds.isConfigured && <DhanNotice />}

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1080px]">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    <SortTh col="rank" label="#" right={false} />
                    <Th left>Company</Th>
                    <Th center>Tier</Th>
                    <Th>MCap</Th>
                    <Th>Entry Rs</Th>
                    <Th>LTP Rs</Th>
                    <SortTh col="todayPct"  label="Today %" />
                    <SortTh col="fromEntry" label="From Entry %" />
                    <Th left>Conviction</Th>
                    <Th left>Signal</Th>
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
                            {s.bse  && <Badge color="slate">BSE SME</Badge>}
                            {isDhan && <Badge color="emerald">DHAN</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{s.mcap}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">{fmt(s.entry)}</td>
                        <LtpCell bse={!!s.bse} ltp={ltp} />
                        <TodayCell v={todayPct} />
                        <ReturnCell v={feRet} />
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
                        Equal-weight avg · {augSummary.count}/19 NSE stocks with live data
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
          <div className="text-xs text-slate-600 space-y-0.5">
            <p>Entry = NSE/BSE closing prices on <span className="text-slate-500">31 Jul 2026</span>.</p>
            <p>L.T. Elevator (BSE SME) not NSE-listed — live price unavailable.</p>
          </div>
        </>
      )}

      {/* ── Dynamic API basket ── */}
      {activeTab !== 'aug26' && activeApiBasket && (
        <>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Scuttlebutt Run</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-mono">{activeApiBasket.basketName}</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-[10px] text-amber-400 font-mono">Data: {activeApiBasket.runDate}</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-100">20-Stock Scuttlebutt Basket</h1>
              <p className="text-slate-400 text-sm mt-1">4 cap tiers · 5 names each · Entry dates vary per stock</p>
            </div>
            <div className="flex gap-3">
              {activeApiBasket.topMover && (
                <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-3 py-2 text-center">
                  <div className="text-xs text-emerald-500 font-bold uppercase tracking-wide mb-0.5">Top Mover</div>
                  <div className="text-sm font-bold text-emerald-400">{activeApiBasket.topMover.name}</div>
                  <div className="text-xs text-emerald-300">{activeApiBasket.topMover.pct > 0 ? '+' : ''}{activeApiBasket.topMover.pct}%</div>
                </div>
              )}
              {activeApiBasket.weakSpot && (
                <div className="bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2 text-center">
                  <div className="text-xs text-red-500 font-bold uppercase tracking-wide mb-0.5">Weak Spot</div>
                  <div className="text-sm font-bold text-red-400">{activeApiBasket.weakSpot.name}</div>
                  <div className="text-xs text-red-300">{activeApiBasket.weakSpot.pct}%</div>
                </div>
              )}
            </div>
          </div>

          {activeApiBasket.basketRead && (
            <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg px-4 py-3">
              <span className="text-amber-400 text-xs font-bold uppercase tracking-wide">Basket Read · </span>
              <span className="text-slate-300 text-sm">{activeApiBasket.basketRead}</span>
            </div>
          )}

          <SummaryStrip summary={summary} label="4 cap tiers · 5 × 5" />

          <div className="flex flex-wrap gap-2 items-center">
            {['LARGECAP','MIDCAP','SMALLCAP','MICROCAP'].map(t => (
              <span key={t} className={`px-2 py-0.5 rounded text-[10px] font-bold ${TIER_STYLE[t]}`}>{t}</span>
            ))}
            {(['ACCUMULATE', 'WATCH', 'MACRO', 'RERATING'] as SeptStance[]).map(s => (
              <span key={s} className={`px-2 py-0.5 rounded text-[10px] font-bold ${STANCE_STYLE[s]} bg-slate-800 border border-slate-700`}>{s}</span>
            ))}
          </div>

          {creds.isHydrated && !creds.isConfigured && <DhanNotice />}

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    <SortTh col="rank" label="#" right={false} />
                    <Th left>Company</Th>
                    <Th center>Tier</Th>
                    <Th>MCap</Th>
                    <Th>Entry Rs</Th>
                    <Th>LTP Rs</Th>
                    <SortTh col="todayPct"  label="Today %" />
                    <SortTh col="fromEntry" label="From Entry %" />
                    <Th left>Stance</Th>
                    <Th left>Signal / Thesis</Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedApi.map((s: BasketStock, idx) => {
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
                            {s.bse        && <Badge color="slate">BSE</Badge>}
                            {s.stale      && <Badge color="amber">STALE</Badge>}
                            {s.macroFill  && <Badge color="sky">MACRO FILL</Badge>}
                            {isDhan       && <Badge color="emerald">DHAN</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_STYLE[s.tier] ?? ''}`}>{s.tier}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{s.mcap ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {s.macroFill
                            ? <span className="text-slate-600 text-xs">macro</span>
                            : <div><div className="text-slate-300">{fmt(s.entry)}</div><div className="text-[10px] text-slate-600">{s.entryDate}</div></div>
                          }
                        </td>
                        <LtpCell bse={!!s.bse || !!s.macroFill} ltp={ltp} />
                        <TodayCell v={todayPct} />
                        <ReturnCell v={feRet} />
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-xs ${STANCE_STYLE[s.stance as SeptStance] ?? 'text-slate-400'}`}>{s.stance}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed min-w-[220px]">{s.keySignal}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {apiSummary.avg !== null && (
                  <tfoot>
                    <tr className="bg-slate-800/80 border-t-2 border-slate-600">
                      <td colSpan={7} className="px-3 py-2.5 text-xs text-slate-400 font-semibold">
                        Equal-weight avg (excl. macro fills & BSE) · {apiSummary.count} stocks with live data
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono font-bold text-sm tabular-nums ${apiSummary.avg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {apiSummary.avg >= 0 ? '+' : ''}{fmt(apiSummary.avg)}%
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-0.5">
            <p>Data as of <span className="text-slate-500">{activeApiBasket.runDate}</span> (Scuttlebutt Research run). Entry prices and dates vary per stock.</p>
            <p>STALE = price could not be sourced at run time. MACRO FILL = macro-theme pick with no defined entry price.</p>
            <p>Source: {activeApiBasket.fileName}</p>
          </div>
        </>
      )}
    </main>
  );
}

// ── Small shared sub-components ───────────────────────────────────────────────

function Th({ children, left, center }: { children: React.ReactNode; left?: boolean; center?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-xs uppercase tracking-wide text-slate-500 whitespace-nowrap ${left ? 'text-left' : center ? 'text-center' : 'text-right'}`}>
      {children}
    </th>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: 'slate' | 'emerald' | 'amber' | 'sky' }) {
  const c = {
    slate:   'bg-slate-700 text-slate-400 border-slate-600',
    emerald: 'bg-emerald-900/60 text-emerald-400 border-emerald-800/50',
    amber:   'bg-amber-900/50 text-amber-400 border-amber-700/50',
    sky:     'bg-sky-900/50 text-sky-400 border-sky-700/50',
  }[color];
  return <span className={`text-[9px] px-1 rounded border font-bold ${c}`}>{children}</span>;
}

function LtpCell({ bse, ltp }: { bse: boolean; ltp: number }) {
  return (
    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
      {bse ? <span className="text-slate-600 text-xs">N/A</span>
        : ltp > 0 ? <span className="text-slate-100">{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        : <span className="text-slate-600 text-xs animate-pulse">loading</span>}
    </td>
  );
}

function TodayCell({ v }: { v: number | null }) {
  return (
    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
      {v !== null
        ? <span className={v >= 0 ? 'text-emerald-400' : 'text-red-400'}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>
        : <span className="text-slate-600 text-xs">--</span>}
    </td>
  );
}

function ReturnCell({ v }: { v: number | null }) {
  return (
    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
      {v !== null
        ? <span className={`font-bold ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>
        : <span className="text-slate-600 text-xs">--</span>}
    </td>
  );
}

function SummaryStrip({ summary, label }: { summary: { count: number; gainers: number; losers: number; avg: number | null }; label: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { l: 'Stocks', v: '20', c: 'text-slate-100' },
        { l: 'Structure', v: label, c: 'text-slate-100' },
        { l: 'Avg Return', v: summary.avg !== null ? `${summary.avg >= 0 ? '+' : ''}${summary.avg.toFixed(2)}%` : `-- (${summary.count}/20)`, c: summary.avg === null ? 'text-slate-500' : summary.avg >= 0 ? 'text-emerald-400' : 'text-red-400' },
        { l: 'Gainers', v: String(summary.gainers), c: summary.gainers > 0 ? 'text-emerald-400' : 'text-slate-500' },
        { l: 'Losers',  v: String(summary.losers),  c: summary.losers  > 0 ? 'text-red-400'     : 'text-slate-500' },
      ].map(({ l, v, c }) => (
        <div key={l} className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center">
          <div className={`text-xl font-bold font-mono ${c}`}>{v}</div>
          <div className="text-xs text-slate-500 mt-0.5">{l}</div>
        </div>
      ))}
    </div>
  );
}

function DhanNotice() {
  return (
    <div className="bg-amber-950/30 border border-amber-800/60 rounded px-3 py-2 text-amber-300 text-sm">
      Dhan not configured — live prices via Yahoo Finance.{' '}
      <a href="/settings" className="underline hover:text-amber-200">Configure in Settings</a>
    </div>
  );
}
