import { NextRequest, NextResponse } from 'next/server';
import { dhanHeaders } from '@/lib/dhan-api';

export const maxDuration = 55;

function prevDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  const out: Record<string, unknown> = {};
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = prevDay(today);
  const weekAgo   = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().split('T')[0]; })();
  out.serverDate  = today;
  out.yesterday   = yesterday;

  // ── 1. Scrip master: count NSE futures + sample rows ─────────────────────
  let sampleSecId = 62329; // NIFTY-Jun2026-FUT fallback
  let sampleInstr: 'FUTSTK' | 'FUTIDX' = 'FUTIDX';
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 28_000);
    const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', {
      cache: 'no-store', signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stockscreener/1.0)' },
    });
    out.csvStatus = res.status;
    if (res.ok) {
      const text  = await res.text();
      const lines = text.split('\n');
      const hdrs  = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim().replace(/['"]/g, ''));
      out.headers = hdrs.slice(0, 16);

      const iExch    = hdrs.indexOf('SEM_EXM_EXCH_ID');
      const iInstr   = hdrs.indexOf('SEM_INSTRUMENT_NAME');
      const iSecId   = hdrs.indexOf('SEM_SMST_SECURITY_ID');
      const iExpiry  = hdrs.indexOf('SEM_EXPIRY_DATE');
      const iTrade   = hdrs.indexOf('SEM_TRADING_SYMBOL');

      const futRows: Record<string, string>[] = [];
      let nseFutCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols  = lines[i].split(',');
        const exch  = cols[iExch]?.trim() ?? '';
        const instr = cols[iInstr]?.trim().replace(/['"]/g, '') ?? '';
        if (exch !== 'NSE' || (instr !== 'FUTSTK' && instr !== 'FUTIDX')) continue;
        nseFutCount++;
        if (futRows.length < 10) {
          const trading = cols[iTrade]?.trim().replace(/['"]/g, '') ?? '';
          const exp = (cols[iExpiry]?.trim().replace(/['"]/g, '') ?? '').split(' ')[0];
          if (exp > today) {
            const id = cols[iSecId]?.trim().replace(/['"]/g, '') ?? '';
            futRows.push({ secId: id, exch, instr, expiry: exp, trading });
            if (futRows.length === 1) {
              sampleSecId = parseInt(id, 10) || sampleSecId;
              sampleInstr = instr as 'FUTSTK' | 'FUTIDX';
            }
          }
        }
      }
      out.nseFuturesCount = nseFutCount;
      out.sampleFutRows   = futRows;
      out.testSecId       = sampleSecId;
      out.testInstr       = sampleInstr;
    }
  } catch (e) { out.csvError = String(e); }

  if (!clientId || !accessToken) {
    out.authNote = 'No Dhan credentials in request headers — API tests skipped';
    return NextResponse.json(out);
  }

  // ── 2. Historical API: fromDate=yesterday toDate=today ────────────────────
  try {
    const r = await fetch('https://api.dhan.co/v2/charts/historical', {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({
        securityId:      String(sampleSecId),
        exchangeSegment: 'NSE_FO',
        instrument:      sampleInstr,
        expiryCode:      0,
        fromDate:        yesterday,
        toDate:          today,
      }),
    });
    out.histA_status = r.status;
    out.histA_label  = `fromDate=${yesterday} toDate=${today}`;
    out.histA_body   = await r.json().catch(() => null);
  } catch (e) { out.histA_error = String(e); }

  // ── 3. Historical API: fromDate=weekAgo toDate=yesterday ─────────────────
  try {
    const r = await fetch('https://api.dhan.co/v2/charts/historical', {
      method: 'POST',
      headers: dhanHeaders(clientId, accessToken),
      body: JSON.stringify({
        securityId:      String(sampleSecId),
        exchangeSegment: 'NSE_FO',
        instrument:      sampleInstr,
        expiryCode:      0,
        fromDate:        weekAgo,
        toDate:          yesterday,
      }),
    });
    out.histB_status = r.status;
    out.histB_label  = `fromDate=${weekAgo} toDate=${yesterday}`;
    out.histB_body   = await r.json().catch(() => null);
  } catch (e) { out.histB_error = String(e); }

  // ── 4. Market feed (quick sanity check) ───────────────────────────────────
  try {
    const r = await fetch('https://api.dhan.co/v2/marketfeed/quote', {
      method:  'POST',
      headers: dhanHeaders(clientId, accessToken),
      body:    JSON.stringify({ NSE_FO: [sampleSecId] }),
    });
    out.mf_status = r.status;
    out.mf_body   = await r.json().catch(() => null);
  } catch (e) { out.mf_error = String(e); }

  return NextResponse.json(out);
}
