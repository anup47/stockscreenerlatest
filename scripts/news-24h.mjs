// Builds the "24H News Summary" feed for every stock on the Research Targets tab and publishes it
// to Vercel Blob (news-24h.json). Runs hourly on the office PC: NSE's APIs block cloud servers,
// and the summaries come from the local Qwen model.
// Usage: node scripts/news-24h.mjs [--dry-run] [--no-llm] [--only SYMBOL_REGEX]

import './load-env.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { put, head, BlobNotFoundError } from '@vercel/blob';
import { ensureOllama, chatJson } from './ollama.mjs';
import researchList from '../lib/research-list.json' with { type: 'json' };

// 7b, not the 3b used for PDFs: in A/B tests 3b discarded material stories as "unrelated" and
// over-rated impact; news prompts are short, so 7b stays within the hourly budget.
const MODEL      = process.env.NEWS_LLM_MODEL || 'qwen2.5:7b';
const WINDOW_H   = 24;
const LLM_BUDGET = (Number(process.env.NEWS_LLM_BUDGET_MIN) || 40) * 60_000;
const BATCH      = 6;
const FEED_KEY   = 'news-24h.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const args   = process.argv.slice(2);
const DRY    = args.includes('--dry-run');
const NO_LLM = args.includes('--no-llm');
const ONLY   = args.includes('--only') ? new RegExp(args[args.indexOf('--only') + 1], 'i') : null;

const log    = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);
const since  = Date.now() - WINDOW_H * 3600_000;
const health = {};

// ── Sector & macro context ───────────────────────────────────────────────────
// Google News queries per sector: domestic drivers, commodities, and global peers.
// Sectors not listed (e.g. new PDF-only stocks) fall back to "<sector> sector India".
const SECTOR_QUERIES = {
  'Pharma':          ['India pharma USFDA', 'generic drugmakers Teva Viatris Sun Pharma'],
  'Consumer Health': ['India consumer health OTC', 'Procter & Gamble Haleon Kenvue'],
  'Consumer':        ['India FMCG rural demand', 'Hindustan Unilever Nestle India Dabur Varun Beverages'],
  'Real Estate':     ['India housing sales real estate', 'Godrej Properties Lodha DLF'],
  'Recycling':       ['India EPR battery waste recycling', 'LME lead price'],
  'Industrials':     ['India capital goods order inflow', 'Siemens ABB Larsen & Toubro order'],
  'Auto Components': ['India auto sales', 'auto component exports Bharat Forge Motherson'],
  'Chemicals':       ['India specialty chemicals', 'China chemical prices dumping India'],
  'Metals':          ['LME aluminium price', 'LME copper price', 'Novelis Alcoa Vedanta aluminium'],
  'Materials':       ['graphite electrode prices', 'steel demand India refractories'],
  'Defence':         ['India defence ministry contract', 'Defence Acquisition Council approval'],
  'Financials':      ['RBI banks NBFC', 'India wealth management brokerage'],
  'Fintech':         ['India UPI digital payments fintech', 'Paytm PhonePe Razorpay'],
  'Healthcare':      ['India hospitals sector', 'Apollo Hospitals Max Healthcare'],
  'Media':           ['India music streaming royalty', 'Saregama Tips Music Universal Music'],
  'Energy':          ['Brent crude oil price', 'fuel cell data center power Bloom Energy'],
  'Hotels':          ['India hotel occupancy room rates', 'Marriott Hilton Hyatt outlook'],
};
const MACRO_QUERIES = ['rupee dollar RBI', 'US Treasury yields Federal Reserve', 'FPI flows Indian equities', 'Sensex Nifty today'];

