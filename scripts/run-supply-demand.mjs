#!/usr/bin/env node
// scripts/run-supply-demand.mjs
// Run supply-demand analysis locally via Ollama, then optionally upload to Vercel.
//
// Usage:
//   node scripts/run-supply-demand.mjs              # generate + save locally
//   node scripts/run-supply-demand.mjs --upload     # generate + save + push to Vercel Blob
//
// Env vars (all optional):
//   OLLAMA_BASE_URL   defaults to http://localhost:11434
//   OLLAMA_MODEL      defaults to qwen2.5:14b
//   SD_UPLOAD_SECRET  required for --upload
//   WEBAPP_URL        required for --upload (e.g. https://stockscreenerlatest.vercel.app)

import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const UPLOAD   = args.includes('--upload');
const modelArg = args.find(a => a.startsWith('--model='))?.split('=')[1];
const outArg   = args.find(a => a.startsWith('--output='))?.split('=')[1];

// Use 127.0.0.1 as default — Node.js on Windows resolves 'localhost' to ::1 (IPv6) which may fail
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '').replace('localhost', '127.0.0.1');
const MODEL       = modelArg ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:14b';
const OUTPUT_PATH = outArg ? resolve(outArg) : resolve(ROOT, 'supply-demand-snapshot.json');

// ── Live commodity prices ─────────────────────────────────────────────────────
const COMMODITY_TICKERS = {
  'Cocoa':               { ticker: 'CC=F',    unit: '$/tonne' },
  'Crude Oil (WTI)':     { ticker: 'CL=F',    unit: '$/barrel' },
  'Natural Gas':         { ticker: 'NG=F',    unit: '$/MMBtu' },
  'Copper':              { ticker: 'HG=F',    unit: '$/lb' },
  'Aluminium':           { ticker: 'ALI=F',   unit: '$/lb' },
  'Wheat':               { ticker: 'ZW=F',    unit: '¢/bushel' },
  'Soybean':             { ticker: 'ZS=F',    unit: '¢/bushel' },
  'Sugar':               { ticker: 'SB=F',    unit: '¢/lb' },
  'Cotton':              { ticker: 'CT=F',    unit: '¢/lb' },
  'Palm Oil':            { ticker: 'FCPO.BMD', unit: 'MYR/tonne' },
  'NVDA (AI proxy)':     { ticker: 'NVDA',    unit: '$/share' },
  'Micron (DRAM proxy)': { ticker: 'MU',      unit: '$/share' },
  'Lithium ETF':         { ticker: 'LIT',     unit: '$/share' },
};

async function fetchLivePrices() {
  const results = {};
  await Promise.allSettled(
    Object.entries(COMMODITY_TICKERS).map(async ([name, { ticker, unit }]) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return;
        const json = await res.json();
        const closes = (json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(v => v != null && !isNaN(v));
        if (closes.length >= 2) {
          results[name] = {
            price:    Math.round(closes[closes.length - 1] * 100) / 100,
            change1d: Math.round((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2] * 1000) / 10,
            unit,
          };
        }
      } catch { /* skip */ }
    })
  );
  return results;
}

function formatPricesForPrompt(prices) {
  if (Object.keys(prices).length === 0) return '';
  const lines = Object.entries(prices).map(([name, p]) =>
    `  ${name}: ${p.price} ${p.unit} (${p.change1d >= 0 ? '+' : ''}${p.change1d}% today)`
  );
  return `\nLIVE MARKET PRICES (use these in your analysis — do NOT use stale training-data prices):\n${lines.join('\n')}\n`;
}

// ── Prompts ───────────────────────────────────────────────────────────────────
const SYSTEM_MESSAGE = `You are a commodity research analyst writing for equity investors. You output only valid JSON. Critical rule: live market prices are provided — use them as ground truth, not your training data.`;

