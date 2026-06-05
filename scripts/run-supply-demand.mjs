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

// ── Prompts ───────────────────────────────────────────────────────────────────
const SYSTEM_MESSAGE = `You are a commodity research analyst. You output only valid JSON. No prose, no markdown, no explanation.`;

function buildUserPrompt(today) {
  return `Date: ${today}. Output a JSON object with key "themes" containing an array of 6 supply-demand themes for Indian equity investors.

Each theme MUST have exactly these fields:
{
  "commodity": "name of commodity or sector",
  "category": "shortage" OR "oversupply" OR "emerging" OR "balanced",
  "pricingPower": "rising" OR "collapsing" OR "stable",
  "description": "2 sentences with a specific number (price/% /volume)",
  "confidence": integer 40-90,
  "timeHorizon": "near-term" OR "medium-term" OR "long-term",
  "beneficiaries": [
    {"symbol": "NSE_TICKER", "company": "Company Name", "rationale": "one sentence", "impact": "high" OR "medium" OR "low"}
  ],
  "adverselyAffected": [
    {"symbol": "NSE_TICKER", "company": "Company Name", "rationale": "one sentence", "impact": "high" OR "medium" OR "low"}
  ],
  "historicalAnalog": "one sentence referencing a past episode",
  "sources": ["source 1", "source 2"]
}

Rules:
- Include 2 shortage, 2 oversupply, 1 emerging, 1 balanced theme
- beneficiaries: 2 entries. adverselyAffected: 2 entries. No more, no less.
- Use real NSE tickers: COALINDIA, ONGC, RELIANCE, TATASTEEL, JSWSTEEL, HINDALCO, HINDUNILVR, UPL, COROMANDEL, ADANIPORTS, NTPC, POWERGRID, BPCL, IOC, GAIL, SAIL
- Output ONLY the JSON object. No text before or after.

Example of one theme inside the array:
{"commodity":"Thermal Coal","category":"shortage","pricingPower":"rising","description":"Global thermal coal prices rose 18% YoY to $135/tonne. Indian imports up 12% in Q1.","confidence":72,"timeHorizon":"near-term","beneficiaries":[{"symbol":"COALINDIA","company":"Coal India Ltd","rationale":"Domestic coal shortage raises realisations.","impact":"high"},{"symbol":"NTPC","company":"NTPC Ltd","rationale":"Higher tariffs offset fuel cost rise.","impact":"medium"}],"adverselyAffected":[{"symbol":"TATASTEEL","company":"Tata Steel Ltd","rationale":"Energy costs increase smelting margins.","impact":"high"},{"symbol":"HINDALCO","company":"Hindalco Industries","rationale":"Power-intensive smelting hit by coal prices.","impact":"medium"}],"historicalAnalog":"Similar to 2021 coal shortage when COALINDIA rallied 40%.","sources":["IEA Coal Report","Bloomberg Commodities"]}`;
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

  // ── 1. Call Ollama ──────────────────────────────────────────────────────────
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
          { role: 'user',   content: buildUserPrompt(today) },
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

  // ── 2. Parse JSON ───────────────────────────────────────────────────────────
  console.log(`✓ Got response (${rawContent.length} chars). Parsing...`);

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFences(rawContent));
  } catch {
    const start = rawContent.indexOf('[');
    const end   = rawContent.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawContent.slice(start, end + 1)); }
      catch {
        console.error('\n✗ Could not parse model output as JSON array.');
        console.error('  Raw excerpt:', rawContent.slice(0, 300));
        process.exit(1);
      }
    } else {
      // Try unwrapping { themes: [...] } or similar wrapper
      try {
        const obj = JSON.parse(stripMarkdownFences(rawContent));
        const keys = Object.keys(obj);
        if (keys.length === 1 && Array.isArray(obj[keys[0]])) {
          parsed = obj[keys[0]];
        } else {
          console.error('\n✗ Model returned object instead of array. Keys:', keys.join(', '));
          process.exit(1);
        }
      } catch {
        console.error('\n✗ Could not parse model output as JSON.');
        console.error('  Raw excerpt:', rawContent.slice(0, 300));
        process.exit(1);
      }
    }
  }

  // Unwrap if the array is nested in an object key
  if (!Array.isArray(parsed) && parsed !== null && typeof parsed === 'object') {
    for (const k of Object.keys(parsed)) {
      if (Array.isArray(parsed[k])) { parsed = parsed[k]; break; }
    }
  }

  if (!Array.isArray(parsed) || parsed.length < 1) {
    console.error(`\n✗ Expected array with themes, got: ${JSON.stringify(parsed).slice(0, 200)}`);
    process.exit(1);
  }

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
