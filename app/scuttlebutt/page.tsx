'use client';
import { useState, useMemo } from 'react';
import { useLivePrices } from '@/app/hooks/useLivePrices';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tier       = 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP' | 'ANY';
type Conviction = 'HIGH' | 'MEDIUM-HIGH' | 'MEDIUM' | 'LOW-MED';
type SortKey    = 'rank' | 'todayPct' | 'fromEntry';

interface Stock {
  rank:       number;
  name:       string;
  symbol:     string;
  tier:       Tier;
  entryPrice: number;
  mcap:       string;
  keySignal:  string;
  conviction: Conviction;
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

const ENTRY_DATE = 'Aug 2, 2026';

const STOCKS: Stock[] = [
  { rank: 1,  name: 'MTAR Technologies',        symbol: 'MTARTECH',   tier: 'MIDCAP',   entryPrice: 5900,  mcap: '16,782 Cr',     keySignal: 'Q1 PAT +5x; guidance raised to 80%; Bloom confirmed',          conviction: 'HIGH'        },
  { rank: 2,  name: 'Muthoot Finance',           symbol: 'MUTHOOTFIN', tier: 'LARGECAP', entryPrice: 3120,  mcap: '1,25,262 Cr',   keySignal: 'PAT +43%, P/E 11.8x, gold AUM +44%; cheapest NBFC',            conviction: 'HIGH'        },
  { rank: 3,  name: 'Emmvee Photovoltaic',       symbol: 'EMMVEE',     tier: 'MIDCAP',   entryPrice: 575,   mcap: '21,927 Cr',     keySignal: 'PAT +103%, order book 9.9 GW ATH; ALMM moat',                  conviction: 'HIGH'        },
  { rank: 4,  name: 'Aeroflex Industries',       symbol: 'AEROFLEX',   tier: 'SMALLCAP', entryPrice: 401,   mcap: '~4,500 Cr',     keySignal: 'PAT +162%; liquid cooling 1,040 skids; 9K→15K capacity',        conviction: 'HIGH'        },
  { rank: 5,  name: 'Laurus Labs',               symbol: 'LAURUSLABS', tier: 'LARGECAP', entryPrice: 852,   mcap: '96,245 Cr',     keySignal: 'Q1 PAT +126%; CDMO 125 active projects; margin record 31.8%',   conviction: 'HIGH'        },
  { rank: 6,  name: 'Tatva Chintan Pharma',      symbol: 'TATVA',      tier: 'SMALLCAP', entryPrice: 1713,  mcap: '~2,500 Cr',     keySignal: 'PAT +140%, EBITDA 19.5%; Rs 200 Cr Dahej greenfield approved',  conviction: 'MEDIUM-HIGH' },
  { rank: 7,  name: 'Genus Power',               symbol: 'GENUSPOWER', tier: 'MIDCAP',   entryPrice: 308,   mcap: '9,797 Cr',      keySignal: 'Rs 25,173 Cr order book (4x annual target); Q1 results Aug 5',  conviction: 'MEDIUM-HIGH' },
  { rank: 8,  name: 'Ganesha Ecosphere',         symbol: 'GANECOS',    tier: 'MICROCAP', entryPrice: 886,   mcap: '~885 Cr',       keySignal: 'India only FSSAI rPET mfr; EPR 40% mandate; Q1 call Aug 4',     conviction: 'MEDIUM-HIGH' },
  { rank: 9,  name: 'Navin Fluorine',            symbol: 'NAVINFLUOR', tier: 'MIDCAP',   entryPrice: 4250,  mcap: '~30,000 Cr',    keySignal: 'AI cooling (Chemours) + HFO India-first (Honeywell); Q1 Aug 5',  conviction: 'MEDIUM-HIGH' },
  { rank: 10, name: 'Sobha Ltd',                 symbol: 'SOBHA',      tier: 'ANY',      entryPrice: 1348,  mcap: '14,570 Cr',     keySignal: 'Pre-sales +76% Q1; net cash; luxury segment 42% of sales',      conviction: 'MEDIUM'      },
  { rank: 11, name: "Divi's Laboratories",       symbol: 'DIVISLAB',   tier: 'LARGECAP', entryPrice: 6300,  mcap: '~1,20,000 Cr',  keySignal: 'Q1 PAT +65%; CDMO volume cycle; quality compounder',            conviction: 'MEDIUM'      },
  { rank: 12, name: 'Syrma SGS Technology',      symbol: 'SYRMA',      tier: 'ANY',      entryPrice: 590,   mcap: '25,523 Cr',     keySignal: 'Revenue +67%, PAT +112%; IND AA upgrade; ODM expansion',        conviction: 'MEDIUM'      },
  { rank: 13, name: 'Venus Remedies',            symbol: 'VENUSREM',   tier: 'SMALLCAP', entryPrice: 670,   mcap: '2,101 Cr',      keySignal: 'Q1 PAT +139%, Revenue +30%; hospital critical care export ramp', conviction: 'MEDIUM'      },
  { rank: 14, name: 'DEE Development Engineers', symbol: 'DEEDEV',     tier: 'MICROCAP', entryPrice: 647,   mcap: '~850 Cr',       keySignal: 'India largest process piping; HRSG US$15.27M/yr Jun 2027',       conviction: 'MEDIUM'      },
  { rank: 15, name: 'HBL Engineering',           symbol: 'HBLENGINE',  tier: 'SMALLCAP', entryPrice: 550,   mcap: '~6,000 Cr',     keySignal: 'Kavach Rs 1,522 Cr + IAF smart bomb order Jul 2026',            conviction: 'MEDIUM'      },
  { rank: 16, name: 'Bajaj Finance',             symbol: 'BAJFINANCE', tier: 'LARGECAP', entryPrice: 9500,  mcap: '~4,80,000 Cr',  keySignal: 'Q1 PAT +29%, AUM +24%; 52W high; asset quality improving',      conviction: 'MEDIUM'      },
  { rank: 17, name: 'Data Patterns India',       symbol: 'DATAPATT',   tier: 'ANY',      entryPrice: 2100,  mcap: '~7,000 Cr',     keySignal: 'L1 Rs 1,300 Cr HAL deal pending; contrarian buy post -8% dip',  conviction: 'MEDIUM'      },
  { rank: 18, name: 'L.T. Elevator',             symbol: 'LTELEVATOR', tier: 'MICROCAP', entryPrice: 290,   mcap: '~380 Cr',       keySignal: 'India only listed elevator; mfg facility bhoomi pujan Jul 13',   conviction: 'LOW-MED'     },
  { rank: 19, name: 'Senco Gold',                symbol: 'SENCO',      tier: 'ANY',      entryPrice: 1400,  mcap: '~3,500 Cr',     keySignal: 'Revenue +60%, SSSG +38%; festive season tailwind Q2-Q3',        conviction: 'LOW-MED'     },
  { rank: 20, name: 'Vintage Coffee',            symbol: 'VINCOFE',    tier: 'MICROCAP', entryPrice: 163,   mcap: '~750 Cr',       keySignal: 'FDC Rs 480 Cr plant (FY28); B2B instant coffee export ramp',    conviction: 'LOW-MED'     },
];

// ── Style maps ────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<Tier, { badge: string; label: string }> = {
  LARGECAP:  { badge: 'bg-amber-900/50 text-amber-300 border border-amber-700/50',   label: 'Largecap  >Rs 40K Cr'  },
  MIDCAP:    { badge: 'bg-sky-900/50 text-sky-300 border border-sky-700/50',         label: 'Midcap  Rs 8K-40K Cr'  },
  SMALLCAP:  { badge: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50', label: 'Smallcap  Rs 1K-8K Cr' },
  MICROCAP:  { badge: 'bg-purple-900/50 text-purple-300 border border-purple-700/50', label: 'Microcap  <Rs 1K Cr'  },
  ANY:       { badge: 'bg-rose-900/50 text-rose-300 border border-rose-700/50',      label: 'Any Tier  wildcard'    },
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

function fromEntry(cmp: number, entry: number) {
  return ((cmp - entry) / entry) * 100;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScuttlebuttPage() {
  const symbols  = STOCKS.map(s => s.symbol);
  const liveMap  = useLivePrices(symbols);
  const [sortBy, setSortBy] = useState<SortKey>('rank');
  const [asc,    setAsc]    = useState(true);

  // Toggle sort: clicking same col flips direction; clicking new col defaults to desc for pct cols
  function handleSort(key: SortKey) {
    if (sortBy === key) { setAsc(a => !a); return; }
    setSortBy(key);
    setAsc(key === 'rank');
  }

  const sorted = useMemo(() => {
    return [...STOCKS].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortBy === 'rank') {
        va = a.rank; vb = b.rank;
      } else if (sortBy === 'todayPct') {
        va = liveMap.get(a.symbol)?.changePct ?? -999;
        vb = liveMap.get(b.symbol)?.changePct ?? -999;
      } else {
        const pa = liveMap.get(a.symbol)?.price ?? a.entryPrice;
        const pb = liveMap.get(b.symbol)?.price ?? b.entryPrice;
        va = fromEntry(pa, a.entryPrice);
        vb = fromEntry(pb, b.entryPrice);
      }
      return asc ? va - vb : vb - va;
    });
  }, [sortBy, asc, liveMap]);

