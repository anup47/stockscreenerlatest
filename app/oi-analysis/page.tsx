'use client';
import { useState, useEffect, useCallback } from 'react';
import { useDhanCredentials } from '@/app/hooks/useDhanCredentials';
import { SymbolSearch } from '@/app/components/SymbolSearch';
import type { OptionChainData, OptionStrike } from '@/lib/dhan-api';
import {
  calcMaxPain, calcPCR, calcDeltaOI, calcOIDistribution,
  calcOIInterpretation, calcATMZonePCR, topCallStrikes, topPutStrikes,
  classifyOIChange, calcStrikePCR,
  type OISignal,
} from '@/lib/oi-calculations';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtOI(n: number) {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-IN');
}

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function findATM(strikes: OptionStrike[], spot: number): number {
  return strikes.reduce((best, s) =>
    Math.abs(s.strikePrice - spot) < Math.abs(best - spot) ? s.strikePrice : best,
    strikes[0]?.strikePrice ?? 0,
  );
}

// ── Signal badge ──────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: OISignal }) {
  const styles: Record<OISignal, string> = {
    'Long Build-up':  'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
    'Short Build-up': 'bg-red-900/60 text-red-300 border border-red-700',
    'Long Unwinding': 'bg-amber-900/60 text-amber-300 border border-amber-700',
    'Short Covering': 'bg-sky-900/60 text-sky-300 border border-sky-700',
    'Neutral':        'bg-slate-800 text-slate-400 border border-slate-700',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${styles[signal]}`}>{signal}</span>;
}

// ── OI Bar (visual width) ─────────────────────────────────────────────────────

function OIBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-9 text-right">{pct}%</span>
    </div>
  );
}

// ── Th helper ─────────────────────────────────────────────────────────────────

function Th({ children, cls = '' }: { children: React.ReactNode; cls?: string }) {
  return (
    <th className={`px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${cls}`}>
      {children}
    </th>
  );
}

function Td({ children, cls = '' }: { children: React.ReactNode; cls?: string }) {
  return (
    <td className={`px-3 py-2 text-xs tabular-nums ${cls}`}>{children}</td>
  );
}

// ── 10 tab implementations ─────────────────────────────────────────────────────

function OIDistributionTab({ strikes, maxPain }: { strikes: OptionStrike[]; maxPain: number }) {
  const rows = calcOIDistribution(strikes, maxPain);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            <Th>Strike</Th>
            <Th cls="text-right">Call OI</Th>
            <Th cls="text-right">Call %</Th>
            <Th>Call Distribution</Th>
            <Th cls="text-right">Put OI</Th>
            <Th cls="text-right">Put %</Th>
            <Th>Put Distribution</Th>
            <Th cls="text-center">Max Pain</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {rows.map(r => (
            <tr key={r.strikePrice} className={`hover:bg-slate-800/40 ${r.isMaxPain ? 'bg-amber-950/30' : ''}`}>
              <Td cls="font-mono font-semibold text-slate-200">{r.strikePrice.toLocaleString('en-IN')}</Td>
              <Td cls="text-right text-emerald-300">{fmtOI(r.callOI)}</Td>
              <Td cls="text-right">{r.callPct}%</Td>
              <Td><OIBar pct={r.callPct} color="bg-emerald-500" /></Td>
              <Td cls="text-right text-red-300">{fmtOI(r.putOI)}</Td>
              <Td cls="text-right">{r.putPct}%</Td>
              <Td><OIBar pct={r.putPct} color="bg-red-500" /></Td>
              <Td cls="text-center">{r.isMaxPain ? <span className="text-amber-400 font-bold">★ MP</span> : ''}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OIChangeTab({ strikes }: { strikes: OptionStrike[] }) {
  const sorted = [...strikes].sort((a, b) =>
    Math.abs(b.ce.oiChange + b.pe.oiChange) - Math.abs(a.ce.oiChange + a.pe.oiChange),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            <Th>Strike</Th>
            <Th cls="text-right">Call OI Chg</Th>
            <Th>Call Signal</Th>
            <Th cls="text-right">Put OI Chg</Th>
            <Th>Put Signal</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sorted.map(s => (
            <tr key={s.strikePrice} className="hover:bg-slate-800/40">
              <Td cls="font-mono font-semibold text-slate-200">{s.strikePrice.toLocaleString('en-IN')}</Td>
              <Td cls={`text-right font-mono ${s.ce.oiChange > 0 ? 'text-emerald-400' : s.ce.oiChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                {s.ce.oiChange > 0 ? '+' : ''}{fmtOI(s.ce.oiChange)}
              </Td>
              <Td><SignalBadge signal={classifyOIChange(s.ce.oiChange, s.ce.ltp)} /></Td>
              <Td cls={`text-right font-mono ${s.pe.oiChange > 0 ? 'text-emerald-400' : s.pe.oiChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                {s.pe.oiChange > 0 ? '+' : ''}{fmtOI(s.pe.oiChange)}
              </Td>
              <Td><SignalBadge signal={classifyOIChange(s.pe.oiChange, s.pe.ltp)} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeltaOITab({ strikes }: { strikes: OptionStrike[] }) {
  const rows = calcDeltaOI(strikes);
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.netDeltaOI)), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            <Th>Strike</Th>
            <Th cls="text-right">Call Delta</Th>
            <Th cls="text-right">Call Δ×OI</Th>
            <Th cls="text-right">Put Delta</Th>
            <Th cls="text-right">Put Δ×OI</Th>
            <Th cls="text-right">Net Δ OI</Th>
            <Th>Net Bias</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {rows.map(r => (
            <tr key={r.strikePrice} className="hover:bg-slate-800/40">
              <Td cls="font-mono font-semibold text-slate-200">{r.strikePrice.toLocaleString('en-IN')}</Td>
              <Td cls="text-right text-sky-400">{r.callDelta}</Td>
              <Td cls="text-right text-emerald-400">{fmtOI(r.callDeltaOI)}</Td>
              <Td cls="text-right text-sky-400">{r.putDelta}</Td>
              <Td cls="text-right text-red-400">{fmtOI(r.putDeltaOI)}</Td>
              <Td cls={`text-right font-semibold ${r.netDeltaOI > 0 ? 'text-emerald-400' : r.netDeltaOI < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                {r.netDeltaOI > 0 ? '+' : ''}{fmtOI(r.netDeltaOI)}
              </Td>
              <Td>
                <div className="flex items-center gap-1">
                  <div
                    className={`h-1.5 rounded-full ${r.netDeltaOI > 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min((Math.abs(r.netDeltaOI) / maxAbs) * 60, 60)}px` }}
                  />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StrikePCRTab({ strikes, atmStrike }: { strikes: OptionStrike[]; atmStrike: number }) {
  const sorted = [...strikes].sort((a, b) => Math.abs(a.strikePrice - atmStrike) - Math.abs(b.strikePrice - atmStrike));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            <Th>Strike</Th>
            <Th cls="text-right">Call OI</Th>
            <Th cls="text-right">Put OI</Th>
            <Th cls="text-right">PCR</Th>
            <Th>Signal</Th>
            <Th cls="text-right">Dist from ATM</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sorted.map(s => {
            const pcr  = calcStrikePCR(s);
            const dist = +((Math.abs(s.strikePrice - atmStrike) / atmStrike) * 100).toFixed(1);
            const pcrSig = pcr >= 1.3 ? 'Bullish' : pcr <= 0.7 ? 'Bearish' : 'Neutral';
            return (
              <tr key={s.strikePrice} className={`hover:bg-slate-800/40 ${s.strikePrice === atmStrike ? 'bg-emerald-950/30' : ''}`}>
                <Td cls="font-mono font-semibold text-slate-200">
                  {s.strikePrice.toLocaleString('en-IN')}
                  {s.strikePrice === atmStrike && <span className="ml-1 text-emerald-500 text-[9px]">ATM</span>}
                </Td>
                <Td cls="text-right text-emerald-300">{fmtOI(s.ce.oi)}</Td>
                <Td cls="text-right text-red-300">{fmtOI(s.pe.oi)}</Td>
                <Td cls={`text-right font-mono font-semibold ${pcr >= 1.3 ? 'text-emerald-400' : pcr <= 0.7 ? 'text-red-400' : 'text-amber-400'}`}>{pcr}</Td>
                <Td>
                  <span className={`text-xs font-medium ${pcr >= 1.3 ? 'text-emerald-400' : pcr <= 0.7 ? 'text-red-400' : 'text-amber-400'}`}>
                    {pcrSig}
                  </span>
                </Td>
                <Td cls="text-right text-slate-400">{dist}%</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IVSmileTab({ strikes, atmStrike }: { strikes: OptionStrike[]; atmStrike: number }) {
  const sorted = [...strikes].sort((a, b) => Math.abs(a.strikePrice - atmStrike) - Math.abs(b.strikePrice - atmStrike));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            <Th>Strike</Th>
            <Th cls="text-right">Call IV%</Th>
            <Th cls="text-right">Put IV%</Th>
            <Th cls="text-right">IV Spread</Th>
            <Th>IV Level</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sorted.map(s => {
            const spread = +(Math.abs(s.ce.iv - s.pe.iv)).toFixed(1);
            const avgIV  = ((s.ce.iv + s.pe.iv) / 2);
            const ivLevel = avgIV > 30 ? 'High' : avgIV > 15 ? 'Moderate' : 'Low';
            return (
              <tr key={s.strikePrice} className={`hover:bg-slate-800/40 ${s.strikePrice === atmStrike ? 'bg-emerald-950/30' : ''}`}>
                <Td cls="font-mono font-semibold text-slate-200">
                  {s.strikePrice.toLocaleString('en-IN')}
                  {s.strikePrice === atmStrike && <span className="ml-1 text-emerald-500 text-[9px]">ATM</span>}
                </Td>
                <Td cls="text-right text-emerald-300">{s.ce.iv > 0 ? `${s.ce.iv.toFixed(1)}%` : '—'}</Td>
                <Td cls="text-right text-red-300">{s.pe.iv > 0 ? `${s.pe.iv.toFixed(1)}%` : '—'}</Td>
                <Td cls="text-right text-amber-400">{spread > 0 ? `${spread}%` : '—'}</Td>
                <Td>
                  <span className={`text-xs font-medium ${ivLevel === 'High' ? 'text-red-400' : ivLevel === 'Moderate' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {avgIV > 0 ? ivLevel : '—'}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PCRTrendTab({ strikes, atmStrike, pcr }: { strikes: OptionStrike[]; atmStrike: number; pcr: number }) {
  const atmPCR = calcATMZonePCR(strikes, atmStrike, 5);
  const pcrInterpretation = pcr >= 1.5 ? 'Strong Bullish — heavy put writing at key strikes'
    : pcr >= 1.2  ? 'Moderately Bullish — put writers dominant'
    : pcr >= 0.8  ? 'Neutral — balanced call/put activity'
    : pcr >= 0.5  ? 'Moderately Bearish — call writers dominant'
    : 'Strong Bearish — heavy call writing, market expected to fall';

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Overall PCR',   value: pcr.toString(),    color: pcr >= 1.2 ? 'text-emerald-400' : pcr <= 0.8 ? 'text-red-400' : 'text-amber-400' },
          { label: 'ATM Zone PCR',  value: atmPCR.toString(), color: atmPCR >= 1.2 ? 'text-emerald-400' : atmPCR <= 0.8 ? 'text-red-400' : 'text-amber-400' },
          { label: 'Total Call OI', value: fmtOI(strikes.reduce((a, s) => a + s.ce.oi, 0)), color: 'text-emerald-300' },
          { label: 'Total Put OI',  value: fmtOI(strikes.reduce((a, s) => a + s.pe.oi, 0)), color: 'text-red-300' },
          { label: 'Call OI Chg',   value: fmtOI(strikes.reduce((a, s) => a + s.ce.oiChange, 0)), color: 'text-slate-200' },
          { label: 'Put OI Chg',    value: fmtOI(strikes.reduce((a, s) => a + s.pe.oiChange, 0)), color: 'text-slate-200' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800 rounded-lg px-4 py-3 text-center">
            <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Interpretation */}
      <div className={`rounded-lg px-4 py-3 text-sm border ${pcr >= 1.2 ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300' : pcr <= 0.8 ? 'bg-red-950/30 border-red-800 text-red-300' : 'bg-amber-950/30 border-amber-800 text-amber-300'}`}>
        <p className="font-semibold mb-1">Market Interpretation</p>
        <p>{pcrInterpretation}</p>
      </div>

      {/* PCR guide */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-slate-300 mb-2">PCR Reference Levels</p>
        {[
          { range: 'PCR > 1.5', label: 'Strongly Bullish', color: 'text-emerald-400' },
          { range: 'PCR 1.2–1.5', label: 'Moderately Bullish', color: 'text-emerald-300' },
          { range: 'PCR 0.8–1.2', label: 'Neutral / Sideways', color: 'text-amber-400' },
          { range: 'PCR 0.5–0.8', label: 'Moderately Bearish', color: 'text-red-300' },
          { range: 'PCR < 0.5', label: 'Strongly Bearish', color: 'text-red-400' },
        ].map(({ range, label, color }) => (
          <div key={range} className="flex justify-between">
            <span className="font-mono">{range}</span>
            <span className={color}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopStrikesTab({ strikes }: { strikes: OptionStrike[] }) {
  const topCalls = topCallStrikes(strikes, 7);
  const topPuts  = topPutStrikes(strikes, 7);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <p className="text-sm font-semibold text-emerald-400 mb-2">Top Call OI Strikes (Resistance)</p>
        <table className="w-full text-xs">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
              <Th cls="text-left">Strike</Th>
              <Th cls="text-right">OI</Th>
              <Th cls="text-right">OI Chg</Th>
              <Th cls="text-right">LTP</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {topCalls.map((r, i) => (
              <tr key={r.strikePrice} className="hover:bg-slate-800/40">
                <Td cls="font-mono font-semibold text-slate-200">
                  {i === 0 && <span className="text-emerald-500 mr-1">▶</span>}
                  {r.strikePrice.toLocaleString('en-IN')}
                </Td>
                <Td cls="text-right text-emerald-300">{fmtOI(r.oi)}</Td>
                <Td cls={`text-right ${r.oiChange > 0 ? 'text-emerald-400' : r.oiChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                  {r.oiChange > 0 ? '+' : ''}{fmtOI(r.oiChange)}
                </Td>
                <Td cls="text-right text-slate-200">{fmt(r.ltp)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-sm font-semibold text-red-400 mb-2">Top Put OI Strikes (Support)</p>
        <table className="w-full text-xs">
          <thead className="bg-slate-900 border-b border-slate-800">
            <tr>
              <Th cls="text-left">Strike</Th>
              <Th cls="text-right">OI</Th>
              <Th cls="text-right">OI Chg</Th>
              <Th cls="text-right">LTP</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {topPuts.map((r, i) => (
              <tr key={r.strikePrice} className="hover:bg-slate-800/40">
                <Td cls="font-mono font-semibold text-slate-200">
                  {i === 0 && <span className="text-red-500 mr-1">▶</span>}
                  {r.strikePrice.toLocaleString('en-IN')}
                </Td>
                <Td cls="text-right text-red-300">{fmtOI(r.oi)}</Td>
                <Td cls={`text-right ${r.oiChange > 0 ? 'text-emerald-400' : r.oiChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                  {r.oiChange > 0 ? '+' : ''}{fmtOI(r.oiChange)}
                </Td>
                <Td cls="text-right text-slate-200">{fmt(r.ltp)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OIInterpretationTab({ strikes }: { strikes: OptionStrike[] }) {
  const rows = calcOIInterpretation(strikes);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            <Th cls="text-left">Strike</Th>
            <Th>Side</Th>
            <Th cls="text-right">OI</Th>
            <Th cls="text-right">OI Change</Th>
            <Th cls="text-right">LTP</Th>
            <Th>Signal</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {rows.map((r, i) => (
            <tr key={`${r.strikePrice}-${r.side}`} className="hover:bg-slate-800/40">
              <Td cls="font-mono font-semibold text-slate-200">
                <span className="text-slate-500 mr-1.5 text-[10px]">{i + 1}.</span>
                {r.strikePrice.toLocaleString('en-IN')}
              </Td>
              <Td>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.side === 'CE' ? 'bg-emerald-800 text-white' : 'bg-red-800 text-white'}`}>
                  {r.side}
                </span>
              </Td>
              <Td cls="text-right text-slate-200">{fmtOI(r.oi)}</Td>
              <Td cls={`text-right ${r.oiChange > 0 ? 'text-emerald-400' : r.oiChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                {r.oiChange > 0 ? '+' : ''}{fmtOI(r.oiChange)}
              </Td>
              <Td cls="text-right text-slate-300">{fmt(r.ltp)}</Td>
              <Td><SignalBadge signal={r.signal} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OICorrelationTab({ strikes }: { strikes: OptionStrike[] }) {
  const rows = strikes.map(s => ({
    strikePrice: s.strikePrice,
    ceOI: s.ce.oi, ceVol: s.ce.volume, ceRatio: s.ce.volume > 0 ? +(s.ce.oi / s.ce.volume).toFixed(1) : 0,
    peOI: s.pe.oi, peVol: s.pe.volume, peRatio: s.pe.volume > 0 ? +(s.pe.oi / s.pe.volume).toFixed(1) : 0,
  })).sort((a, b) => (b.ceOI + b.peOI) - (a.ceOI + a.peOI));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-900 border-b border-slate-800">
          <tr>
            <Th>Strike</Th>
            <Th cls="text-right">Call OI</Th>
            <Th cls="text-right">Call Vol</Th>
            <Th cls="text-right">Call OI/Vol</Th>
            <Th cls="text-right">Put OI</Th>
            <Th cls="text-right">Put Vol</Th>
            <Th cls="text-right">Put OI/Vol</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {rows.map(r => (
            <tr key={r.strikePrice} className="hover:bg-slate-800/40">
              <Td cls="font-mono font-semibold text-slate-200">{r.strikePrice.toLocaleString('en-IN')}</Td>
              <Td cls="text-right text-emerald-300">{fmtOI(r.ceOI)}</Td>
              <Td cls="text-right text-slate-400">{fmtOI(r.ceVol)}</Td>
              <Td cls={`text-right ${r.ceRatio > 5 ? 'text-amber-400' : 'text-slate-300'}`}>{r.ceRatio || '—'}</Td>
              <Td cls="text-right text-red-300">{fmtOI(r.peOI)}</Td>
              <Td cls="text-right text-slate-400">{fmtOI(r.peVol)}</Td>
              <Td cls={`text-right ${r.peRatio > 5 ? 'text-amber-400' : 'text-slate-300'}`}>{r.peRatio || '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MultiExpiryTab({
  symbol, expiries, currentExpiry, creds,
}: {
  symbol: string;
  expiries: string[];
  currentExpiry: string;
  creds: ReturnType<typeof useDhanCredentials>;
}) {
  const [nextExpiry, setNextExpiry] = useState('');
  const [nextData,   setNextData]   = useState<OptionChainData | null>(null);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    const idx = expiries.indexOf(currentExpiry);
    if (idx >= 0 && idx + 1 < expiries.length) setNextExpiry(expiries[idx + 1]);
  }, [expiries, currentExpiry]);

  async function loadNext() {
    if (!nextExpiry) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/dhan/option-chain?symbol=${symbol}&expiry=${nextExpiry}`, { headers: creds.headers });
      const json = await res.json() as OptionChainData;
      setNextData(json);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  if (!nextExpiry) {
    return <p className="text-slate-500 text-sm py-4">No next expiry available.</p>;
  }

  const nextStrikes = nextData?.strikes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-slate-300 text-sm">Compare with:</span>
        <select value={nextExpiry} onChange={e => { setNextExpiry(e.target.value); setNextData(null); }}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none">
          {expiries.filter(e => e !== currentExpiry).map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button onClick={loadNext} disabled={loading}
          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded">
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {nextStrikes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 border-b border-slate-800">
              <tr>
                <Th>Strike</Th>
                <Th cls="text-right">{currentExpiry} Call OI</Th>
                <Th cls="text-right">{nextExpiry} Call OI</Th>
                <Th cls="text-right">{currentExpiry} Put OI</Th>
                <Th cls="text-right">{nextExpiry} Put OI</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {nextStrikes.map(ns => {
                const sp = ns.strikePrice;
                return (
                  <tr key={sp} className="hover:bg-slate-800/40">
                    <Td cls="font-mono font-semibold text-slate-200">{sp.toLocaleString('en-IN')}</Td>
                    <Td cls="text-right text-emerald-300">—</Td>
                    <Td cls="text-right text-emerald-400">{fmtOI(ns.ce.oi)}</Td>
                    <Td cls="text-right text-red-300">—</Td>
                    <Td cls="text-right text-red-400">{fmtOI(ns.pe.oi)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  'OI Distribution', 'OI Change', 'Delta OI', 'PCR by Strike',
  'IV Smile', 'PCR Trend', 'Top Strikes', 'OI Interpretation',
  'OI Correlation', 'Multi-Expiry',
] as const;

type Tab = typeof TABS[number];

// ── Main page ─────────────────────────────────────────────────────────────────


export default function OIAnalysisPage() {
  const creds = useDhanCredentials();

  const [symbol,   setSymbol]   = useState('NIFTY');
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry,   setExpiry]   = useState('');
  const [data,     setData]     = useState<OptionChainData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [tab,      setTab]      = useState<Tab>('OI Distribution');

  const loadExpiries = useCallback(async (sym: string) => {
    if (!creds.isConfigured) return;
    setExpiries([]);
    setExpiry('');
    setData(null);
    try {
      const res  = await fetch(`/api/dhan/expiry?symbol=${sym}`, { headers: creds.headers });
      const json = await res.json() as { expiries?: string[] };
      const list = json.expiries ?? [];
      setExpiries(list);
      if (list.length > 0) setExpiry(list[0]);
    } catch { /* ignore */ }
  }, [creds]);

  const loadChain = useCallback(async () => {
    if (!creds.isConfigured || !expiry) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/dhan/option-chain?symbol=${symbol}&expiry=${expiry}`, { headers: creds.headers });
      const json = await res.json() as OptionChainData & { error?: string };
      if (!res.ok) { setError((json as { error?: string }).error ?? 'Failed'); return; }
      setData(json);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [creds, symbol, expiry]);

  useEffect(() => { loadExpiries(symbol); }, [symbol, loadExpiries]);
  useEffect(() => { if (expiry) loadChain(); }, [expiry, loadChain]);

  if (!creds.isConfigured) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-2xl font-bold text-slate-300">Dhan API Not Configured</p>
        <p className="text-slate-400">OI Analysis requires a Dhan broker API key.</p>
        <a href="/settings" className="inline-block mt-3 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-sm transition-colors">
          Go to Settings
        </a>
      </main>
    );
  }

  const strikes   = data?.strikes ?? [];
  const spotPrice = data?.underlyingPrice ?? 0;
  const atmStrike = strikes.length > 0 ? findATM(strikes, spotPrice) : 0;
  const maxPain   = strikes.length > 0 ? calcMaxPain(strikes) : 0;
  const pcr       = strikes.length > 0 ? calcPCR(strikes) : 0;

  return (
    <main className="w-full px-4 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">OI Analysis</h1>
          <p className="text-slate-400 text-sm mt-0.5">10 analytical views of open interest data</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SymbolSearch value={symbol} onChange={s => { setSymbol(s); setData(null); }} />
          <select value={expiry} onChange={e => setExpiry(e.target.value)} disabled={expiries.length === 0}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50">
            {expiries.length === 0 && <option value="">Loading…</option>}
            {expiries.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <button onClick={loadChain} disabled={loading || !expiry}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded text-sm transition-colors">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-950/40 border border-red-800 rounded px-3 py-2 text-red-400 text-sm">{error}</div>}

      {/* Summary row */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Spot', value: spotPrice.toLocaleString('en-IN'), color: 'text-slate-100' },
            { label: 'ATM', value: atmStrike.toLocaleString('en-IN'), color: 'text-emerald-400' },
            { label: 'Max Pain', value: maxPain.toLocaleString('en-IN'), color: 'text-amber-400' },
            { label: 'PCR', value: pcr.toString(), color: pcr >= 1.2 ? 'text-emerald-400' : pcr <= 0.8 ? 'text-red-400' : 'text-amber-400' },
            { label: 'Strikes', value: strikes.length.toString(), color: 'text-slate-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-center">
              <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-400 text-sm">Fetching OI data for {symbol} {expiry}…</p>
        </div>
      )}

      {/* Sub-tabs */}
      {data && !loading && strikes.length > 0 && (
        <div className="space-y-0">
          <div className="flex flex-wrap gap-1 border-b border-slate-700 pb-0">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 rounded-t text-xs font-semibold transition-colors border-b-2 ${
                  tab === t
                    ? 'border-emerald-500 text-emerald-400 bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="bg-slate-900/60 border-x border-b border-slate-700 rounded-b-xl overflow-hidden">
            <div className="p-0">
              {tab === 'OI Distribution'   && <OIDistributionTab strikes={strikes} maxPain={maxPain} />}
              {tab === 'OI Change'         && <OIChangeTab strikes={strikes} />}
              {tab === 'Delta OI'          && <DeltaOITab strikes={strikes} />}
              {tab === 'PCR by Strike'     && <StrikePCRTab strikes={strikes} atmStrike={atmStrike} />}
              {tab === 'IV Smile'          && <IVSmileTab strikes={strikes} atmStrike={atmStrike} />}
              {tab === 'PCR Trend'         && <div className="p-4"><PCRTrendTab strikes={strikes} atmStrike={atmStrike} pcr={pcr} /></div>}
              {tab === 'Top Strikes'       && <div className="p-4"><TopStrikesTab strikes={strikes} /></div>}
              {tab === 'OI Interpretation' && <OIInterpretationTab strikes={strikes} />}
              {tab === 'OI Correlation'    && <OICorrelationTab strikes={strikes} />}
              {tab === 'Multi-Expiry'      && (
                <div className="p-4">
                  <MultiExpiryTab symbol={symbol} expiries={expiries} currentExpiry={expiry} creds={creds} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && !data && !error && creds.isConfigured && (
        <div className="text-center py-16 text-slate-500">
          <p>Select symbol and expiry to load OI analysis.</p>
        </div>
      )}
    </main>
  );
}