// ── Small helpers ────────────────────────────────────────────────────────────

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'at', 'by', 'with', 'from', 'ltd', 'limited', 'is', 'as']);
const tokens = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
const norm   = s => tokens(s).join(' ');
const hash   = s => createHash('sha1').update(s).digest('hex').slice(0, 12);
const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// NSE timestamps are IST like "02-Oct-2026 13:34:05" (deals carry only a date → 15:30 close).
function istToIso(s) {
  const m = s.match(/(\d{1,2})-(\w{3})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m || MONTHS[m[2]] == null) return null;
  const [, d, mon, y, h = '15', mi = '30', se = '0'] = m;
  return new Date(Date.UTC(+y, MONTHS[mon], +d, +h - 5, +mi - 30, +se)).toISOString();
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i]).catch(() => null); }
  }));
  return out;
}

async function readJson(key, empty) {
  const meta = await head(key).catch(e => { if (e instanceof BlobNotFoundError) return null; throw e; });
  if (!meta) return empty;
  const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' });
  return res.ok ? await res.json() : empty;
}

// ── Universe: every stock on the Research Targets tab ───────────────────────

async function loadUniverse() {
  const stocks = researchList.map(r => ({
    symbol: r.symbol.toUpperCase(), company: r.company, sector: r.sector, yfSymbol: r.yfSymbol, currency: r.currency || 'INR',
  }));
  // Same rule as app/api/research-targets: PDF-only stocks with a target get their own row.
  const { overrides = {} } = await readJson('research-targets-overrides.json', {});
  const listed = new Set(stocks.map(s => s.symbol));
  for (const [sym, ov] of Object.entries(overrides)) {
    if (listed.has(sym) || (ov.baseTarget == null && ov.bullTarget == null)) continue;
    stocks.push({ symbol: sym, company: ov.company, sector: ov.sector || 'Research', yfSymbol: /^\d+$/.test(sym) ? `${sym}.BO` : `${sym}.NS`, currency: 'INR' });
  }
  return ONLY ? stocks.filter(s => ONLY.test(s.symbol)) : stocks;
}

// "IHCL (Indian Hotels)" → query `"IHCL" OR "Indian Hotels"`; headline must mention one of the terms.
const GENERIC = new Set(['central', 'indian', 'india', 'global', 'national', 'united', 'general', 'first', 'new', 'shree']);
function nameTerms(stock) {
  const parts = stock.company.split(/[()]/).map(p => p.replace(/\b(limited|ltd)\b\.?/gi, '').trim()).filter(Boolean);
  const terms = new Set(parts.map(norm).filter(Boolean));
  for (const p of parts) {
    const first = tokens(p)[0];
    if (first?.length >= 5 && !GENERIC.has(first)) terms.add(first);
  }
  if (!/^\d+$/.test(stock.symbol) && stock.symbol.length >= 4) terms.add(stock.symbol.toLowerCase());
  const query = parts.map(p => (p.length <= 4 ? `"${p}" (shares OR stock)` : `"${p}"`)).join(' OR ');
  return { query, terms: [...terms] };
}
const mentions = (text, terms) => { const t = ` ${norm(text)} `; return terms.some(term => t.includes(` ${term} `)); };

// ── Sources ──────────────────────────────────────────────────────────────────

let googleFailures = 0;
async function googleNews(query, limit) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) { googleFailures++; throw new Error(`Google News ${res.status}`); }
  const xml = await res.text();
  return xml.split('<item>').slice(1).map(chunk => {
    const tag = t => decode((chunk.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '');
    const source = tag('source'), raw = tag('title'), ts = Date.parse(tag('pubDate'));
    return {
      headline: source && raw.endsWith(` - ${source}`) ? raw.slice(0, -source.length - 3) : raw,
      source: source || 'Google News',
      link: tag('link'),
      time: Number.isNaN(ts) ? null : new Date(ts).toISOString(),
    };
  }).filter(i => i.headline && i.time && Date.parse(i.time) >= since).slice(0, limit);
}

