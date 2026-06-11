'use client';
import { useState, useCallback, useEffect } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import {
  buildSummary,
  SUMMARY_WEIGHTS,
  type SummaryPick,
  type ConfidenceBand,
  type SummaryInputs,
  type OIBuildupInput,
} from '@/lib/summary-engine';
import type { StockResult } from '@/lib/indicators';
import type { OptionsResult } from '@/lib/options-screener';
import type { TriangleResult } from '@/lib/triangle-screener';
import type { OIBuildupData } from '@/app/api/dhan/oi-buildup/route';
import type { OIScreenerRow } from '@/lib/oi-screener';
import type { BtstScreenData } from '@/lib/btst-types';
import type { StbtScreenData } from '@/lib/stbt-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Badge styling ─────────────────────────────────────────────────────────────

const BADGE_STYLE: Record<string, string> = {
  'Fresh Long Buildup':  'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40',
  'Short Covering':      'bg-sky-500/20     text-sky-300     ring-1 ring-sky-500/40',
  'Fresh Short Buildup': 'bg-red-500/20     text-red-300     ring-1 ring-red-500/40',
  'Long Unwinding':      'bg-orange-500/20  text-orange-300  ring-1 ring-orange-500/40',
  'BTST Setup':          'bg-teal-500/20    text-teal-300    ring-1 ring-teal-500/40',
  'STBT Breakdown':      'bg-rose-500/20    text-rose-300    ring-1 ring-rose-500/40',
  'Multi-Tab Confirmed': 'bg-violet-500/20  text-violet-300  ring-1 ring-violet-500/40',
  'Mixed Signals':       'bg-amber-500/20   text-amber-300   ring-1 ring-amber-500/40',
  'High Conflict':       'bg-rose-500/20    text-rose-400    ring-1 ring-rose-500/40',
};

function Badge({ label }: { label: string }) {
  const cls = BADGE_STYLE[label] ?? 'bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30';
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>{label}</span>;
}

