import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

export const maxDuration = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BasketStock {
  rank:       number;
  name:       string;
  symbol:     string;
  bse?:       boolean;
  tier:       'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP';
  mcap?:      string;
  entryDate:  string;
  entry:      number;
  macroFill?: boolean;
  stale?:     boolean;
  keySignal:  string;
  stance:     'ACCUMULATE' | 'WATCH' | 'MACRO' | 'RERATING';
}

export interface ScuttlebuttBasket {
  id:          string;
  fileName:    string;
  runDate:     string;
  basketName:  string;
  basketRead:  string;
  topMover?:   { name: string; pct: number };
  weakSpot?:   { name: string; pct: number };
  stocks:      BasketStock[];
}

interface BlobData {
  version:        number;
  processedFiles: string[];
  baskets:        ScuttlebuttBasket[];
}

// ── Graph helpers (same credentials as AAStockWorld) ─────────────────────────

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

async function listScuttlebuttFiles(token: string): Promise<Array<{ id: string; name: string }>> {
  const base = FOLDER_ID
    ? `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${FOLDER_ID}/children`
    : `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodeURIComponent(FOLDER_PATH)}:/children`;
  const res  = await fetch(`${base}?$top=200&$select=id,name,folder`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as { value?: Array<{ id: string; name: string; folder?: unknown }>; error?: { message?: string } };
  if (data.error) throw new Error(`Graph list: ${data.error.message}`);
  return (data.value ?? []).filter(f => !f.folder && /scuttlebuttbasket/i.test(f.name) && /\.pdf$/i.test(f.name))
    .map(f => ({ id: f.id, name: f.name }));
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

async function extractBasket(pdfBuffer: Buffer, fileName: string): Promise<ScuttlebuttBasket> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured in this Vercel project');

  const prompt = `You are reading a "Scuttlebutt Basket" equity research PDF that tracks a portfolio of 20 Indian stocks split across 4 cap tiers (5 each: LARGECAP, MIDCAP, SMALLCAP, MICROCAP).

Return ONLY valid JSON — no markdown, no extra text. Match this exact structure:

{
  "runDate": "2026-09-13",
  "basketName": "Sep 2026",
  "basketRead": "one-paragraph basket read summary",
  "topMover": { "name": "ASM Technologies", "pct": 58.5 },
  "weakSpot": { "name": "Bajaj Finserv", "pct": -11.2 },
  "stocks": [
    {
      "rank": 1,
      "name": "Full Company Name",
      "symbol": "NSESYMBOL",
      "tier": "LARGECAP",
      "entryDate": "Aug 9",
      "entry": 2009.00,
      "macroFill": false,
      "stale": false,
      "keySignal": "thesis note verbatim from PDF",
      "stance": "ACCUMULATE"
    }
  ]
}

Rules:
- tier: must be exactly LARGECAP, MIDCAP, SMALLCAP, or MICROCAP
- stance: ACCUMULATE | WATCH | MACRO | RERATING
  · MACRO = macro-theme picks with no specific entry price (entry=0, macroFill=true)
  · RERATING = stocks flagged as already re-rated / dramatic move already in price
- symbol: NSE ticker (e.g. BAJAJFINSV, HINDALCO, OIL, MARUTI, APLAPOLLO, DELHIVERY)
  · For BSE-only micro-caps use BSE code if known, else use closest reasonable abbreviation
- entry: the numeric entry price; use 0 when macroFill=true
- macroFill: true only when the PDF shows "-- (macro fill)" or no entry price for macro theme
- stale: true when the PDF shows price in italics or marks it as stale/last-week
- entryDate: e.g. "Aug 9", "Jul 3", "Sep 2", "—" for macro fills
- Extract ALL stocks from all 4 cap tiers (should total 20)
- runDate: from "Data as of:" line in the PDF footer (YYYY-MM-DD format)
- basketName: e.g. "Sep 2026" from the title "Scuttlebutt Basket -- September 2026"
- keySignal: copy the thesis/note column verbatim`;

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
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find(c => c.type === 'text')?.text ?? '';

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude returned no JSON');

  const extracted = JSON.parse(match[0]) as {
    runDate: string; basketName: string; basketRead: string;
    topMover?: { name: string; pct: number }; weakSpot?: { name: string; pct: number };
    stocks: BasketStock[];
  };

  const id = extracted.basketName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

  return { id, fileName, ...extracted };
}

// ── Blob helpers ──────────────────────────────────────────────────────────────

const BLOB_KEY = 'scuttlebutt-baskets.json';

async function readBlob(): Promise<BlobData> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return { version: 1, processedFiles: [], baskets: [] };
    const res  = await fetch(blobs[0].url, { cache: 'no-store' });
    return await res.json() as BlobData;
  } catch {
    return { version: 1, processedFiles: [], baskets: [] };
  }
}

async function writeBlob(data: BlobData): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  });
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** GET — return current basket list */
export async function GET() {
  try {
    const data = await readBlob();
    return NextResponse.json({ baskets: data.baskets, processedFiles: data.processedFiles });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST — scan OneDrive, extract new Scuttlebutt PDFs, update blob */
export async function POST() {
  try {
    const token = await graphToken();
    const files  = await listScuttlebuttFiles(token);
    const data   = await readBlob();

    const results: string[] = [];
    let synced = 0;

    for (const file of files) {
      if (data.processedFiles.includes(file.name)) {
        results.push(`skip: ${file.name} (already processed)`);
        continue;
      }
      try {
        const buf    = await downloadFile(token, file.id);
        const basket = await extractBasket(buf, file.name);
        // Replace any existing basket with same id
        data.baskets = data.baskets.filter(b => b.id !== basket.id);
        data.baskets.push(basket);
        data.processedFiles.push(file.name);
        synced++;
        results.push(`ok: ${file.name} → "${basket.basketName}" (${basket.stocks.length} stocks)`);
      } catch (e) {
        results.push(`error: ${file.name} — ${String(e).slice(0, 120)}`);
      }
    }

    // Sort newest first by runDate
    data.baskets.sort((a, b) => b.runDate.localeCompare(a.runDate));

    if (synced > 0) await writeBlob(data);

    return NextResponse.json({ synced, total: data.baskets.length, results, baskets: data.baskets });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
