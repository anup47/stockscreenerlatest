import { unstable_cache } from 'next/cache';
import { readJsonBlob } from './blob-json';
import { generateTOTP } from './totp';
import { INDEX_KEY, DEALS_KEY, shardKey, type BhavIndex, type BhavShard, type DealsFile } from './big-player';

// The PC publishes once per trading day; the index's updatedAt keys the shard cache so a new day shows up
// as soon as the index cache (30 min) refreshes.
export const readBhavIndex = unstable_cache(() => readJsonBlob<BhavIndex | null>(INDEX_KEY, () => null), ['big-player-index'], { revalidate: 1800 });
export const readBhavShard = unstable_cache(
  (i: number, _version: string) => readJsonBlob<BhavShard | null>(shardKey(i), () => null),
  ['big-player-shard'], { revalidate: 86400 },
);
export const readDeals = unstable_cache(
  (_version: string) => readJsonBlob<DealsFile | null>(DEALS_KEY, () => null),
  ['big-player-deals'], { revalidate: 86400 },
);

// ── Server-side Dhan credentials ─────────────────────────────────────────────
// DHAN_ACCESS_TOKEN expires after about a day. When DHAN_PIN and DHAN_TOTP_SECRET are also set, an expired
// token is replaced by a freshly generated one, held in this server instance's memory only (never stored).
let renewed: { token: string; at: number } | null = null;

export function envDhanCreds(): { clientId: string; accessToken: string } | null {
  const clientId = process.env.DHAN_CLIENT_ID;
  if (!clientId) return null;
  const accessToken = renewed && Date.now() - renewed.at < 20 * 3600_000 ? renewed.token : process.env.DHAN_ACCESS_TOKEN;
  if (accessToken) return { clientId, accessToken };
  return process.env.DHAN_PIN && process.env.DHAN_TOTP_SECRET ? { clientId, accessToken: '' } : null;
}

export async function renewEnvToken(): Promise<string | null> {
  const clientId = process.env.DHAN_CLIENT_ID, pin = process.env.DHAN_PIN, secret = process.env.DHAN_TOTP_SECRET;
  if (!clientId || !pin || !secret) return null;
  const url = `https://auth.dhan.co/app/generateAccessToken?dhanClientId=${encodeURIComponent(clientId)}&pin=${encodeURIComponent(pin)}&totp=${generateTOTP(secret)}`;
  const res = await fetch(url, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => null) as { accessToken?: string } | null;
  if (!res.ok || !body?.accessToken) return null;
  renewed = { token: body.accessToken, at: Date.now() };
  return body.accessToken;
}

// ── Dhan HQ v2 charts ────────────────────────────────────────────────────────

export type DhanStatus = 'ok' | 'no_credentials' | 'expired' | 'not_subscribed' | 'rate_limited' | 'error';
export class DhanError extends Error { constructor(public status: DhanStatus, message: string) { super(message); } }
export interface DhanCandles { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[]; timestamp: number[] }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Dhan allows 5 data requests per second; a 429 / DH-904 is retried twice with backoff before giving up.
export async function dhanCharts(kind: 'historical' | 'intraday', body: Record<string, unknown>, creds: { clientId: string; accessToken: string }): Promise<DhanCandles> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.dhan.co/v2/charts/${kind}`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { 'access-token': creds.accessToken, 'client-id': creds.clientId, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null) as (Partial<DhanCandles> & { errorCode?: string; errorMessage?: string; status?: string }) | null;
    const code = json?.errorCode ?? '';
    if (res.status === 429 || code === 'DH-904' || code === '805') { await sleep(1200 * 2 ** attempt); continue; }
    if (res.status === 401 || code === 'DH-901') throw new DhanError('expired', 'Dhan access token is invalid or expired. Generate a new one at web.dhan.co and update DHAN_ACCESS_TOKEN.');
    if (code === 'DH-902') throw new DhanError('not_subscribed', 'This Dhan account has no Data API subscription, which historical and intraday candles need.');
    if (!res.ok || code) throw new DhanError('error', `Dhan ${kind}: ${json?.errorMessage ?? `HTTP ${res.status}`}${code ? ` (${code})` : ''}`);
    return { open: json?.open ?? [], high: json?.high ?? [], low: json?.low ?? [], close: json?.close ?? [], volume: json?.volume ?? [], timestamp: json?.timestamp ?? [] };
  }
  throw new DhanError('rate_limited', 'Dhan rate limit hit (5 requests a second). Intraday flow was skipped; search again in a minute.');
}