  // Portfolio-level aggregates
  const { liveCount, gainers, losers, equalWeightReturn } = useMemo(() => {
    let live = 0, g = 0, l = 0, totalRet = 0;
    for (const s of STOCKS) {
      const q = liveMap.get(s.symbol);
      if (!q) continue;
      live++;
      const ret = fromEntry(q.price, s.entryPrice);
      totalRet += ret;
      if (ret >= 0) g++; else l++;
    }
    return {
      liveCount: live,
      gainers: g,
      losers: l,
      equalWeightReturn: live > 0 ? totalRet / live : null,
    };
  }, [liveMap]);

  function SortTh({ col, label, right = true }: { col: SortKey; label: string; right?: boolean }) {
    const active = sortBy === col;
    return (
      <th
        onClick={() => handleSort(col)}
        className={`px-3 py-2.5 ${right ? 'text-right' : 'text-left'} cursor-pointer select-none whitespace-nowrap
          ${active ? 'text-emerald-400' : 'hover:text-slate-300 text-slate-500'} transition-colors`}
      >
        {label}{active ? (asc ? ' ▲' : ' ▼') : ''}
      </th>
    );
  }

  return (
    <main className="w-full px-4 py-5 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Scuttlebutt Run</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-mono">
              Aug 2026
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">20-Stock Equal-Weight Portfolio</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Entry: {ENTRY_DATE} &nbsp;·&nbsp; 5% per stock &nbsp;·&nbsp; Tracking window: Q2 FY27 (to Nov 2026)
          </p>
        </div>
        <div className="text-xs text-slate-500 text-right leading-5">
          Prices: Yahoo Finance via /api/live-prices (30s refresh)
          {liveCount < STOCKS.length && (
            <div className="text-amber-500 mt-0.5">{STOCKS.length - liveCount} stock(s) awaiting live data</div>
          )}
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Stocks',           value: '20',           color: 'text-slate-100' },
          { label: 'Equal Weight',     value: '5% each',      color: 'text-slate-100' },
          {
            label: 'Avg Return (live)',
            value: equalWeightReturn !== null
              ? `${equalWeightReturn >= 0 ? '+' : ''}${fmt(equalWeightReturn)}%`
              : `-- (${liveCount}/20)`,
            color: equalWeightReturn === null ? 'text-slate-500'
                 : equalWeightReturn >= 0     ? 'text-emerald-400'
                 :                              'text-red-400',
          },
          { label: 'Gainers',          value: String(gainers), color: gainers > 0 ? 'text-emerald-400' : 'text-slate-500' },
          { label: 'Losers',           value: String(losers),  color: losers  > 0 ? 'text-red-400'     : 'text-slate-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-center">
            <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tier legend ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.entries(TIER_STYLE) as [Tier, typeof TIER_STYLE[Tier]][]).map(([tier, s]) => (
          <span key={tier} className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.badge}`}>
            {tier}
          </span>
        ))}
        <span className="text-xs text-slate-600 ml-1">ANY = wildcard picks from any cap tier</span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1080px]">
            <thead className="bg-slate-900 border-b border-slate-700 text-xs uppercase tracking-wide">
              <tr>
                <SortTh col="rank"      label="#"            right={false} />
                <th className="px-3 py-2.5 text-left text-slate-500 whitespace-nowrap">Company</th>
                <th className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">Tier</th>
                <th className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">MCap</th>
                <th className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">Entry Rs</th>
                <th className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">CMP Rs</th>
                <SortTh col="todayPct"  label="Today %" />
                <SortTh col="fromEntry" label="From Entry %" />
                <th className="px-3 py-2.5 text-left text-slate-500 whitespace-nowrap">Conviction</th>
                <th className="px-3 py-2.5 text-left text-slate-500">Key Signal</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => {
                const live         = liveMap.get(s.symbol);
                const cmp          = live?.price ?? null;
                const todayPct     = live?.changePct ?? null;
                const fromEntryPct = cmp !== null ? fromEntry(cmp, s.entryPrice) : null;
                const rowBg        = idx % 2 === 1 ? 'bg-slate-900/40' : '';

                return (
                  <tr key={s.symbol}
                    className={`border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${rowBg}`}>

                    {/* # */}
                    <td className="px-3 py-2.5">
                      <span className="text-slate-500 font-mono text-xs tabular-nums">{s.rank}</span>
                    </td>

                    {/* Company */}
                    <td className="px-3 py-2.5 min-w-[170px]">
                      <div className="font-semibold text-slate-100 text-sm leading-tight">{s.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{s.symbol}</div>
                    </td>

                    {/* Tier */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_STYLE[s.tier].badge}`}>
                        {s.tier}
                      </span>
                    </td>

                    {/* MCap */}
                    <td className="px-3 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {s.mcap}
                    </td>

                    {/* Entry */}
                    <td className="px-3 py-2.5 text-right font-mono text-slate-400 text-sm tabular-nums">
                      {fmt(s.entryPrice)}
                    </td>

                    {/* CMP */}
                    <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                      {cmp !== null
                        ? <span className="text-slate-100">{fmt(cmp)}</span>
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

                    {/* From Entry % */}
                    <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                      {fromEntryPct !== null
                        ? <span className={`font-bold ${fromEntryPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fromEntryPct >= 0 ? '+' : ''}{fmt(fromEntryPct)}%
                          </span>
                        : <span className="text-slate-600 text-xs">--</span>
                      }
                    </td>

                    {/* Conviction */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs ${CONVICTION_STYLE[s.conviction]}`}>
                        {s.conviction}
                      </span>
                    </td>

                    {/* Key Signal */}
                    <td className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed min-w-[240px]">
                      {s.keySignal}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer row -- portfolio equal-weight return */}
            {equalWeightReturn !== null && (
              <tfoot>
                <tr className="bg-slate-800 border-t-2 border-slate-600">
                  <td colSpan={7} className="px-3 py-2.5 text-xs text-slate-400 font-semibold">
                    Equal-weight portfolio average ({liveCount}/20 stocks with live data)
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold text-sm tabular-nums
                    ${equalWeightReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {equalWeightReturn >= 0 ? '+' : ''}{fmt(equalWeightReturn)}%
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Footnote ──────────────────────────────────────────────────────── */}
      <div className="text-xs text-slate-600 space-y-1">
        <p>
          Entry prices as of {ENTRY_DATE} (approximate, based on research data).
          Equal-weight: 5% per stock (Rs 5L per Rs 1Cr portfolio).
          Click column headers to sort. Prices refresh every 30 seconds.
        </p>
        <p>
          Note: L.T. Elevator (BSE SME, code 544518) is not NSE-listed -- live data via Yahoo Finance may be unavailable for this ticker.
          Target review: October/November 2026 (end of Q2 FY27).
        </p>
      </div>
    </main>
  );
}
