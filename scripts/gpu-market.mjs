// Publishes the GPU rental market summary (Supply-Demand + AI Risk tabs) to Vercel Blob.
// Runs on the office PC because GetDeploying blocks cloud-server IPs (Vercel gets HTTP 403).
// No LLM involved: a ~4 MB download and some arithmetic. Usage: node scripts/gpu-market.mjs [--dry-run]

import './load-env.mjs';
import { put, head, BlobNotFoundError } from '@vercel/blob';
import { GPU_DATASET_URL, summarizeGpuMarket } from '../lib/gpu-market.ts';

const KEY = 'gpu-market.json';
const DRY = process.argv.includes('--dry-run');
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

const res = await fetch(GPU_DATASET_URL, { signal: AbortSignal.timeout(60_000) });
if (!res.ok) { log(`GPU dataset HTTP ${res.status}`); process.exit(1); }
const { data } = await res.json();
const market = summarizeGpuMarket(data);

// Skip the write when nothing but the timestamp changed (keeps Blob operations low).
const sameAs = prev => prev && JSON.stringify({ ...prev, fetchedAt: 0 }) === JSON.stringify({ ...market, fetchedAt: 0 });
const meta = await head(KEY).catch(e => { if (e instanceof BlobNotFoundError) return null; throw e; });
const prev = meta ? await fetch(`${meta.url}?t=${Date.now()}`).then(r => (r.ok ? r.json() : null)) : null;

const summary = `week ${market.asOf} · ${market.verdict} · index 4w ${market.index.chg4w}% 1y ${market.index.chg52w}%`;
if (DRY) log(`dry run: ${summary}`);
else if (sameAs(prev) && Date.now() - Date.parse(prev.fetchedAt) < 24 * 3600_000) log(`GPU market unchanged (${summary})`);
else {
  await put(KEY, JSON.stringify(market), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
  log(`GPU market published: ${summary}`);
}