function buildUserPrompt(today, prices) {
  const priceBlock = formatPricesForPrompt(prices);
  return `Date: ${today}.${priceBlock}
Output a JSON array of 8 supply-demand themes for Indian equity investors.

IMPORTANT: Use the LIVE PRICES above in your descriptions. If cocoa is at $6,000 not $10,000 — say so. Reflect what is happening NOW, not what happened a year ago.

MANDATORY themes:
1. Cocoa — use current price above; describe current shortage/recovery/easing vs 2024 peak. Indian FMCG impact.
2. AI compute hardware — use NVDA price as demand indicator; GPU/HBM/CoWoS supply. Indian IT/electronics.
3. Crude oil — use current WTI price; OPEC policy, refining margins. Indian refiners.
4. Copper or Lithium — use current price; green energy demand. Indian EV/metals plays.
5. DRAM/NAND — use Micron price as memory-cycle indicator; oversupply or recovery?
6. Urea or Palm oil — use current prices; feedstock costs, India import dependency.
7. Steel or Aluminium — use current price; China overcapacity vs India expansion.
8. Your choice: natural gas, rare earths, sugar, or caustic soda.

Each theme MUST have exactly these fields:
{"commodity":"...","category":"shortage"|"oversupply"|"emerging"|"balanced","pricingPower":"rising"|"collapsing"|"stable","description":"2 sentences CITING the live price above","confidence":integer 40-90,"timeHorizon":"near-term"|"medium-term"|"long-term","beneficiaries":[{"symbol":"NSE_TICKER","company":"Name","rationale":"one sentence","impact":"high"|"medium"|"low"},{"symbol":"NSE_TICKER","company":"Name","rationale":"one sentence","impact":"high"|"medium"|"low"}],"adverselyAffected":[{"symbol":"NSE_TICKER","company":"Name","rationale":"one sentence","impact":"high"|"medium"|"low"},{"symbol":"NSE_TICKER","company":"Name","rationale":"one sentence","impact":"high"|"medium"|"low"}],"historicalAnalog":"one sentence","sources":["source 1","source 2"]}

NSE tickers: NESTLEIND, ITC, HINDUNILVR, BRITANNIA (FMCG) | INFY, TCS, WIPRO, HCLTECH, LTIM, PERSISTENT, KAYNES, DIXON (IT/tech) | COALINDIA, ONGC, RELIANCE, BPCL, IOC, GAIL (energy) | TATASTEEL, JSWSTEEL, HINDALCO, VEDL, SAIL (metals) | TATAMOTORS, ADANIGREEN, TATAPOWER (EV/renewables) | COROMANDEL, CHAMBAL, UPL (agri)

Output ONLY a valid JSON array. No markdown, no wrapper object.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripMarkdownFences(raw) {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function nowIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startMs = Date.now();
  const today   = nowIST();

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Supply-Demand Intelligence — Local Runner        ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`  Model   : ${MODEL}`);
  console.log(`  Ollama  : ${OLLAMA_BASE}`);
  console.log(`  Date    : ${today} IST`);
  console.log(`  Output  : ${OUTPUT_PATH}`);
  if (UPLOAD) console.log(`  Upload  : YES → ${process.env.WEBAPP_URL ?? '(WEBAPP_URL not set)'}`);
  console.log('');

  // ── 1. Fetch live commodity prices ──────────────────────────────────────────
  console.log('⏳ Fetching live commodity prices from Yahoo Finance...');
  const prices = await fetchLivePrices();
  const priceCount = Object.keys(prices).length;
  if (priceCount > 0) {
    console.log(`✓ Got live prices for ${priceCount} commodities:`);
    for (const [name, p] of Object.entries(prices)) {
      console.log(`  ${name}: ${p.price} ${p.unit} (${p.change1d >= 0 ? '+' : ''}${p.change1d}%)`);
    }
  } else {
    console.log('  ⚠ No live prices fetched — analysis will use model training data only');
  }
  console.log('');

  // ── 2. Call Ollama ──────────────────────────────────────────────────────────
  console.log(`⏳ Calling Ollama (${MODEL})... please wait`);

  let llmRes;
  try {
    llmRes = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_MESSAGE },
          { role: 'user',   content: buildUserPrompt(today, prices) },
        ],
      }),
    });
  } catch (err) {
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
      console.error(`\n✗ Cannot reach Ollama at ${OLLAMA_BASE}`);
      console.error('  → Start Ollama:  ollama serve');
      console.error(`  → Pull model:    ollama pull ${MODEL}`);
    } else {
      console.error('\n✗ Unexpected error:', err.message);
    }
    process.exit(1);
  }

  if (!llmRes.ok) {
    const body = await llmRes.text().catch(() => '');
    if (llmRes.status === 404) {
      console.error(`\n✗ Model "${MODEL}" not found in Ollama.`);
      console.error(`  → Pull it first: ollama pull ${MODEL}`);
    } else {
      console.error(`\n✗ Ollama returned HTTP ${llmRes.status}: ${body.slice(0, 200)}`);
    }
    process.exit(1);
  }

  const responseBody = await llmRes.json();
  const rawContent = responseBody?.choices?.[0]?.message?.content ?? '';

  if (!rawContent) {
    console.error('\n✗ Ollama returned an empty response. Model may have run out of VRAM.');
    process.exit(1);
  }

  // ── 2. Parse JSON (tolerant of truncated output from small models) ──────────
  console.log(`✓ Got response (${rawContent.length} chars). Parsing...`);

  function tryParse(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  // Attempt 1: clean parse
  let parsed = tryParse(stripMarkdownFences(rawContent));

  // Attempt 2: find outermost [ ... ]
  if (!parsed) {
    const start = rawContent.indexOf('[');
    if (start !== -1) {
      const end = rawContent.lastIndexOf(']');
      if (end > start) parsed = tryParse(rawContent.slice(start, end + 1));
    }
  }

  // Attempt 3: extract individual complete objects via brace counting (handles truncated output)
  if (!parsed) {
    const objects = [];
    let depth = 0, objStart = -1;
    for (let i = 0; i < rawContent.length; i++) {
      if (rawContent[i] === '{') { if (depth === 0) objStart = i; depth++; }
      else if (rawContent[i] === '}') {
        depth--;
        if (depth === 0 && objStart >= 0) {
          const obj = tryParse(rawContent.slice(objStart, i + 1));
          if (obj && obj.commodity) objects.push(obj);
          objStart = -1;
        }
      }
    }
    if (objects.length > 0) { parsed = objects; console.log(`  (recovered ${objects.length} objects from truncated output)`); }
  }

  // Unwrap { themes: [...] } or any single-key object containing an array
  if (!Array.isArray(parsed) && parsed !== null && typeof parsed === 'object') {
    for (const k of Object.keys(parsed)) {
      if (Array.isArray(parsed[k])) { parsed = parsed[k]; break; }
    }
  }

  if (!Array.isArray(parsed) || parsed.length < 1) {
    console.error(`\n✗ Could not extract any themes from model output.`);
    console.error('  Raw excerpt:', rawContent.slice(0, 400));
    process.exit(1);
  }

  // Drop items that are clearly not theme objects (e.g. beneficiary objects leaked to top level)
  parsed = parsed.filter(item => item && typeof item === 'object' && item.commodity && item.description);

  // ── 3. Build snapshot ────────────────────────────────────────────────────────
  const themes = parsed.map((item, index) => ({
    id:               `${slugify(String(item.commodity ?? 'theme'))}-${index}`,
    commodity:        String(item.commodity ?? ''),
    category:         item.category ?? 'balanced',
    pricingPower:     item.pricingPower ?? 'stable',
    description:      String(item.description ?? ''),
    confidence:       Math.min(100, Math.max(0, Number(item.confidence ?? 50))),
    timeHorizon:      item.timeHorizon ?? 'medium-term',
    beneficiaries:    Array.isArray(item.beneficiaries)     ? item.beneficiaries     : [],
    adverselyAffected:Array.isArray(item.adverselyAffected) ? item.adverselyAffected : [],
    historicalAnalog: String(item.historicalAnalog ?? ''),
    sources:          Array.isArray(item.sources) ? item.sources : [],
  }));

  const snapshot = {
    themes,
    generatedAt: new Date().toISOString(),
    elapsedMs:   Date.now() - startMs,
    modelUsed:   MODEL,
    priceData:   Object.keys(prices).length > 0 ? prices : undefined,
    pricesAsOf:  new Date().toISOString(),
  };

  console.log(`✓ Parsed ${themes.length} themes in ${snapshot.elapsedMs}ms`);

  // Category summary
  const cats = themes.reduce((acc, t) => { acc[t.category] = (acc[t.category] ?? 0) + 1; return acc; }, {});
  console.log(`  Shortages: ${cats.shortage ?? 0}  Oversupply: ${cats.oversupply ?? 0}  Emerging: ${cats.emerging ?? 0}  Balanced: ${cats.balanced ?? 0}`);

  // ── 4. Save locally ──────────────────────────────────────────────────────────
  await writeFile(OUTPUT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`\n✓ Saved to: ${OUTPUT_PATH}`);

  // ── 5. Upload to Vercel (--upload flag) ─────────────────────────────────────
  if (!UPLOAD) {
    console.log('\nTo upload to Vercel: node scripts/run-supply-demand.mjs --upload');
    console.log('(Requires SD_UPLOAD_SECRET and WEBAPP_URL env vars)\n');
    return;
  }

  const uploadSecret = process.env.SD_UPLOAD_SECRET;
  const webappUrl    = (process.env.WEBAPP_URL ?? '').replace(/\/$/, '');

  if (!uploadSecret) {
    console.error('\n✗ SD_UPLOAD_SECRET env var is not set.');
    console.error('  Set it in .env.local or export it before running.');
    process.exit(1);
  }
  if (!webappUrl) {
    console.error('\n✗ WEBAPP_URL env var is not set.');
    console.error('  Example: WEBAPP_URL=https://stockscreenerlatest.vercel.app');
    process.exit(1);
  }

  const uploadUrl = `${webappUrl}/api/supply-demand/upload`;
  console.log(`\n⏳ Uploading to ${uploadUrl}...`);

  let uploadRes;
  try {
    uploadRes = await fetch(uploadUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${uploadSecret}`,
      },
      body: JSON.stringify(snapshot),
    });
  } catch (err) {
    console.error('\n✗ Could not reach upload endpoint:', err.message);
    process.exit(1);
  }

  const uploadBody = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    console.error(`\n✗ Upload failed (HTTP ${uploadRes.status}):`, uploadBody.error ?? JSON.stringify(uploadBody));
    process.exit(1);
  }

  console.log(`✓ Uploaded successfully!`);
  console.log(`  Blob URL : ${uploadBody.url}`);
  console.log(`  Uploaded : ${uploadBody.uploadedAt}`);
  console.log(`\nOpen ${webappUrl}/supply-demand in any browser to see the analysis.\n`);
}

main().catch(err => { console.error('\n✗ Fatal:', err); process.exit(1); });
