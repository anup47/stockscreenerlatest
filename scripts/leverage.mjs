// Builds the weekly market-leverage history for the Leverage tab and publishes it to Vercel Blob
// (leverage-history.json). Runs on the office PC: NSE's archives block cloud-server IPs.
//   MTF book      — IndiaMTF.com open JSON (NSE + BSE daily disclosures), free with attribution
//   Futures OI    — NSE F&O bhavcopy: Σ open interest × settlement price, stock + index futures
//   Market cap    — NSE official month-end market cap + today's; weeks between moved by the Nifty 500
//   Nifty 50/500  — Yahoo Finance weekly closes
// Week key = that week's Friday; values are from the week's last trading day.
// Usage: node scripts/leverage.mjs [--dry-run] [--rebuild-futures]

import './load-env.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { put, head, BlobNotFoundError } from '@vercel/blob';
import { unzipSync, strFromU8 } from 'fflate';

const KEY   = 'leverage-history.json';
const YEARS = 5;
const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const DRY   = process.argv.includes('--dry-run');
const REBUILD_FUT = process.argv.includes('--rebuild-futures');
const log   = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

const iso      = d => d.toISOString().slice(0, 10);
const addDays  = (s, n) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 864e5));
const fridayOf = s => addDays(s, 4 - ((new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7));
const todayIst = () => iso(new Date(Date.now() + 5.5 * 3600_000));
const MON      = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i]).catch(e => { log(`warn: ${String(e).slice(0, 120)}`); return null; }); }
  }));
  return out;
}

async function readBlob() {
  const meta = await head(KEY).catch(e => { if (e instanceof BlobNotFoundError) return null; throw e; });
  if (!meta) return null;
  const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' });
  return res.ok ? res.json() : null;
}

// ── MTF (IndiaMTF.com) ───────────────────────────────────────────────────────

async function mtfDaily() {
  const res = await fetch('https://indiamtf.com/history/archive/index.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`IndiaMTF HTTP ${res.status}`);
  const { days } = await res.json();
  return days.filter(r => r.book != null).map(r => ({ date: r.d, total: r.book, nse: r.nse, bse: r.bse }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Futures OI (NSE F&O bhavcopy) ────────────────────────────────────────────

// NSE switched to the UDiFF bhavcopy on 8 Jul 2024; the legacy file covers dates before it.
function bhavUrls(date) {
  const [y, m, d] = date.split('-'), mon = MON[+m - 1];
  const udiff  = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${y}${m}${d}_F_0000.csv.zip`;
  const legacy = `https://nsearchives.nseindia.com/content/historical/DERIVATIVES/${y}/${mon}/fo${d}${mon}${y}bhav.csv.zip`;
  return date >= '2024-07-08' ? [udiff, legacy] : [legacy, udiff];
}

function parseFutures(text) {
  const [hdr, ...lines] = text.trim().split(/\r?\n/);
  const cols = hdr.split(',').map(s => s.trim());
  const udiff = cols.includes('FinInstrmTp');
  const iType = cols.indexOf(udiff ? 'FinInstrmTp' : 'INSTRUMENT');
  const iOi   = cols.indexOf(udiff ? 'OpnIntrst' : 'OPEN_INT');   // contracts' underlying quantity
  const iPx   = cols.indexOf(udiff ? 'SttlmPric' : 'SETTLE_PR');
  let stock = 0, index = 0;
  for (const line of lines) {
    const f = line.split(',');
    const notional = Number(f[iOi]) * Number(f[iPx]);
    if (!Number.isFinite(notional)) continue;
    if (f[iType] === 'STF' || f[iType] === 'FUTSTK') stock += notional;
    else if (f[iType] === 'IDF' || f[iType] === 'FUTIDX') index += notional;
  }
  return { stock: Math.round(stock / 1e7), index: Math.round(index / 1e7) }; // ₹ crore
}

// Local cache of parsed bhavcopies (date → totals, or null for a holiday) so rebuilds and
// re-runs don't re-download ~1 MB per day from NSE.
const CACHE_FILE = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'leverage', 'fo-cache.json');
const foCache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const saveCache = () => { mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); writeFileSync(CACHE_FILE, JSON.stringify(foCache)); };

async function futuresOn(date) {
  // Only past dates are cacheable; today's file may not be published yet.
  if (date in foCache && date < todayIst()) return foCache[date] && { date, ...foCache[date] };
  const r = await fetchFutures(date);
  if (date < todayIst()) foCache[date] = r && { stock: r.stock, index: r.index };
  return r;
}

async function fetchFutures(date) {
  for (const url of bhavUrls(date)) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90_000) });
    if (!res.ok) continue;
    let text;
    try { text = strFromU8(Object.values(unzipSync(new Uint8Array(await res.arrayBuffer())))[0]); } catch { continue; }
    const r = parseFutures(text);
    if (r.stock + r.index > 0) return { date, ...r };
  }
  return null; // holiday / not published yet
}

