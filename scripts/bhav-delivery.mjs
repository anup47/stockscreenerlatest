// Publishes NSE's daily trade counts, delivery and VWAP per stock (full bhavcopy) for the Big Player
// Tracker tab, as 12 hashed Blob shards plus an index carrying Dhan security IDs and company names.
// Runs on the office PC: NSE's archives block cloud-server IPs. Day files are cached locally, so an
// hourly run downloads at most one new file and writes to Blob only when a new trading day appears.
// Usage: node scripts/bhav-delivery.mjs [--dry-run] [--force]

import './load-env.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { put } from '@vercel/blob';
import { BHAV_DAYS, BHAV_SHARDS, INDEX_KEY, shardKey, shardOf, encodeSession } from '../lib/big-player.ts';

const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const DRY   = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const SERIES = ['EQ', 'BE', 'BZ', 'SM', 'ST'];   // EQ preferred when a stock trades in several
const MON   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const log   = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

const DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'big-player');
const DAYS_DIR = path.join(DIR, 'days');
mkdirSync(DAYS_DIR, { recursive: true });
const MISSING_FILE = path.join(DIR, 'missing.json');   // past weekdays with no bhavcopy (holidays)
const STATE_FILE = path.join(DIR, 'published.json');
const missing = new Set(existsSync(MISSING_FILE) ? JSON.parse(readFileSync(MISSING_FILE, 'utf8')) : []);

const iso = d => d.toISOString().slice(0, 10);
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
    const [dd, mon, yy] = c[I.date].split('-');
    fileDate ??= `${yy}-${String(MON.indexOf(mon) + 1).padStart(2, '0')}-${dd}`;
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
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
if (!FORCE && !DRY && state.latest === latest) { log(`bhav delivery unchanged (latest ${latest})`); process.exit(0); }

// Build shards: one ';'-joined row per symbol aligned to `dates`.
const days = dates.map(d => JSON.parse(readFileSync(path.join(DAYS_DIR, `${d}.json`), 'utf8')));
const symbols = [...new Set(days.flatMap(Object.keys))].sort();
const shards = Array.from({ length: BHAV_SHARDS }, () => ({ dates, rows: {} }));
for (const sym of symbols) shards[shardOf(sym)].rows[sym] = days.map(day => day[sym] ?? '').join(';');

// Dhan security IDs and names, so the API route never has to load Dhan's 25 MB scrip master.
const stocks = Object.fromEntries(symbols.map(s => [s, [0, '']]));
try {
  const csv = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv', { signal: AbortSignal.timeout(120_000) }).then(r => r.text());
  const lines = csv.split('\n'), hdr = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim());
  const [iEx, iSeg, iId, iIns, iSym, iName] = ['SEM_EXM_EXCH_ID', 'SEM_SEGMENT', 'SEM_SMST_SECURITY_ID', 'SEM_INSTRUMENT_NAME', 'SEM_TRADING_SYMBOL', 'SEM_CUSTOM_SYMBOL'].map(h => hdr.indexOf(h));
  for (const line of lines) {
    const c = line.split(',');
    if (c[iEx] === 'NSE' && c[iSeg] === 'E' && c[iIns] === 'EQUITY' && stocks[c[iSym]]) stocks[c[iSym]] = [+c[iId], c[iName]?.trim() ?? ''];
  }
} catch (e) { log(`warn: Dhan scrip master unavailable (${String(e).slice(0, 100)}); publishing without security IDs`); }

const index = { updatedAt: new Date().toISOString(), dates, stocks };
const sizes = shards.map(s => JSON.stringify(s).length);
log(`${dates[0]} → ${latest}: ${dates.length} sessions, ${symbols.length} stocks, ${Object.values(stocks).filter(s => s[0]).length} with Dhan IDs, shards ${Math.min(...sizes) >> 10}–${Math.max(...sizes) >> 10} KB`);
if (DRY) process.exit(0);

const opts = { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true };
for (let i = 0; i < BHAV_SHARDS; i++) await put(shardKey(i), JSON.stringify(shards[i]), opts);
await put(INDEX_KEY, JSON.stringify(index), opts);   // index last: readers key their shard cache on it
writeFileSync(STATE_FILE, JSON.stringify({ latest, publishedAt: index.updatedAt }));
log(`bhav delivery published through ${latest}`);
