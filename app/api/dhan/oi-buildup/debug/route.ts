import { NextRequest, NextResponse } from 'next/server';
import { dhanHeaders } from '@/lib/dhan-api';

export const maxDuration = 55;

export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  const out: Record<string, unknown> = {};

  // ── 1. Inspect scrip master CSV ───────────────────────────────────────────
  try {
    const t0   = Date.now();
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 28_000);
    const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', {
      cache: 'no-store', signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stockscreener/1.0)' },
    });
    out.csvStatus      = res.status;
    out.csvContentType = res.headers.get('content-type');
    out.csvOk          = res.ok;

    if (res.ok) {
      const text = await res.text();
      out.csvBytes      = text.length;
      out.csvTotalLines = text.split('\n').length;
      out.csvDownloadMs = Date.now() - t0;
      out.csvFirst300   = text.slice(0, 300);

      const lines = text.split('\n');
      const hdrs  = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim().replace(/['"]/g, ''));
      out.headers = hdrs;

      const iSeg    = hdrs.indexOf('SEM_SEGMENT');
      const iInstr  = hdrs.indexOf('SEM_INSTRUMENT_NAME');
      const iSecId  = hdrs.indexOf('SEM_SMST_SECURITY_ID');
      const iExpiry = hdrs.indexOf('SEM_EXPIRY_DATE');
      const iTrade  = hdrs.indexOf('SEM_TRADING_SYMBOL');
      out.colIndices = { iSeg, iInstr, iSecId, iExpiry, iTrade };

      const today = new Date().toISOString().split('T')[0];
      const segCounts: Record<string, number> = {};
      const instrCountsInNSE_FO: Record<string, number> = {};
      const futRows: Record<string, string>[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols  = lines[i].split(',');
        const seg   = cols[iSeg]?.trim().replace(/['"]/g, '') ?? '';
        const instr = cols[iInstr]?.trim().replace(/['"]/g, '') ?? '';
        const trading = (cols[iTrade]?.trim().replace(/['"]/g, '') ?? '').toUpperCase();

        // Count all segments for the FUT rows
        if (trading.endsWith('FUT')) {
          segCounts[seg] = (segCounts[seg] ?? 0) + 1;
          if (futRows.length < 15) {
            const exp = (cols[iExpiry]?.trim().replace(/['"]/g, '') ?? '').split(' ')[0];
            if (exp >= today) {
              futRows.push({ secId: cols[iSecId]?.trim().replace(/['"]/g, '') ?? '', seg, instr, expiry: exp, trading });
            }
          }
        }

        // Also count instrument types within NSE_FO for reference
        if (seg === 'NSE_FO') {
          instrCountsInNSE_FO[instr] = (instrCountsInNSE_FO[instr] ?? 0) + 1;
        }
      }
      out.futSegmentCounts    = segCounts;
      out.instrCountsInNSE_FO = instrCountsInNSE_FO;
      out.sampleFutRows       = futRows;

      // Test symbol matching for a few known symbols
      const testSyms = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'HDFCBANK', 'BAJAJ-AUTO', 'LT', 'LTF'];
      const matchTest: Record<string, string> = {};
      for (const sym of testSyms) {
        const upper    = sym.toUpperCase();
        const stripped = sym.replace(/[-&]/g, '').toUpperCase();
        const keys     = stripped !== upper ? [upper, stripped] : [upper];
        const matched  = futRows.find(r => keys.some(k => r.trading.startsWith(k) && /\d/.test(r.trading[k.length] ?? '')));
        matchTest[sym] = matched ? `${matched.trading} (${matched.secId})` : 'NO MATCH in sample';
      }
      out.symbolMatchTest = matchTest;
    } else {
      out.csvBodyPreview = await res.text().then(t => t.slice(0, 300)).catch(() => '');
    }
  } catch (e) {
    out.csvError = String(e);
  }

  // ── 2. Market feed test with first found secId ────────────────────────────
  if (clientId && accessToken) {
    const rows = out.sampleFutRows as { secId: string }[] | undefined;
    const firstId = rows?.[0]?.secId ? parseInt(rows[0].secId, 10) : 0;
    if (firstId) {
      try {
        const res = await fetch('https://api.dhan.co/v2/marketfeed/quote', {
          method:  'POST',
          headers: dhanHeaders(clientId, accessToken),
          body:    JSON.stringify({ NSE_FO: [firstId] }),
        });
        out.mfStatus      = res.status;
        out.mfTestSecId   = firstId;
        out.mfResponse    = await res.json().catch(() => null);
      } catch (e) {
        out.mfError = String(e);
      }
    }
  }

  return NextResponse.json(out);
}