async function collectGoogle(universe) {
  const company = await mapLimit(universe, 4, async s => {
    const { query, terms } = nameTerms(s);
    return (await googleNews(query, 10))
      .filter(i => mentions(i.headline, terms))
      .map(i => ({ ...i, kind: 'Company', tickers: [s.symbol], label: s.symbol, company: s.company }));
  });

  const sectors = [...new Set(universe.map(s => s.sector))];
  const sectorJobs = sectors.flatMap(sec => (SECTOR_QUERIES[sec] || [`${sec} sector India`]).map(q => ({ sec, q })));
  const sector = await mapLimit(sectorJobs, 4, async ({ sec, q }) => (await googleNews(q, 6)).map(i => ({
    ...i, kind: 'Sector', label: sec, company: `${sec} · sector & global peers`,
    tickers: universe.filter(s => s.sector === sec).map(s => s.symbol),
  })));

  const macro = await mapLimit(MACRO_QUERIES, 4, async q => (await googleNews(q, 5)).map(i => ({
    ...i, kind: 'Macro', label: 'MACRO', company: 'Market & macro', tickers: [],
  })));

  const all = [...company, ...sector, ...macro].filter(Boolean).flat();
  health.googleNews = `ok (${all.length} items, ${googleFailures} failed queries)`;
  return all;
}

const nseDate = d => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d).replace(/\//g, '-');

async function collectNse(universe) {
  const bySym = new Map(universe.map(s => [s.symbol, s]));
  const home = await fetch('https://www.nseindia.com/', { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
  const cookie = home.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const nse = async p => {
    const r = await fetch(`https://www.nseindia.com${p}`, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://www.nseindia.com/', Cookie: cookie }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const out = [];

  try {
    const rows = await nse(`/api/corporate-announcements?index=equities&from_date=${nseDate(new Date(since))}&to_date=${nseDate(new Date())}`);
    for (const r of rows) {
      const s = bySym.get(r.symbol), time = istToIso(r.an_dt || '');
      if (!s || !time || Date.parse(time) < since) continue;
      out.push({
        kind: 'Filing', tickers: [s.symbol], label: s.symbol, company: s.company,
        headline: r.desc, detail: r.attchmntText || '', source: 'NSE filing',
        link: r.attchmntFile || `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(s.symbol)}`, time,
      });
    }
    health.nseFilings = `ok (${rows.length} market-wide, ${out.length} ours)`;
  } catch (e) { health.nseFilings = `error: ${e.message}`; }

  try {
    const deals = await nse('/api/snapshot-capital-market-largedeal');
    const before = out.length;
    for (const [name, rows] of [['Bulk', deals.BULK_DEALS_DATA], ['Block', deals.BLOCK_DEALS_DATA]]) {
      for (const d of rows || []) {
        const s = bySym.get(d.symbol), time = istToIso(d.date || '');
        if (!s || !time || Date.parse(time) < since) continue;
        out.push({
          kind: 'Deal', tickers: [s.symbol], label: s.symbol, company: s.company,
          headline: `${name} deal: ${d.clientName} ${d.buySell === 'BUY' ? 'bought' : 'sold'} ${Number(d.qty).toLocaleString('en-IN')} shares at ₹${d.watp}`,
          source: 'NSE bulk/block deals', link: 'https://www.nseindia.com/market-data/large-deals', time,
        });
      }
    }
    health.nseDeals = `ok (${deals.as_on_date}, ${out.length - before} ours)`;
  } catch (e) { health.nseDeals = `error: ${e.message}`; }

  return out;
}

const istDay = sec => new Date(sec * 1000 + 5.5 * 3600_000).toISOString().slice(0, 10);

// Move ≥3% vs previous close, or volume ≥2.5x the 20-session average. Classified by rule, not Qwen.
async function priceAlert(s) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.yfSymbol)}?interval=1d&range=1mo`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  const res = r.ok ? (await r.json())?.chart?.result?.[0] : null;
  const { regularMarketPrice: price, regularMarketVolume: vol, regularMarketTime: t } = res?.meta ?? {};
  if (!price || !t || t * 1000 < since) return null;

  const today = istDay(t), q = res.indicators.quote[0];
  const prior = res.timestamp.map((ts, i) => ({ day: istDay(ts), c: q.close[i], v: q.volume[i] })).filter(b => b.c != null && b.day < today);
  if (!prior.length) return null;
  const prevClose = prior.at(-1).c;
  const vols = prior.slice(-20).map(b => b.v).filter(v => v > 0);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const chg = (price - prevClose) / prevClose * 100;
  const volX = avgVol && vol ? vol / avgVol : 0;
  if (Math.abs(chg) < 3 && volX < 2.5) return null;

  const cur = s.currency === 'USD' ? '$' : '₹';
  const volTxt = volX >= 2.5 ? ` on ${volX.toFixed(1)}x its 20-day average volume` : '';
  const abs = Math.abs(chg);
  return {
    id: hash(`price|${s.symbol}|${today}`),
    kind: 'Price', tickers: [s.symbol], label: s.symbol, company: s.company,
    headline: `${s.symbol} ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}% to ${cur}${price.toLocaleString('en-IN')}${volTxt}`,
    source: 'Price/volume alert', link: `https://finance.yahoo.com/quote/${encodeURIComponent(s.yfSymbol)}`,
    time: new Date(t * 1000).toISOString(),
    summary: `${s.company} ${chg >= 0 ? 'rose' : 'fell'} ${abs.toFixed(1)}% versus the previous close${volTxt}.`,
    sentiment: abs < 1 ? 'Neutral' : chg > 0 ? 'Positive' : 'Negative',
    impact: Math.min(5, (abs >= 8 ? 5 : abs >= 5 ? 4 : abs >= 3 ? 3 : 2) + (volX >= 3 ? 1 : 0)),
    pending: false, relevant: true,
  };
}

