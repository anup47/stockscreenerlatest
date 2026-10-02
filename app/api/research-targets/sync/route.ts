import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

export const maxDuration = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TargetOverride {
  company: string;
  baseTarget: number | null;
  bullTarget: number | null;
  researchCmp: number | null;
  stance: 'ACCUMULATE' | 'WATCH' | 'AVOID' | null;
  horizon: string | null;
  note: string | null;
  sourceFile: string;
  syncedAt: string;
}

export interface TargetsBlob {
  version: number;
  processedFiles: string[];
  lastSync: string;
  overrides: Record<string, TargetOverride>; // keyed by uppercase NSE symbol
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

const DRIVE_ID    = process.env.GRAPH_DRIVE_ID    || 'b!LcM7MjLpqECPVA1oAGku5GTNwdNGnpZEk5y0fEC278Vi3k0yqnVQSqZRTvNCeYLH';
const FOLDER_ID   = process.env.GRAPH_RESEARCH_FOLDER_ID ?? '';
const FOLDER_PATH = process.env.GRAPH_RESEARCH_FOLDER_PATH
  || 'Tusk Equity/Direct Equity/ANUP_001/AAStockWorld/New research dashboards';

async function graphToken(): Promise<string> {
  const { AZURE_TENANT_ID: t, GRAPH_CLIENT_ID: c, GRAPH_CLIENT_SECRET: s } = process.env;
  if (!t || !c || !s) throw new Error('Missing Graph credentials (AZURE_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET)');
  const res = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c, client_secret: s, scope: 'https://graph.microsoft.com/.default' }),
  });
  const d = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!d.access_token) throw new Error(`Graph auth: ${d.error_description ?? d.error}`);
  return d.access_token;
}

async function listResearchPdfs(token: string): Promise<Array<{ id: string; name: string; lastModified: string }>> {
  const base = FOLDER_ID
    ? `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${FOLDER_ID}/children`
    : `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodeURIComponent(FOLDER_PATH)}:/children`;
  const res = await fetch(`${base}?$top=200&$select=id,name,folder,lastModifiedDateTime`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as {
    value?: Array<{ id: string; name: string; folder?: unknown; lastModifiedDateTime?: string }>;
    error?: { message?: string };
  };
  if (data.error) throw new Error(`Graph list: ${data.error.message}`);
  return (data.value ?? [])
    .filter(f => !f.folder && /\.pdf$/i.test(f.name) && !/scuttlebuttbasket/i.test(f.name))
    .map(f => ({ id: f.id, name: f.name, lastModified: f.lastModifiedDateTime ?? '' }))
    .sort((a, b) => a.lastModified.localeCompare(b.lastModified)); // oldest → newest, newest wins per symbol
}

async function downloadFile(token: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${fileId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Graph download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Claude PDF extraction ─────────────────────────────────────────────────────

function normaliseStance(raw: string | null): 'ACCUMULATE' | 'WATCH' | 'AVOID' | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (/BUY|ACCUMULATE|OUTPERFORM|OVERWEIGHT/.test(s)) return 'ACCUMULATE';
  if (/HOLD|NEUTRAL|WATCH|MARKET.?PERFORM/.test(s))  return 'WATCH';
  if (/SELL|AVOID|REDUCE|UNDERPERFORM/.test(s))       return 'AVOID';
  return null;
}

async function extractTargets(pdfBuffer: Buffer): Promise<{
  company: string;
  nseSymbol: string;
  researchCmp: number | null;
  baseTarget: number | null;
  bullTarget: number | null;
  stance: string | null;
  horizon: string | null;
  note: string | null;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const prompt = `You are reading an Indian equity research report. Extract the following and return ONLY a valid JSON object — no markdown, no explanation, no extra text.

{
  "company": "full company name",
  "nseSymbol": "NSE ticker symbol without .NS suffix (e.g. ALIVUS, BAJAJCON, KOPRAN, GRAVITA, HINDALCO)",
  "researchCmp": <current market price at time of research, plain number or null>,
  "baseTarget": <base-case / conservative target price, plain number or null>,
  "bullTarget": <bull-case / optimistic target price, plain number or null>,
  "stance": "ACCUMULATE" or "BUY" or "HOLD" or "WATCH" or "AVOID" or null,
  "horizon": "12M" or "18M" or "24M" or "3Y" or null,
  "note": "<one-line investment thesis, max 100 chars, or null>"
}

Rules:
- nseSymbol: NSE ticker only, no suffix. For BSE-only stocks use BSE code.
- If only one target exists (no base/bull split), put it in baseTarget and set bullTarget to null.
- All price values: plain number, no commas, no ₹ symbol.
- horizon: convert "1 year" → "12M", "18 months" → "18M", "2 years" → "24M", "3 years" → "3Y".
- note: copy the one-line thesis or recommendation rationale verbatim, under 100 chars.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find(c => c.type === 'text')?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  return JSON.parse(match[0]);
}

// ── Blob helpers ──────────────────────────────────────────────────────────────

export const BLOB_KEY = 'research-targets-overrides.json';

export async function readTargetsBlob(): Promise<TargetsBlob> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return { version: 1, processedFiles: [], lastSync: '', overrides: {} };
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    return await res.json() as TargetsBlob;
  } catch {
    return { version: 1, processedFiles: [], lastSync: '', overrides: {} };
  }
}

async function writeTargetsBlob(data: TargetsBlob): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  });
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** GET — return current overrides without triggering a sync */
export async function GET() {
  try {
    const data = await readTargetsBlob();
    return NextResponse.json({
      lastSync: data.lastSync,
      processedFiles: data.processedFiles.length,
      overrideCount: Object.keys(data.overrides).length,
      overrides: data.overrides,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST — scan OneDrive, extract new research PDFs, update blob */
export async function POST() {
  try {
    const token = await graphToken();
    const files  = await listResearchPdfs(token);
    const data   = await readTargetsBlob();

    const results: string[] = [];
    let synced = 0;

    for (const file of files) {
      if (data.processedFiles.includes(file.name)) {
        results.push(`skip: ${file.name}`);
        continue;
      }
      try {
        const buf       = await downloadFile(token, file.id);
        const extracted = await extractTargets(buf);
        const sym       = extracted.nseSymbol?.toUpperCase().trim();

        if (!sym) {
          results.push(`skip: ${file.name} — no NSE symbol extracted`);
          data.processedFiles.push(file.name);
          continue;
        }

        data.overrides[sym] = {
          company:    extracted.company,
          baseTarget: extracted.baseTarget,
          bullTarget: extracted.bullTarget,
          researchCmp: extracted.researchCmp,
          stance:    normaliseStance(extracted.stance),
          horizon:   extracted.horizon,
          note:      extracted.note,
          sourceFile: file.name,
          syncedAt:  new Date().toISOString(),
        };
        data.processedFiles.push(file.name);
        synced++;
        results.push(`ok: ${file.name} → ${sym} (base: ${extracted.baseTarget ?? '—'}, bull: ${extracted.bullTarget ?? '—'})`);
      } catch (e) {
        results.push(`error: ${file.name} — ${String(e).slice(0, 120)}`);
      }
    }

    data.lastSync = new Date().toISOString();
    await writeTargetsBlob(data);

    return NextResponse.json({
      synced,
      skipped:  files.length - synced - results.filter(r => r.startsWith('error')).length,
      errors:   results.filter(r => r.startsWith('error')).length,
      total:    Object.keys(data.overrides).length,
      results,
      overrides: data.overrides,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
