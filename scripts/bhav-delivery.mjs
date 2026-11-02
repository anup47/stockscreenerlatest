// Publishes NSE's daily trade counts, delivery and VWAP per stock (full bhavcopy) for the Big Player
// Tracker tab, as 12 hashed Blob shards plus an index carrying Dhan security IDs and company names.
// Also collects NSE bulk and block deals: NSE only publishes the latest day's files, so history builds
// up from the first run onwards.
// Runs on the office PC: NSE's archives block cloud-server IPs. Day files are cached locally, so an
// hourly run downloads at most one new file and writes to Blob only when a new trading day appears.
// Usage: node scripts/bhav-delivery.mjs [--dry-run] [--force]

import './load-env.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { put } from '@vercel/blob';
import { BHAV_DAYS, BHAV_SHARDS, INDEX_KEY, DEALS_KEY, shardKey, shardOf, encodeSession } from '../lib/big-player.ts';

const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const DRY   = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const SERIES = ['EQ', 'BE', 'BZ', 'SM', 'ST'];   // EQ preferred when a stock trades in several
const MON   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const log   = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

const DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'big-player');
const DAYS_DIR = path.join(DIR, 'days');
const DEALS_DIR = path.join(DIR, 'deals');
mkdirSync(DAYS_DIR, { recursive: true });
mkdirSync(DEALS_DIR, { recursive: true });
const STOCKS_FILE = path.join(DIR, 'stocks.json');
const MISSING_FILE = path.join(DIR, 'missing.json');   // past weekdays with no bhavcopy (holidays)
const STATE_FILE = path.join(DIR, 'published.json');
const missing = new Set(existsSync(MISSING_FILE) ? JSON.parse(readFileSync(MISSING_FILE, 'utf8')) : []);

const iso = d => d.toISOString().slice(0, 10);
const nseDate = s => { const [dd, mon, yy] = s.split('-'); return `${yy}-${String(MON.findIndex(m => m.toUpperCase() === mon.toUpperCase()) + 1).padStart(2, '0')}-${dd.padStart(2, '0')}`; };
const todayIst = iso(new Date(Date.now() + 5.5 * 3600_000));

async function fetchDay(date) {
  const [y, m, d] = date.split('-');
  const res = await fetch(`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${d}${m}${y}.csv`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`NSE bhavcopy ${date}: HTTP ${res.status}`);
  const lines = (await res.text()).split(/\r?\n/);
  const hdr = lines[0].split(',').map(h => h.trim());
  const col = name => hdr.indexOf(name);
  const I = { sym: col('SYMBOL'), ser: col('SERIES'), date: col('DATE1'), o: col('OPEN_PRICE'), h: col('HIGH_PRICE'), l: col('LOW_PRICE'), c: col('CLOSE_PRICE'),
    vwap: col('AVG_PRICE'), vol: col('TTL_TRD_QNTY'), tr: col('NO_OF_TRADES'), dq: col('DELIV_QTY') };
  if (Object.values(I).some(i => i < 0)) throw new Error(`NSE bhavcopy ${date}: unexpected header ${lines[0]}`);
  const out = {};
  let fileDate = null;
  for (const line of lines.slice(1)) {
    const c = line.split(',').map(x => x.trim());
    const ser = c[I.ser];
    if (!SERIES.includes(ser) || !c[I.sym]) continue;
    fileDate ??= nseDate(c[I.date]);
    if (out[c[I.sym]] && (ser !== 'EQ' || out[c[I.sym]].ser === 'EQ')) continue;
    const vol = +c[I.vol], trades = +c[I.tr];
    if (!vol || !trades) continue;
    const dq = Number(c[I.dq]);
    out[c[I.sym]] = { ser, row: encodeSession({ o: +c[I.o], h: +c[I.h], l: +c[I.l], c: +c[I.c], vwap: +c[I.vwap], vol, trades, delivQty: Number.isFinite(dq) ? dq : null, series: ser }) };
  }
  // On some holidays NSE serves the previous session's file under the holiday's name.
  if (fileDate !== date) return null;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.row]));
}

// Walk weekdays back from today until BHAV_DAYS trading days are cached (first run backfills ~4 months).
const dates = [];
const stop = Date.parse(`${todayIst}T00:00:00Z`) - 200 * 864e5;
for (let t = Date.parse(`${todayIst}T00:00:00Z`); dates.length < BHAV_DAYS && t > stop; t -= 864e5) {
  const date = iso(new Date(t)), dow = new Date(t).getUTCDay();
  if (dow === 0 || dow === 6 || missing.has(date)) continue;
  const file = path.join(DAYS_DIR, `${date}.json`);
  if (!existsSync(file)) {
    const day = await fetchDay(date);
    if (!day) { if (date < todayIst) missing.add(date); continue; }   // today's file appears ~6 pm IST
    writeFileSync(file, JSON.stringify(day));
    log(`cached ${date} (${Object.keys(day).length} stocks)`);
    await new Promise(r => setTimeout(r, 400));                       // be gentle with NSE
  }
  dates.push(date);
}
writeFileSync(MISSING_FILE, JSON.stringify([...missing].sort()));
dates.reverse();

const latest = dates.at(-1);