function ConfBadge({ band }: { band: ConfidenceBand }) {
  const cls = band === 'HIGH'   ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
            : band === 'MEDIUM' ? 'bg-amber-900/50   text-amber-300   border border-amber-700'
            :                     'bg-slate-800       text-slate-400   border border-slate-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{band}</span>;
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, direction }: { score: number; direction: 'LONG' | 'SHORT' }) {
  const color = direction === 'LONG' ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score * 10}%` }} />
      </div>
      <span className="font-mono text-xs font-bold tabular-nums">{score.toFixed(1)}</span>
    </div>
  );
}

// ── Drilldown panel ───────────────────────────────────────────────────────────

function Drilldown({ pick }: { pick: SummaryPick }) {
  const longContribs  = pick.contributions.filter(c => c.direction === 'LONG');
  const shortContribs = pick.contributions.filter(c => c.direction === 'SHORT');

  return (
    <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-3 text-xs">
      {/* Tab contributions */}
      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Tab breakdown</div>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-slate-600 uppercase">
              <th className="text-left pb-1 pr-3">Tab</th>
              <th className="text-left pb-1 pr-3">Signal</th>
              <th className="text-left pb-1 pr-3">Key metric</th>
              <th className="text-right pb-1">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {pick.contributions.map((c, i) => (
              <tr key={i}>
                <td className="py-1 pr-3 text-slate-300 font-medium whitespace-nowrap">{c.tab}</td>
                <td className="py-1 pr-3">
                  <span className={c.direction === 'LONG' ? 'text-emerald-400' : c.direction === 'SHORT' ? 'text-red-400' : 'text-slate-400'}>
                    {c.direction}
                  </span>
                </td>
                <td className="py-1 pr-3 text-slate-400">{c.metric}</td>
                <td className="py-1 text-right font-mono tabular-nums text-slate-300">+{c.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Positives / Negatives */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pick.positives.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Supporting</div>
            <ul className="space-y-0.5">
              {pick.positives.map((p, i) => (
                <li key={i} className="flex gap-1.5 text-slate-300"><span className="text-emerald-500 shrink-0">✓</span>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {pick.negatives.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Opposing / Risk</div>
            <ul className="space-y-0.5">
              {pick.negatives.map((n, i) => (
                <li key={i} className="flex gap-1.5 text-slate-300"><span className="text-red-500 shrink-0">✗</span>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Plain-English explanation */}
      <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-slate-300 leading-relaxed">
        {pick.explanation}
      </div>
    </div>
  );
}

// ── Pick card ─────────────────────────────────────────────────────────────────

function PickCard({ pick }: { pick: SummaryPick }) {
  const [open, setOpen] = useState(false);
  const isLong  = pick.direction === 'LONG';
  const border  = isLong ? 'border-t-emerald-500' : 'border-t-red-500';
  const rankBg  = isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400';

  return (
    <div className={`bg-slate-900 border border-slate-700 border-t-2 ${border} rounded-xl px-4 py-3`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${rankBg}`}>
            {pick.rank}
          </span>
          <span className="font-mono font-black text-slate-100 text-sm tracking-tight">{pick.symbol}</span>
          {pick.isIndex && (
            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-sky-900/50 text-sky-300 border border-sky-800">IDX</span>
          )}
          {pick.price > 0 && (
            <span className="text-xs text-slate-500 font-mono">₹{fmt2(pick.price)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ConfBadge band={pick.confidence} />
          <span className={`text-xs font-black ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
            {isLong ? '▲ LONG' : '▼ SHORT'}
          </span>
        </div>
      </div>

      {/* Score bar + tabs */}
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <ScoreBar score={pick.displayScore} direction={pick.direction} />
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-emerald-400 font-semibold">✓{pick.supportingTabs} supporting</span>
          {pick.opposingTabs > 0 && (
            <span className="text-red-400 font-semibold">✗{pick.opposingTabs} opposing</span>
          )}
        </div>
      </div>

      {/* Badges */}
      {pick.badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {pick.badges.map(b => <Badge key={b} label={b} />)}
        </div>
      )}

      {/* Company name */}
      {pick.company && pick.company !== pick.symbol && (
        <div className="mt-1 text-[10px] text-slate-600 truncate">{pick.company}</div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="mt-2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
      >
        {open ? '▲ Hide drilldown' : '▼ Expand drilldown'}
      </button>

      {open && <Drilldown pick={pick} />}
    </div>
  );
}

// ── Top picks panel ───────────────────────────────────────────────────────────

function TopPanel({
  title, picks, direction, loading, empty,
}: {
  title: string; picks: SummaryPick[]; direction: 'LONG' | 'SHORT'; loading: boolean; empty: boolean;
}) {
  const borderColor = direction === 'LONG' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex flex-col gap-2">
      <div className={`text-xs font-black uppercase tracking-widest ${borderColor}`}>{title}</div>
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />
        ))
      ) : empty ? (
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-6 text-center text-slate-500 text-xs">
          No {direction.toLowerCase()} picks yet — run analysis
        </div>
      ) : (
        picks.slice(0, 5).map(p => <PickCard key={p.symbol} pick={p} />)
      )}
    </div>
  );
}

// ── Status indicator ──────────────────────────────────────────────────────────

type SourceStatus = 'idle' | 'loading' | 'ok' | 'error';

function SourceDot({ status, label }: { status: SourceStatus; label: string }) {
  const cls = status === 'ok'      ? 'bg-emerald-500'
            : status === 'error'   ? 'bg-red-500'
            : status === 'loading' ? 'bg-amber-400 animate-pulse'
            :                        'bg-slate-600';
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-500">
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${cls}`} />
      {label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'stocks' | 'indices';
type MinConf    = 'any' | 'MEDIUM' | 'HIGH';

export default function SummaryPage() {
  const { clientId, accessToken } = useDhanCredentials();
  const hasDhan = !!(clientId && accessToken);

  const [longs,  setLongs]  = useState<SummaryPick[]>([]);
  const [shorts, setShorts] = useState<SummaryPick[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [fetchedAt,  setFetchedAt]  = useState<string | null>(null);

  const [sourceStatus, setSourceStatus] = useState<Record<string, SourceStatus>>({
    screener: 'idle', options: 'idle', triangle: 'idle', oiBuildup: 'idle', oiScreen: 'idle',
    btst: 'idle', stbt: 'idle',
  });

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [minConf,    setMinConf]    = useState<MinConf>('any');
  const [hideMixed,  setHideMixed]  = useState(false);

  const setStatus = (key: string, s: SourceStatus) =>
    setSourceStatus(prev => ({ ...prev, [key]: s }));

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setSourceStatus({
      screener: 'loading', options: 'loading', triangle: 'loading',
      oiBuildup: 'loading', oiScreen: hasDhan ? 'loading' : 'idle',
      btst: 'loading', stbt: 'loading',
    });

    const inputs: SummaryInputs = {
      screener: [], options: [], triangle: [], oiBuildup: [], oiScreen: [],
      btst: [], stbt: [],
    };

    // ── BTST: read from localStorage (cached when user runs BTST tab scan) ──
    try {
      const btstIdx = JSON.parse(localStorage.getItem('btst-scan-index') ?? '[]') as string[];
      const latestBtst = btstIdx[0];
      if (latestBtst) {
        const raw = localStorage.getItem(`btst-scan-${latestBtst}`);
        if (raw) {
          const d = JSON.parse(raw) as BtstScreenData;
          inputs.btst = d.results.map(r => ({
            symbol:      r.symbol,
            company:     r.company,
            price:       r.close,
            score:       r.score,
            conviction:  r.conviction,
            volumeRatio: r.volumeRatio,
            changePct:   r.changePct,
            fnoSignal:   r.fnoSignal,
          }));
          setStatus('btst', 'ok');
        } else { setStatus('btst', 'idle'); }
      } else { setStatus('btst', 'idle'); }
    } catch { setStatus('btst', 'idle'); }

    // ── STBT: read from localStorage ────────────────────────────────────────
    try {
      const stbtIdx = JSON.parse(localStorage.getItem('stbt-scan-index') ?? '[]') as string[];
      const latestStbt = stbtIdx[0];
      if (latestStbt) {
        const raw = localStorage.getItem(`stbt-scan-${latestStbt}`);
        if (raw) {
          const d = JSON.parse(raw) as StbtScreenData;
          inputs.stbt = d.results.map(r => ({
            symbol:      r.symbol,
            company:     r.company,
            price:       r.close,
            score:       r.score,
            conviction:  r.conviction,
            volumeRatio: r.volumeRatio,
            changePct:   r.changePct,
            fnoSignal:   r.fnoSignal,
          }));
          setStatus('stbt', 'ok');
        } else { setStatus('stbt', 'idle'); }
      } else { setStatus('stbt', 'idle'); }
    } catch { setStatus('stbt', 'idle'); }

    const fetchers: Promise<void>[] = [
      // Screener
      fetch('/api/screen').then(async r => {
        if (!r.ok) throw new Error();
        const json = await r.json() as { results: StockResult[] };
        inputs.screener = json.results.map(s => ({
          symbol: s.symbol, company: s.company, price: s.price,
          score: s.score, stage2: s.stage2, rsVsNifty: s.rsVsNifty,
          rsi: s.rsi, vcp: s.vcp, bbSqueeze: s.bbSqueeze,
          tradeSetup: { action: s.tradeSetup.action },
        }));
        setStatus('screener', 'ok');
      }).catch(() => setStatus('screener', 'error')),

      // Options screener
      fetch('/api/options-screen').then(async r => {
        if (!r.ok) throw new Error();
        const json = await r.json() as { results: OptionsResult[] };
        inputs.options = json.results.map(o => ({
          symbol: o.symbol, company: o.company, price: o.price,
          direction: o.direction, score: o.score, confidence: o.confidence,
          reasons: o.reasons, riskFlags: o.riskFlags,
        }));
        setStatus('options', 'ok');
      }).catch(() => setStatus('options', 'error')),

      // Triangle
      fetch('/api/triangle-screen').then(async r => {
        if (!r.ok) throw new Error();
        const json = await r.json() as { results: TriangleResult[] };
        inputs.triangle = json.results.map(t => ({
          symbol: t.symbol, company: t.company, price: t.price,
          totalScore: t.totalScore, isAboveResistance: t.isAboveResistance,
          breakoutDistPct: t.breakoutDistPct, rsiStatus: t.rsiStatus, macdStatus: t.macdStatus,
        }));
        setStatus('triangle', 'ok');
      }).catch(() => setStatus('triangle', 'error')),

      // OI Buildup (no creds needed)
      fetch('/api/dhan/oi-buildup').then(async r => {
        if (!r.ok) throw new Error();
        const json = await r.json() as OIBuildupData;
        const rows: OIBuildupInput[] = [
          ...json.lb.map(b => ({ ...b, category: 'lb' as const })),
          ...json.sb.map(b => ({ ...b, category: 'sb' as const })),
          ...json.sc.map(b => ({ ...b, category: 'sc' as const })),
          ...json.lu.map(b => ({ ...b, category: 'lu' as const })),
        ];
        inputs.oiBuildup = rows;
        setStatus('oiBuildup', 'ok');
      }).catch(() => setStatus('oiBuildup', 'error')),
    ];

    // OI Screen (optional — Dhan creds)
    if (hasDhan) {
      const prefetch = fetch('/api/dhan/oi-screener/prefetch', {
        headers: { 'x-dhan-client-id': clientId, 'x-dhan-access-token': accessToken },
      }).then(r => r.ok ? r.json() as Promise<{ weeklyExpiry: string; stockExpiry: string; midcpExpiry: string }> : null).catch(() => null);

      fetchers.push(
        prefetch.then(async pf => {
          const params = new URLSearchParams({ batch: '1' });
          if (pf) {
            params.set('weeklyExpiry', pf.weeklyExpiry ?? '');
            params.set('stockExpiry',  pf.stockExpiry  ?? '');
            params.set('midcpExpiry',  pf.midcpExpiry  ?? '');
          }
          const r = await fetch(`/api/dhan/oi-screener?${params}`, {
            headers: { 'x-dhan-client-id': clientId, 'x-dhan-access-token': accessToken },
          });
          if (!r.ok) throw new Error();
          const json = await r.json() as { all: OIScreenerRow[] };
          inputs.oiScreen = (json.all ?? []).map(os => ({
            symbol: os.symbol, netOIChgPct: os.netOIChgPct,
            ceOIChg: os.ceOIChg, peOIChg: os.peOIChg, totalOI: os.totalOI,
          }));
          setStatus('oiScreen', 'ok');
        }).catch(() => setStatus('oiScreen', 'error')),
      );
    }

    await Promise.allSettled(fetchers);

    const result = buildSummary(inputs);
    setLongs(result.longs);
    setShorts(result.shorts);
    setFetchedAt(new Date().toISOString());
    setAnalyzing(false);
  }, [hasDhan, clientId, accessToken]);

  // Auto-run on mount
  useEffect(() => { runAnalysis(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtering ─────────────────────────────────────────────────────────────

  const applyFilters = (picks: SummaryPick[]) => picks.filter(p => {
    if (filterType === 'stocks'  && p.isIndex)  return false;
    if (filterType === 'indices' && !p.isIndex) return false;
    if (minConf === 'HIGH'   && p.confidence !== 'HIGH')   return false;
    if (minConf === 'MEDIUM' && p.confidence === 'LOW')    return false;
    if (hideMixed && (p.badges.includes('Mixed Signals') || p.badges.includes('High Conflict'))) return false;
    return true;
  });

  const filteredLongs  = applyFilters(longs);
  const filteredShorts = applyFilters(shorts);
  const hasData = longs.length > 0 || shorts.length > 0;

  const fetchedAtStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <main className="px-5 py-5 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Master Summary</h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-medium">
          Cross-tab conviction engine · Top 5 Long · Top 5 Short ·&nbsp;
          {analyzing
            ? 'Analyzing all sources…'
            : fetchedAtStr
            ? `Last analyzed ${fetchedAtStr} · ${longs.length} long · ${shorts.length} short candidates`
            : 'Click Re-analyze to start'}
        </p>
      </div>

      {/* ── Source status + Re-analyze ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className={`px-5 py-2 font-bold rounded-lg text-sm transition-colors disabled:opacity-60
            ${analyzing ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
        >
          {analyzing ? 'Analyzing…' : '↻ Re-analyze'}
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <SourceDot status={sourceStatus.screener}  label="Screener" />
          <SourceDot status={sourceStatus.options}   label="Very Short Term" />
          <SourceDot status={sourceStatus.triangle}  label="Triangle" />
          <SourceDot status={sourceStatus.oiBuildup} label="OI Buildup" />
          {hasDhan && <SourceDot status={sourceStatus.oiScreen} label="OI Screen" />}
          {!hasDhan && <span className="text-[10px] text-slate-600">OI Screen: no Dhan creds</span>}
          <SourceDot status={sourceStatus.btst} label="BTST" />
          <SourceDot status={sourceStatus.stbt} label="STBT" />
          {sourceStatus.btst === 'idle' && (
            <span className="text-[10px] text-slate-600">BTST: run BTST scan first</span>
          )}
          {sourceStatus.stbt === 'idle' && (
            <span className="text-[10px] text-slate-600">STBT: run STBT scan first</span>
          )}
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────── */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3">
          {/* Type filter */}
          <div className="flex items-center gap-1">
            {(['all', 'stocks', 'indices'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors capitalize ${
                  filterType === f ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >{f}</button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-700" />

          {/* Min confidence */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-1">Min conf:</span>
            {(['any', 'MEDIUM', 'HIGH'] as MinConf[]).map(c => (
              <button
                key={c}
                onClick={() => setMinConf(c)}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                  minConf === c ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >{c}</button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-700" />

          {/* Hide mixed */}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 select-none">
            <input
              type="checkbox"
              checked={hideMixed}
              onChange={e => setHideMixed(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500"
            />
            Hide mixed signals
          </label>
        </div>
      )}

      {/* ── Top 5 picks grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TopPanel
          title="Top 5 Long"
          picks={filteredLongs}
          direction="LONG"
          loading={analyzing && longs.length === 0}
          empty={!analyzing && filteredLongs.length === 0}
        />
        <TopPanel
          title="Top 5 Short"
          picks={filteredShorts}
          direction="SHORT"
          loading={analyzing && shorts.length === 0}
          empty={!analyzing && filteredShorts.length === 0}
        />
      </div>

      {/* ── Methodology footer ────────────────────────────────────────── */}
      {hasData && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-3 text-xs text-slate-500">
          <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-widest">Scoring methodology</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
            <span>OI Long Buildup: <strong className="text-slate-300">{SUMMARY_WEIGHTS.oiLB}</strong></span>
            <span>OI Short Buildup: <strong className="text-slate-300">{SUMMARY_WEIGHTS.oiSB}</strong></span>
            <span>Options CALL Strong: <strong className="text-slate-300">{SUMMARY_WEIGHTS.optionsCallStrong}</strong></span>
            <span>Options PUT Strong: <strong className="text-slate-300">{SUMMARY_WEIGHTS.optionsPutStrong}</strong></span>
            <span>Triangle breakout: <strong className="text-slate-300">{SUMMARY_WEIGHTS.triangleBreakout}</strong></span>
            <span>Screener BUY (high): <strong className="text-slate-300">{SUMMARY_WEIGHTS.screenerBuyHigh}</strong></span>
            <span>BTST Very High: <strong className="text-slate-300">{SUMMARY_WEIGHTS.btstVeryHigh}</strong></span>
            <span>BTST High: <strong className="text-slate-300">{SUMMARY_WEIGHTS.btstHigh}</strong></span>
            <span>STBT Very High: <strong className="text-slate-300">{SUMMARY_WEIGHTS.stbtVeryHigh}</strong></span>
            <span>STBT High: <strong className="text-slate-300">{SUMMARY_WEIGHTS.stbtHigh}</strong></span>
            <span>OI Screen bull: <strong className="text-slate-300">{SUMMARY_WEIGHTS.oiScreenBull}</strong></span>
            <span>Conflict penalty: <strong className="text-slate-300">−{SUMMARY_WEIGHTS.penaltyStrongBoth}</strong></span>
          </div>
          <div className="text-[10px] text-slate-600">
            Weights are centralised in <code className="text-slate-500">lib/summary-engine.ts → SUMMARY_WEIGHTS</code>. Edit any value there to re-tune the ranking without changing any other code.
          </div>
        </div>
      )}

    </main>
  );
}
