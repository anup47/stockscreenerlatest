// Extracts research targets from local OneDrive PDFs with a local Ollama model and
// publishes them to the Vercel Blob read by /research-targets.
// Usage: node scripts/sync-research-targets.mjs [--limit N] [--only REGEX] [--reset] [--dry-run]

import { readdir, stat, readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { put, list } from '@vercel/blob';
import { extractText, getDocumentProxy } from 'unpdf';
import researchList from '../lib/research-list.json' with { type: 'json' };

// Load env files ourselves: .env.local has a UTF-8 BOM, which breaks `node --env-file`.
// .env.production.local (from `vercel env pull`) comes first so its live blob token wins.
for (const f of ['.env.production.local', '.env.local']) {
  const envFile = path.resolve(import.meta.dirname, '..', f);
  if (!existsSync(envFile)) continue;
  for (const line of readFileSync(envFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const PDF_DIR  = process.env.RESEARCH_PDF_DIR
  || path.resolve(import.meta.dirname, '../../../AAStockWorld/New Research Dashboards');
// Node on Windows resolves `localhost` to ::1, which Ollama doesn't listen on.
const OLLAMA   = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '').replace('//localhost', '//127.0.0.1');
// 3b: ~45s/PDF on this CPU-only PC vs 3–12 min for 7b, with equal base-target accuracy in tests.
const MODEL    = process.env.RESEARCH_LLM_MODEL || 'qwen2.5:3b';
const BLOB_KEY = 'research-targets-overrides.json';
const KNOWN    = researchList.map(r => ({ symbol: r.symbol.toUpperCase(), company: r.company }));

const args  = process.argv.slice(2);
const opt   = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const LIMIT = Number(opt('--limit')) || Infinity;
const ONLY  = opt('--only') ? new RegExp(opt('--only'), 'i') : null;
const RESET = args.includes('--reset');
const DRY   = args.includes('--dry-run');

const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

// ── Blob ─────────────────────────────────────────────────────────────────────

async function readBlob() {
  const empty = { version: 1, processedFiles: [], lastSync: '', overrides: {} };
  const { blobs } = await list({ prefix: BLOB_KEY });
  if (!blobs.length) return empty;
  const res = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: 'no-store' });
  return res.ok ? await res.json() : empty;
}

async function writeBlob(data) {
  if (DRY) return;
  data.lastSync = new Date().toISOString();
  await put(BLOB_KEY, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
  });
}

// ── PDF text ─────────────────────────────────────────────────────────────────

// CPU inference time is dominated by prompt length, so send only what carries the targets:
// the cover page header (ticker, CMP, target, stance) plus sentences quoting target/bull/bear prices.
const PRICE    = /(rs\.?|₹|inr|\$)\s?[\d,]+/i;
const SCENARIO = /\b(bull|bear|base)\b/i;
const TARGET   = /target|price objective|\bTP\b|stance|accumulate|\bbuy\b|\bsell\b|\bhold\b|avoid/i;
// Template phrases the small model tends to miss: "Bull Rs 3,389" (not Rs-crore P&L rows) and the cover stance.
const BULL     = /\bbull(?:\s*case)?(?:\s*target)?[\s:|/-]{0,6}(?:rs\.?|₹)\s?([\d,]{2,})(?![\d,]*\s*(?:cr\b|crore|mn\b|bn\b|lakh))/gi;
const STANCE   = /\b(ACCUMULATE|BUY|HOLD|WATCH|AVOID|SELL|REDUCE)\b/;

async function pdfText(file) {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map(t => t.replace(/\s+/g, ' ').trim());
  const all   = pages.join(' ');
  const head  = pages[0].slice(0, 2000);

  const scenario = [], target = [];
  for (const s of all.split(/(?<=[.!?|])\s+/)) {
    if (!PRICE.test(s)) continue;
    if (SCENARIO.test(s)) scenario.push(s.slice(0, 300));
    else if (TARGET.test(s)) target.push(s.slice(0, 300));
  }
  let excerpts = '';
  for (const s of new Set([...scenario, ...target])) {
    if (excerpts.length + s.length > 2000) break;
    excerpts += s + '\n';
  }

  return {
    prompt: `${head}\n\n[Excerpts quoting prices]\n${excerpts}`,
    hasTargets: /target|\bbull\b/i.test(head + excerpts),
    chars: all.length,
    regexBulls: [...all.matchAll(BULL)].map(m => Number(m[1].replace(/,/g, ''))),
    regexStance: head.match(STANCE)?.[1] ?? null,
  };
}