// ── Bulk and block deals (latest day only; cached per day so history accumulates) ──
const csvRow = line => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
for (const kind of ['bulk', 'block']) {
  try {
    const res = await fetch(`https://nsearchives.nseindia.com/content/equities/${kind}.csv`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.text()).split(/\r?\n/).slice(1).filter(l => l.trim()).map(csvRow)
      .map(([d, sym, , client, side, qty, price]) => ({ d: nseDate(d), sym, kind, client, side: side?.toUpperCase().startsWith('S') ? 'SELL' : 'BUY', qty: +qty, price: +price }))
      .filter(r => r.sym && r.qty > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.d));
    for (const d of new Set(rows.map(r => r.d))) {
      const file = path.join(DEALS_DIR, `${d}-${kind}.json`);
      const dayRows = rows.filter(r => r.d === d);
      if (!existsSync(file) || readFileSync(file, 'utf8') !== JSON.stringify(dayRows)) { writeFileSync(file, JSON.stringify(dayRows)); log(`cached ${dayRows.length} ${kind} deals for ${d}`); }
    }
  } catch (e) { log(`warn: NSE ${kind} deals unavailable (${String(e).slice(0, 100)})`); }
}
const dealFiles = readdirSync(DEALS_DIR).filter(f => f.endsWith('.json') && f.slice(0, 10) >= dates[0]).sort();
const dealsSig = dealFiles.map(f => `${f}:${statSync(path.join(DEALS_DIR, f)).size}`).join('|');

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
const bhavChanged = FORCE || state.latest !== latest;
if (!DRY && !bhavChanged && state.dealsSig === dealsSig) { log(`bhav delivery unchanged (latest ${latest})`); process.exit(0); }

// Build shards: one ';'-joined row per symbol aligned to `dates`.
const days = dates.map(d => JSON.parse(readFileSync(path.join(DAYS_DIR, `${d}.json`), 'utf8')));
const symbols = [...new Set(days.flatMap(Object.keys))].sort();
const shards = Array.from({ length: BHAV_SHARDS }, () => ({ dates, rows: {} }));
for (const sym of symbols) shards[shardOf(sym)].rows[sym] = days.map(day => day[sym] ?? '').join(';');

// Dhan security IDs and names, so the API route never has to load Dhan's 25 MB scrip master.
// Reused from the last run when only the deals changed.
let stocks = !bhavChanged && existsSync(STOCKS_FILE) ? JSON.parse(readFileSync(STOCKS_FILE, 'utf8')) : null;
if (!stocks) {
  stocks = Object.fromEntries(symbols.map(s => [s, [0, '']]));
  try {
    const csv = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', { signal: AbortSignal.timeout(120_000) }).then(r => r.text());
    const lines = csv.split('\n'), hdr = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim());
    const [iEx, iSeg, iId, iIns, iSym, iName] = ['SEM_EXM_EXCH_ID', 'SEM_SEGMENT', 'SEM_SMST_SECURITY_ID', 'SEM_INSTRUMENT_NAME', 'SEM_TRADING_SYMBOL', 'SEM_CUSTOM_SYMBOL'].map(h => hdr.indexOf(h));
    for (const line of lines) {
      const c = line.split(',');
      if (c[iEx] === 'NSE' && c[iSeg] === 'E' && c[iIns] === 'EQUITY' && stocks[c[iSym]]) stocks[c[iSym]] = [+c[iId], c[iName]?.trim() ?? ''];
    }
    writeFileSync(STOCKS_FILE, JSON.stringify(stocks));
  } catch (e) { log(`warn: Dhan scrip master unavailable (${String(e).slice(0, 100)}); publishing without security IDs`); }
}

const deals = {};
for (const f of dealFiles) for (const { sym, ...deal } of JSON.parse(readFileSync(path.join(DEALS_DIR, f), 'utf8'))) (deals[sym] ??= []).push(deal);
const dealsFile = { from: dealFiles[0]?.slice(0, 10) ?? null, to: dealFiles.at(-1)?.slice(0, 10) ?? null, deals };

const index = { updatedAt: new Date().toISOString(), dates, stocks };
const sizes = shards.map(s => JSON.stringify(s).length);
log(`${dates[0]} → ${latest}: ${dates.length} sessions, ${symbols.length} stocks, ${Object.values(stocks).filter(s => s[0]).length} with Dhan IDs, shards ${Math.min(...sizes) >> 10}–${Math.max(...sizes) >> 10} KB; deals ${dealsFile.from ?? '—'} → ${dealsFile.to ?? '—'} (${Object.values(deals).flat().length})`);
if (DRY) process.exit(0);

const opts = { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true };
if (bhavChanged) for (let i = 0; i < BHAV_SHARDS; i++) await put(shardKey(i), JSON.stringify(shards[i]), opts);
await put(DEALS_KEY, JSON.stringify(dealsFile), opts);
await put(INDEX_KEY, JSON.stringify(index), opts);   // index last: readers key their shard and deals caches on it
writeFileSync(STATE_FILE, JSON.stringify({ latest, dealsSig, publishedAt: index.updatedAt }));
log(`bhav delivery published through ${latest}${bhavChanged ? '' : ' (deals only)'}`);