// ── De-duplication ───────────────────────────────────────────────────────────

// Filings/deals are per-company facts (two companies can file the same "Trading Window" notice);
// news headlines are de-duplicated across queries and sources by wording.
const idOf = it => it.id ?? (it.kind === 'Filing' || it.kind === 'Deal'
  ? hash(`${it.kind}|${it.tickers[0]}|${norm(it.headline)}|${it.time}`)
  : hash(norm(it.headline)));
const NEWSY = new Set(['Company', 'Sector', 'Macro']);
const PRIORITY = { Filing: 0, Deal: 1, Price: 2, Company: 3, Sector: 4, Macro: 5 };
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };

function dedupe(items) {
  const kept = [];
  for (const it of [...items].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.time.localeCompare(b.time))) {
    const toks = new Set(tokens(it.headline));
    const dup = kept.find(k => k.id === it.id || (it.link && k.link === it.link)
      || (NEWSY.has(k.kind) && NEWSY.has(it.kind) && jaccard(k.toks, toks) >= 0.6));
    if (dup) dup.item.tickers = [...new Set([...dup.item.tickers, ...it.tickers])];
    else kept.push({ id: it.id, link: it.link, kind: it.kind, toks, item: { ...it } });
  }
  return kept.map(k => k.item);
}

// ── Classification ───────────────────────────────────────────────────────────

const POS = /\b(orders?|wins?|won|bags?|secures?|contracts?|upgraded?|upgrades|raises? (target|stake)|profit (rises|jumps|surges|grows)|record|expansion|expands?|capacity|approvals?|approved|approves|launch(es|ed)?|acquires?|acquisition|buyback|dividend|beats?|surges?|rall(y|ies)|jumps?|soars?)\b/i;
const NEG = /\b(downgraded?|downgrades|cuts? (target|guidance)|loss(es)?|declines?|declined|falls?|fell|plunges?|slumps?|miss(es|ed)?|probe|penalty|fined?|raids?|fire|accident|resigns?|resignation|default|pledge[ds]?|sells? stake|stake sale|warning letter|bans?|recall|strike|shutdown|form 483|litigation|tumbles?|crash(es)?|slides?)\b/i;
const ROUTINE = /trading window|newspaper|intimation|share certificate|investor meet|analyst(s)? meet|conference call|book closure|compliance certificate|regulation 74|record date/i;