// ── Local LLM ────────────────────────────────────────────────────────────────

const nullable = t => ({ type: [t, 'null'] });
const PROPERTIES = {
  isSingleStockReport: { type: 'boolean' },
  company:     nullable('string'),
  nseSymbol:   nullable('string'),
  sector:      nullable('string'),
  researchCmp: nullable('number'),
  baseTarget:  nullable('number'),
  bullTarget:  nullable('number'),
  stance:      nullable('string'),
  horizon:     nullable('string'),
  note:        nullable('string'),
};
const SCHEMA = { type: 'object', properties: PROPERTIES, required: Object.keys(PROPERTIES) };

const PROMPT = `You are reading text extracted from an Indian equity research report. Return a JSON object with:
- isSingleStockReport: true only if the report is about ONE listed company (false for backtests, sector/thematic notes, commodity notes, transaction logs, screeners).
- company: full company name.
- nseSymbol: NSE ticker without suffix (e.g. HINDALCO, GRAVITAINDS). For BSE-only stocks use the numeric BSE code. null if not stated and you are not sure.
- sector: one or two words (e.g. Pharma, Industrials, Defence, Chemicals, Metals, Consumer).
- researchCmp: market price at the time of the report, as a plain number.
- baseTarget: base-case target price. If only one target is given, put it here.
- bullTarget: bull-case target price, else null.
- stance: one of ACCUMULATE, BUY, HOLD, WATCH, AVOID, SELL, or null.
- horizon: one of 12M, 18M, 24M, 3Y, or null ("1 year" = 12M, "2 years" = 24M).
- note: the one-line investment thesis, under 100 characters.
Prices are plain numbers in rupees (no commas or symbols) unless the stock is US-listed. Use null for anything not in the text — never guess numbers.`;

async function extract(text) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Streaming: Node's fetch drops a request whose headers take >5 min, which slow CPU runs hit.
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      format: SCHEMA,
      options: { temperature: 0, num_ctx: 4096 },
      messages: [{ role: 'user', content: `${PROMPT}\n\nREPORT TEXT:\n${text}` }],
    }),
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let out = '', buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) if (line.trim()) out += JSON.parse(line).message?.content ?? '';
  }
  if (buf.trim()) out += JSON.parse(buf).message?.content ?? '';
  return JSON.parse(out);
}

async function assertOllama() {
  const ping = () => fetch(`${OLLAMA}/api/tags`).catch(() => null);
  let res = await ping();
  if (!res?.ok) {
    log('Ollama not running — starting `ollama serve`');
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 30 && !res?.ok; i++) { await new Promise(r => setTimeout(r, 1000)); res = await ping(); }
  }
  if (!res?.ok) throw new Error(`Ollama is not reachable at ${OLLAMA} — start the Ollama app and retry.`);
  const { models } = await res.json();
  if (!models.some(m => m.name === MODEL)) throw new Error(`Model ${MODEL} not installed — run: ollama pull ${MODEL}`);
}

// ── Normalisation ────────────────────────────────────────────────────────────

function normaliseStance(raw) {
  const s = (raw || '').toUpperCase();
  if (/BUY|ACCUMULATE|OUTPERFORM|OVERWEIGHT/.test(s)) return 'ACCUMULATE';
  if (/HOLD|NEUTRAL|WATCH|MARKET.?PERFORM/.test(s))  return 'WATCH';
  if (/SELL|AVOID|REDUCE|UNDERPERFORM/.test(s))       return 'AVOID';
  return null;
}

const normName = s => (s || '').toUpperCase().replace(/\b(LIMITED|LTD|THE)\b/g, '').replace(/[^A-Z0-9]/g, '');
const num = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

