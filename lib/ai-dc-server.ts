import { unstable_cache } from 'next/cache';
import { yahooDaily } from './commodities/sources';
import { getGpuMarket } from './gpu-market-server';
import {
  LAYERS, PULSE_SYMBOLS, ANTHROPIC_IPO_PRICE, stockStat, layerStat, pulseSignals,
  type AiDcData, type Bar, type StockStat,
} from './ai-dc';

// Yahoo answers ~70 parallel chart calls slowly; a small pool keeps each one inside its timeout.
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function buildAiDc(): Promise<AiDcData> {
  const symbols = [...new Set([...LAYERS.flatMap(l => l.stocks.map(s => s.yahoo)), ...Object.values(PULSE_SYMBOLS)])];
  const [fetched, gpu] = await Promise.all([
    pool(symbols, 12, async sym => [sym, await yahooDaily(sym, '1y').catch(() => null)] as const),
    getGpuMarket().catch(() => null),
  ]);
  const bars = new Map<string, Bar[]>();
  for (const [sym, b] of fetched) if (b?.length) bars.set(sym, b);
  const failed = symbols.filter(s => !bars.has(s));
  const get = (sym: string) => bars.get(sym) ?? [];

  const bench3m = (sym: string) => stockStat({ symbol: sym, yahoo: sym, name: sym, role: '' }, get(sym), 'USD')?.chg3m ?? null;
  const nifty3m = bench3m(PULSE_SYMBOLS.nifty), ndx3m = bench3m(PULSE_SYMBOLS.ndx);

  const layers = LAYERS.map(layer => {
    const stocks = layer.stocks
      .map(s => stockStat(s, get(s.yahoo), s.yahoo.endsWith('.NS') ? 'INR' : 'USD'))
      .filter((s): s is StockStat => s != null);
    return layerStat(layer, stocks, layer.india ? nifty3m : ndx3m);
  });

  const antBars = get('ANT');
  const ant = antBars.at(-1);
  return {
    asOf: new Date().toISOString(),
    pulse: pulseSignals({
      chips: stockStat({ symbol: 'SOXX', yahoo: 'SOXX', name: 'SOXX', role: '' }, get(PULSE_SYMBOLS.chips), 'USD'),
      spend: layers.find(l => l.key === 'spend'),
      gpu: gpu ? { chg13w: gpu.index.chg13w, verdict: gpu.verdict, asOf: gpu.asOf } : null,
      us10y: get(PULSE_SYMBOLS.us10y), vix: get(PULSE_SYMBOLS.vix), usdinr: get(PULSE_SYMBOLS.usdinr),
    }),
    layers,
    bench: { nifty3m, ndx3m },
    anthropic: ant?.c ? {
      price: ant.c, ipoPrice: ANTHROPIC_IPO_PRICE,
      vsIpo: Math.round(((ant.c - ANTHROPIC_IPO_PRICE) / ANTHROPIC_IPO_PRICE) * 1000) / 10,
      high: Math.max(...antBars.map(b => b.h ?? b.c ?? 0)) || null,
      low: Math.min(...antBars.map(b => b.l ?? b.c ?? Infinity)),
      sessions: antBars.length,
    } : null,
    failed,
  };
}

export const getAiDc = unstable_cache(buildAiDc, ['ai-dc-v1'], { revalidate: 900 });