function ruleClassify(it) {
  const text = `${it.headline} ${it.detail || ''}`;
  const pos = POS.test(text), neg = NEG.test(text);
  const sentiment = pos && !neg ? 'Positive' : neg && !pos ? 'Negative' : 'Neutral';
  const impact = ROUTINE.test(text) ? 1 : !NEWSY.has(it.kind) || it.kind === 'Company' ? (sentiment === 'Neutral' ? 2 : 3) : 2;
  return { summary: it.kind === 'Filing' && it.detail ? it.detail.slice(0, 220) : it.headline, sentiment, impact, relevant: true, pending: true };
}

const LLM_PROMPT = `You are a sell-side equity analyst screening news for an Indian stock portfolio. For each numbered item return:
- relevant: true when the item concerns the named company's own business, results, orders, deals, management, regulators or stock, even if the company is only part of the story. For SECTOR/MACRO items: true only if it can move that sector's or Indian equities' earnings or valuations. false for namesakes (songs, people, places), items where the company is only a broker or commentator on ANOTHER company, tokenised/crypto copies of the stock, and bare quote pages.
- summary: ONE professional line, at most 30 words: what happened, with the figure (Rs crore, %, $) when given, and why it matters for the stock. Do not just repeat the headline.
- sentiment, by effect on this stock's price or fundamentals:
  Positive = order win, upgrade or target raise, profit growth, capacity expansion, regulatory approval, promoter/insider buying, deal completed
  Negative = downgrade or target cut, poor results, promoter selling, regulatory or legal action against the company, accident/fire, deal terminated or delayed, pledging
  Neutral = routine filings (ESOP grants, retirements, meeting notices), conferences, generic sector news
- impact on THIS stock:
  1 = routine/noise (ESOPs, retirements, meeting notices, quote pages)
  2 = minor, or a recap of old moves ("shares up X% in six months", stock-tip lists)
  3 = notable but not estimate-changing (small order, analyst target change, senior hire)
  4 = likely to change estimates (large order relative to revenue, results, guidance change, M&A update)
  5 = clearly price-sensitive today (results surprise, transformational order or M&A, regulatory ban, major accident)
  SECTOR and MACRO items are at most 3.
Return a result for every item, using its number as "n".

ITEMS:
`;
const LLM_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          relevant: { type: 'boolean' },
          summary: { type: 'string' },
          sentiment: { type: 'string', enum: ['Positive', 'Negative', 'Neutral'] },
          impact: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['n', 'relevant', 'summary', 'sentiment', 'impact'],
      },
    },
  },
  required: ['results'],
};