// Map the model's ticker onto the tab's existing symbols, falling back to company name.
function resolveSymbol(ex) {
  const sym = (ex.nseSymbol || '').toUpperCase().replace(/\.(NS|BO)$/, '').replace(/\s+/g, '');
  const bySym = KNOWN.find(k => k.symbol === sym);
  if (bySym) return bySym.symbol;
  const c = normName(ex.company);
  if (c.length >= 4) {
    const byName = KNOWN.find(k => { const n = normName(k.company); return n.length >= 4 && (n.startsWith(c) || c.startsWith(n)); });
    if (byName) return byName.symbol;
  }
  return /^[A-Z0-9&-]{2,20}$/.test(sym) ? sym : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const keyOf = f => `${f.name}|${f.lastModified}`;

async function listPdfs() {
  const names = (await readdir(PDF_DIR)).filter(n => /\.pdf$/i.test(n) && !/scuttlebuttbasket/i.test(n));
  const files = await Promise.all(names.map(async name => {
    const s = await stat(path.join(PDF_DIR, name));
    return { name, lastModified: s.mtime.toISOString() };
  }));
  return files.sort((a, b) => a.lastModified.localeCompare(b.lastModified));
}

async function main() {
  const [files, data] = await Promise.all([listPdfs(), readBlob()]);

  // Forget deleted/renamed/edited files so the blob doesn't grow forever.
  const present = new Set(files.map(keyOf));
  const kept = RESET ? [] : data.processedFiles.filter(k => present.has(k));
  let dirty = kept.length !== data.processedFiles.length;
  data.processedFiles = kept;

  const done = new Set(kept);
  const pending = files.filter(f => !done.has(keyOf(f)) && (!ONLY || ONLY.test(f.name))).slice(0, LIMIT);
  log(`${files.length} PDFs in folder, ${pending.length} to process with ${MODEL}${DRY ? ' (dry run)' : ''}`);

  let ok = 0, skipped = 0, failed = 0;
  if (pending.length) await assertOllama();

  for (const [i, file] of pending.entries()) {
    const t0 = Date.now();
    const tag = `[${i + 1}/${pending.length}] ${file.name}`;
    try {
      const { prompt, hasTargets, chars, regexBulls, regexStance } = await pdfText(path.join(PDF_DIR, file.name));
      let outcome;
      if (chars < 300) outcome = 'skip: no extractable text (scanned PDF?)';
      else if (!hasTargets) outcome = 'skip: no price target mentioned';
      else {
        const ex = await extract(prompt);
        // The cover-page stance is authoritative in this report template.
        const stance = normaliseStance(regexStance || ex.stance);
        const sym = ex.isSingleStockReport ? resolveSymbol(ex) : null;
        const baseTarget = num(ex.baseTarget);
        const bullTarget = num(ex.bullTarget) ?? regexBulls.find(b => !baseTarget || b > baseTarget) ?? null;
        const existing = sym && data.overrides[sym];
        const secs = ((Date.now() - t0) / 1000).toFixed(0);

        if (!ex.isSingleStockReport) outcome = `skip (${secs}s): not a single-stock report`;
        else if (!sym || (baseTarget == null && bullTarget == null && !stance)) outcome = `skip (${secs}s): no ticker/targets found`;
        else if (existing?.sourceModified > file.lastModified) outcome = `skip: older than ${existing.sourceFile} for ${sym}`;
        else {
          data.overrides[sym] = {
            company: ex.company || sym,
            sector: ex.sector || null,
            baseTarget, bullTarget,
            researchCmp: num(ex.researchCmp),
            stance,
            horizon: /^(12M|18M|24M|3Y)$/.test(ex.horizon || '') ? ex.horizon : null,
            note: ex.note ? String(ex.note).slice(0, 120) : null,
            sourceFile: file.name,
            sourceModified: file.lastModified,
            syncedAt: new Date().toISOString(),
          };
          outcome = `ok (${secs}s): ${sym} base ${baseTarget ?? '—'} bull ${bullTarget ?? '—'} ${stance ?? ''}`;
        }
      }

      log(`${tag} — ${outcome}`);
      data.processedFiles.push(keyOf(file));
      dirty = true;
      if (outcome.startsWith('ok')) {
        ok++;
        await writeBlob(data); // publish each new target as it lands; skips ride along with the next write
        dirty = false;
      } else skipped++;
    } catch (e) {
      failed++;
      log(`${tag} — error: ${String(e).slice(0, 200)}`);
    }
  }

  if (dirty) await writeBlob(data);
  log(`Done: ${ok} updated, ${skipped} skipped, ${failed} errors · ${Object.keys(data.overrides).length} stocks with PDF targets`);
  if (failed > 0 && ok === 0 && skipped === 0) process.exitCode = 1;
}

main().catch(e => { log('fatal:', e.message); process.exit(1); });
