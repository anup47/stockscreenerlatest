'use client';
import { useState, useEffect } from 'react';

export interface LiveQuote {
  price:     number;
  change:    number;
  changePct: number;
}

const REFRESH_MS = 30_000;

export function useLivePrices(symbols: string[]): Map<string, LiveQuote> {
  const [prices, setPrices] = useState<Map<string, LiveQuote>>(new Map());

  // Stable string key — effect only re-runs when symbol set actually changes
  const symKey = [...symbols].sort().join(',');

  useEffect(() => {
    if (!symKey) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/live-prices?symbols=${encodeURIComponent(symKey)}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json() as { prices: Record<string, LiveQuote> };
        if (!cancelled) setPrices(new Map(Object.entries(json.prices ?? {})));
      } catch { /* silent — no live data fallback to scan prices */ }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [symKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return prices;
}