// The week's last trading day: try Friday back to Monday, never past today.
async function futuresForWeek(friday, today) {
  for (let k = 0; k < 5; k++) {
    const d = addDays(friday, -k);
    if (d > today) continue;
    const r = await futuresOn(d);
    if (r) return r;
  }
  return null;
}

// ── Market cap and indices ───────────────────────────────────────────────────

async function nseSession() {
  const home = await fetch('https://www.nseindia.com/market-data/business-growth-cm-segment', { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
  const cookie = home.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  return async p => {
    const res = await fetch(`https://www.nseindia.com${p}`, { headers: { 'User-Agent': UA, Cookie: cookie, Referer: 'https://www.nseindia.com/' }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`NSE ${p} HTTP ${res.status}`);
    return res.json();
  };
}

// Today's total market cap (₹ crore).
async function nseMarketCapToday(nse) {
  const { marketcap } = await nse('/api/marketStatus');
  const [d, m, y] = marketcap.timeStamp.split('-');
  return { date: `${y}-${String(MON.indexOf(m.toUpperCase()) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`, crore: Math.round(marketcap.marketCapinCRRupees) };
}

// Official month-end market cap from NSE's business-growth statistics, one financial year per call.
async function nseMonthEndMarketCap(nse, fromYear, toYear) {
  const out = [];
  for (let fy = fromYear; fy <= toYear; fy++) {
    const { data = [] } = await nse(`/api/historicalOR/cm/tbg/monthly?from=${fy}&to=${fy + 1}`);
    for (const { data: r } of data) {
      const [mon, yy] = (r.GLM_MONTH_YEAR || '').split('-');
      const m = MON.indexOf((mon || '').toUpperCase());
      const v = Number(r.GTM_MKT_CAP);
      if (m < 0 || !v) continue;
      const monthEnd = iso(new Date(Date.UTC(2000 + Number(yy), m + 1, 0)));
      out.push({ date: monthEnd, crore: Math.round(v) });
    }
  }
  return out;
}

async function weeklyCloses(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=${YEARS + 1}y`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  const r = (await res.json()).chart.result[0];
  const out = new Map();
  r.timestamp.forEach((t, i) => {
    const c = r.indicators.quote[0].close[i];
    if (c != null) out.set(fridayOf(iso(new Date(t * 1000 + 5.5 * 3600_000))), Math.round(c * 100) / 100);
  });
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const today = todayIst();
  const thisFriday = fridayOf(today);
  const firstFriday = fridayOf(addDays(today, -Math.round(YEARS * 365.25)));
  const fridays = [];
  for (let f = firstFriday; f <= thisFriday; f = addDays(f, 7)) fridays.push(f);

  const marketCap = async () => {
    const nse = await nseSession();
    const firstYear = Number(firstFriday.slice(0, 4)) - 1, thisYear = Number(today.slice(0, 4));
    const [now, monthEnds] = await Promise.all([
      nseMarketCapToday(nse).catch(e => { log(`warn: today's market cap unavailable (${e.message})`); return null; }),
      nseMonthEndMarketCap(nse, firstYear, thisYear),
    ]);
    return { now, monthEnds };
  };
  const [prev, mtf, nifty, nifty500, { now: mcapNow, monthEnds }] = await Promise.all([
    readBlob(), mtfDaily(), weeklyCloses('^NSEI'), weeklyCloses('^CRSLDX'), marketCap(),
  ]);
  log(`market cap anchors: ${monthEnds.length} NSE month-ends${mcapNow ? ` + today ₹${mcapNow.crore} Cr` : ''}`);
  const prevBy = new Map((prev?.weeks ?? []).map(w => [w.week, w]));

  // Futures: completed weeks are fetched once; the current (or any unfinished) week is refreshed.
  const needFut = fridays.filter(f => REBUILD_FUT || !prevBy.get(f)?.futFinal);
  log(`${fridays.length} weeks · futures to fetch: ${needFut.length}`);
  let done = 0;
  const fetched = new Map((await mapLimit(needFut, 3, async f => {
    const r = await futuresForWeek(f, today);
    if (++done % 25 === 0) log(`futures ${done}/${needFut.length}`);
    return r && [f, r];
  })).filter(Boolean));
  saveCache();

  // Market cap anchors: NSE's official month-end figures plus today's reading. Each week uses the
  // nearest anchor, moved by the Nifty 500 between the two dates (at most ~2 weeks of drift).
  const actual = new Map(monthEnds.map(a => [fridayOf(a.date), a.crore]));
  if (mcapNow) actual.set(fridayOf(mcapNow.date), mcapNow.crore);
  const anchors = [...actual.entries()].filter(([w]) => nifty500.has(w)).sort();

  const weeks = fridays.map(week => {
    const p = prevBy.get(week);
    const m = mtf.filter(r => r.date <= week && r.date > addDays(week, -7)).at(-1);
    const f = fetched.get(week) ?? (p?.futDate ? { date: p.futDate, stock: p.futStock, index: p.futIndex } : null);
    let mcap = actual.get(week) ?? null, mcapEstimated = false;
    if (mcap == null && anchors.length && nifty500.has(week)) {
      // Nearest actual reading in time, scaled by the index move since then.
      const [aw, av] = anchors.reduce((best, a) => Math.abs(Date.parse(a[0]) - Date.parse(week)) < Math.abs(Date.parse(best[0]) - Date.parse(week)) ? a : best);
      mcap = Math.round(av * nifty500.get(week) / nifty500.get(aw));
      mcapEstimated = true;
    }
    const fut = f ? f.stock + f.index : null;
    const combined = m && fut != null ? m.total + fut : null;
    return {
      week,
      mtfDate: m?.date ?? null, mtf: m?.total ?? null, mtfNse: m?.nse ?? null, mtfBse: m?.bse ?? null,
      futDate: f?.date ?? null, futStock: f?.stock ?? null, futIndex: f?.index ?? null, fut,
      // Final once the week's Friday has passed; until then the next run refreshes it.
      futFinal: !!f && week < today,
      combined, mcap, mcapEstimated,
      levPct: combined != null && mcap ? Math.round((combined / mcap) * 10000) / 100 : null,
      nifty: nifty.get(week) ?? null, nifty500: nifty500.get(week) ?? null,
    };
  });

  const history = {
    generatedAt: new Date().toISOString(),
    latestMarketCap: mcapNow,
    weeks,
    sources: {
      mtf: { name: 'IndiaMTF.com', url: 'https://indiamtf.com', note: 'NSE + BSE MTF disclosures, combined funded book' },
      futures: { name: 'NSE F&O bhavcopy', url: 'https://www.nseindia.com/all-reports-derivatives', note: 'Stock + index futures, OI × settlement price' },
      marketCap: { name: 'NSE total market capitalisation', url: 'https://www.nseindia.com/market-data/business-growth-cm-segment', note: 'Official NSE month-end figures and the latest daily reading; weeks in between moved by the Nifty 500' },
      nifty: { name: 'Yahoo Finance', note: 'Nifty 50 / Nifty 500 weekly closes' },
    },
  };

  const missing = weeks.filter(w => w.combined == null).map(w => w.week);
  log(`built ${weeks.length} weeks in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${missing.length} incomplete${missing.length ? ` (${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''})` : ''}`);
  const last = weeks.filter(w => w.combined != null).at(-1);
  if (last) log(`latest ${last.week}: MTF ₹${last.mtf} Cr + futures ₹${last.fut} Cr = ₹${last.combined} Cr · ${last.levPct}% of mcap ₹${last.mcap} Cr${last.mcapEstimated ? ' (est.)' : ''}`);

  const same = prev && JSON.stringify(prev.weeks) === JSON.stringify(weeks);
  if (DRY) {
    const file = path.join(os.tmpdir(), KEY);
    writeFileSync(file, JSON.stringify(history, null, 1));
    log(`dry run → ${file}`);
  } else if (same) log('leverage history unchanged');
  else {
    await put(KEY, JSON.stringify(history), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    log('leverage history published');
  }
}

main().catch(e => { log('fatal:', e.message); process.exit(1); });