async function classifyBatch(batch) {
  const lines = batch.map((it, i) => {
    const who = it.kind === 'Macro' ? 'MACRO — Indian market' : it.kind === 'Sector' ? `SECTOR — ${it.label}` : `${it.label} — ${it.company}`;
    const detail = it.detail ? ` | Detail: ${it.detail.slice(0, 300)}` : '';
    return `${i + 1}. [${it.kind}] ${who} | ${it.headline} (${it.source})${detail}`;
  });
  const { results } = await chatJson(MODEL, LLM_PROMPT + lines.join('\n'), LLM_SCHEMA);
  for (const r of results || []) {
    const it = batch[r.n - 1];
    if (!it) continue;
    const impact = Math.min(5, Math.max(1, Math.round(r.impact) || it.impact));
    Object.assign(it, {
      // Exchange filings and deals are about the company by definition.
      relevant: it.kind === 'Filing' || it.kind === 'Deal' || r.relevant !== false,
      summary: (r.summary || '').trim() || it.summary,
      sentiment: ['Positive', 'Negative', 'Neutral'].includes(r.sentiment) ? r.sentiment : it.sentiment,
      // Sector/macro news rarely moves one stock on its own; the small model over-rates it.
      impact: it.kind === 'Sector' || it.kind === 'Macro' ? Math.min(impact, 3) : impact,
      pending: false,
      reviewedBy: MODEL,
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function writeFeed(universe, items) {
  const feed = {
    generatedAt: new Date().toISOString(),
    windowHours: WINDOW_H,
    model: MODEL,
    stocks: universe.map(({ symbol, company, sector }) => ({ symbol, company, sector })),
    items: [...items].sort((a, b) => b.time.localeCompare(a.time)),
    health,
  };
  if (DRY) {
    const file = path.join(os.tmpdir(), 'news-24h.json');
    writeFileSync(file, JSON.stringify(feed, null, 2));
    log(`dry run → ${file}`);
  } else {
    await put(FEED_KEY, JSON.stringify(feed), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    log(`published ${items.filter(i => i.relevant).length} items (${items.filter(i => i.pending).length} still on keyword rules)`);
  }
}

async function main() {
  const t0 = Date.now();
  const [universe, prev] = await Promise.all([loadUniverse(), readJson(FEED_KEY, { items: [] })]);
  log(`${universe.length} stocks · fetching news since ${new Date(since).toISOString()}`);

  const [google, nse, prices] = await Promise.all([
    collectGoogle(universe),
    collectNse(universe).catch(e => { health.nse = `error: ${e.message}`; return []; }),
    mapLimit(universe, 6, priceAlert).then(r => { const a = r.filter(Boolean); health.prices = `ok (${a.length} alerts)`; return a; }),
  ]);

  const fresh = [...google, ...nse, ...prices].map(it => ({ ...it, id: idOf(it) }));
  const freshIds = new Set(fresh.map(i => i.id));
  // Keep earlier runs' items still inside the window (Google results drift hour to hour).
  const carried = prev.items.filter(i => Date.parse(i.time) >= since && !freshIds.has(i.id));
  const items = dedupe([...fresh, ...carried]);

  // Reuse this model's earlier verdicts. New items start on keyword rules; items judged by another
  // model keep that verdict but are queued for re-review.
  const reviewed = new Map(prev.items.filter(i => !i.pending && i.reviewedBy === MODEL).map(i => [i.id, i]));
  for (const it of items) {
    if (it.kind === 'Price') continue;
    const c = reviewed.get(it.id);
    if (c) Object.assign(it, { summary: c.summary, sentiment: c.sentiment, impact: c.impact, relevant: c.relevant, pending: false, reviewedBy: MODEL });
    else if (it.pending === undefined) Object.assign(it, ruleClassify(it));
    else if (it.reviewedBy !== MODEL) it.pending = true;
  }

  const publish = () => writeFeed(universe, items);
  const queue = items.filter(i => i.pending);
  // After a gap (first run, PC was off), publish the rule-based feed now rather than after Qwen's pass.
  const prevAge = prev.generatedAt ? Date.now() - Date.parse(prev.generatedAt) : Infinity;
  if (queue.length && !NO_LLM && prevAge > 2 * 3600_000) await publish();

  if (queue.length && !NO_LLM) {
    try {
      await ensureOllama(MODEL, log);
      let done = 0;
      for (let i = 0; i < queue.length && Date.now() - t0 < LLM_BUDGET; i += BATCH) {
        const batch = queue.slice(i, i + BATCH);
        await classifyBatch(batch).catch(e => log(`Qwen batch failed: ${String(e).slice(0, 150)}`));
        done += batch.length;
        if (done % 30 === 0 || done >= queue.length) log(`Qwen reviewed ${done}/${queue.length}`);
      }
      health.llm = `ok (${MODEL}, ${items.filter(i => i.pending).length} left for next run)`;
    } catch (e) { health.llm = `error: ${e.message}`; }
  }

  await publish();

  const shown = items.filter(i => i.relevant);
  const count = s => shown.filter(i => i.sentiment === s).length;
  log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${shown.length} items (${count('Positive')} positive, ${count('Negative')} negative, ${count('Neutral')} neutral) · ${JSON.stringify(health)}`);
}

main().catch(e => { log('fatal:', e.message); process.exit(1); });
