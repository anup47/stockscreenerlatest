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

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const MODEL       = modelArg ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:14b';
const OUTPUT_PATH = outArg ? resolve(outArg) : resolve(ROOT, 'supply-demand-snapshot.json');

// ── Prompts (kept in sync with app/api/supply-demand/route.ts) ───────────────
const SYSTEM_MESSAGE = `You are a senior institutional commodity research analyst specializing in global supply-demand dynamics and their impact on the Indian equity market (NSE/BSE listed companies). You have deep expertise in:
- Global commodity markets: energy, metals, agricultural, chemicals
- Indian manufacturing, refining, and consumption patterns
- Supply chain disruptions, geopolitical trade flows, and seasonal demand cycles
- Identifying NSE/BSE listed beneficiaries and companies adversely affected by commodity shifts
Your analysis is grounded in real macroeconomic data, government policy, seasonal patterns, and industry fundamentals. You communicate in precise, factual language suitable for institutional use. You always cite specific data points (prices, percentages, volumes, trade flows) in your descriptions.`;

function buildUserPrompt(today) {
  return `Today's date is ${today}. Analyze current global and domestic supply-demand dynamics most relevant to Indian equity investors. Generate a JSON array of exactly 12 supply-demand themes covering a diverse mix of commodities.

Coverage mandate — include themes from these sectors:
- Energy: crude oil, natural gas, thermal coal
- Battery/EV metals: lithium, cobalt, nickel
- Industrial metals: copper, aluminium
- Technology materials: semiconductors (DRAM, NAND flash, logic chips), silicon, rare earths, display panels
- Agriculture: wheat, soybean, sugar, palm oil, cotton
- Chemicals: urea, caustic soda, titanium dioxide, PVC, MDI/TDI isocyanates

Distribution requirement: include at least 3 shortage themes, 3 oversupply themes, 3 emerging themes, and the remainder balanced.

Each theme object must conform exactly to this schema (no extra fields, no missing fields):
{
  "commodity": string,
  "category": "shortage" | "oversupply" | "emerging" | "balanced",
  "pricingPower": "rising" | "collapsing" | "stable",
  "description": string,
  "confidence": number,
  "timeHorizon": "near-term" | "medium-term" | "long-term",
  "beneficiaries": [
    { "symbol": string, "company": string, "rationale": string, "impact": "high" | "medium" | "low" }
  ],
  "adverselyAffected": [
    { "symbol": string, "company": string, "rationale": string, "impact": "high" | "medium" | "low" }
  ],
  "historicalAnalog": string,
  "sources": string[]
}

Hard rules:
- All ticker symbols must be real, actively traded NSE symbols
- description must cite at least one specific number
- confidence must be an integer between 40 and 95
- beneficiaries and adverselyAffected must each have 2 to 4 entries
- Return ONLY a valid JSON array — no markdown, no code fences, no prose
Respond with the JSON array only.`;
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
  console.log('⏳ Calling Ollama... (this may take 2-5 minutes for qwen2.5:14b)');

  let llmRes;
  try {
    llmRes = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        response_format: { type: 'json_object' },
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

  if (!Array.isArray(parsed) || parsed.length < 4) {
    console.error(`\n✗ Expected array with ≥4 themes, got: ${JSON.stringify(parsed).slice(0, 200)}`);
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
