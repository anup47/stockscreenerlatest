// Builds the Commodity Tracker feed from free sources. Runs daily (Vercel cron) and reuses the
// previous feed so long LME histories and ETF-holding readings accumulate instead of re-downloading.
import { CODES, type Bar, type CommoditiesFeed, type CommodityCode, type CommodityState, type Cot, type Curve, type DailyRow, type Metric } from './types';
import { yahooDaily, yahooLast, westmetall, fredSeries, treasury10y, blsCpi, cftcCot, isharesTonnes, googleNews, type LmeDay, type RawNews } from './sources';
import { seasonality, tagNews, computeSignal, forecast12m, PRECIOUS } from './analytics';

interface Spec {
  name: string; unit: string; inrUnit: string; priceSource: string; priceUrl: string;
  toInr: (p: number, fx: number) => number;
  yahoo?: string; lme?: 'LME_Al_cash' | 'LME_Zn_cash';
  etf?: { name: string; url: string }; cot?: string;
  curve?: { root: string; months: number[] };
  consumptionT?: number;        // approx. annual global consumption, for LME stocks in days
  news: string;
}

const SPECS: Record<CommodityCode, Spec> = {
  GOLD: {
    name: 'Gold', unit: 'USD/oz', inrUnit: '₹/10g', yahoo: 'GC=F', priceSource: 'COMEX gold futures (Yahoo Finance)', priceUrl: 'https://finance.yahoo.com/quote/GC=F',
    toInr: (p, fx) => (p * fx) / 31.1035 * 10,
    etf: { name: 'iShares Gold Trust (IAU)', url: 'https://www.ishares.com/us/products/239561/ishares-gold-trust' }, cot: '088691',
    curve: { root: 'GC', months: [2, 4, 6, 8, 10, 12] },
    news: '(gold price OR "gold prices" OR bullion) (Fed OR rate OR dollar OR war OR "central bank" OR ETF OR inflation)',
  },
  SILVER: {
    name: 'Silver', unit: 'USD/oz', inrUnit: '₹/kg', yahoo: 'SI=F', priceSource: 'COMEX silver futures (Yahoo Finance)', priceUrl: 'https://finance.yahoo.com/quote/SI=F',
    toInr: (p, fx) => p * fx * 32.1507,
    etf: { name: 'iShares Silver Trust (SLV)', url: 'https://www.ishares.com/us/products/239855/ishares-silver-trust-fund' }, cot: '084691',
    curve: { root: 'SI', months: [3, 5, 7, 9, 12] },
    news: '("silver price" OR "silver prices") (Fed OR rate OR dollar OR solar OR industrial OR ETF OR "gold")',
  },
  ALUMINIUM: {
    name: 'Aluminium', unit: 'USD/t', inrUnit: '₹/kg', lme: 'LME_Al_cash', priceSource: 'LME official cash settlement (westmetall.com)', priceUrl: 'https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Al_cash',
    toInr: (p, fx) => (p * fx) / 1000, consumptionT: 72_000_000,
    news: 'aluminium OR aluminum (China OR smelter OR LME OR stimulus OR power OR inventory OR tariff OR alumina)',
  },
  ZINC: {
    name: 'Zinc', unit: 'USD/t', inrUnit: '₹/kg', lme: 'LME_Zn_cash', priceSource: 'LME official cash settlement (westmetall.com)', priceUrl: 'https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Zn_cash',
    toInr: (p, fx) => (p * fx) / 1000, consumptionT: 13_700_000,
    news: 'zinc (LME OR smelter OR concentrate OR "treatment charges" OR China OR price OR prices OR mine OR galvanising)',
  },
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (a?: number | null, b?: number | null) => (a && b != null ? ((b - a) / a) * 100 : null);

// Last value on or before `date` from a date-sorted series.
function asOfLookup(series: { date: string; value: number }[]) {
  return (date: string) => {
    let lo = 0, hi = series.length - 1, ans: number | null = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (series[mid].date <= date) { ans = series[mid].value; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  };
}
const barsToSeries = (b: Bar[]) => b.map(x => ({ date: x.d, value: x.c }));

// Next two actively traded contract months after the current one, e.g. GCZ26.CMX / GCG27.CMX.
function curveSymbols(root: string, months: number[], today: Date) {
  const codes = 'FGHJKMNQUVXZ';
  const out: { symbol: string; ym: number }[] = [];
  for (let k = 1; out.length < 2 && k < 24; k++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
    const m = d.getUTCMonth() + 1;
    if (months.includes(m)) out.push({ symbol: `${root}${codes[m - 1]}${String(d.getUTCFullYear()).slice(2)}.CMX`, ym: d.getUTCFullYear() * 12 + m });
  }
  return out;
}

const NA = (key: string, label: string, source: string, sourceUrl?: string, frequency: Metric['frequency'] = 'monthly'): Metric =>
  ({ key, label, value: null, prev: null, unit: '', source, sourceUrl, available: false, frequency, note: 'No free automated source' });

export async function buildCommodities(prev: CommoditiesFeed | null): Promise<CommoditiesFeed> {
  const health: Record<string, string> = {};
  const safe = async <T>(name: string, p: Promise<T>): Promise<T | null> => {
    try { const v = await p; health[name] = 'ok'; return v; }
    catch (e) { health[name] = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160); return null; }
  };
  const now = new Date();
  const year = now.getUTCFullYear();

  // LME history: full 10-year backfill once, then only the current year (and last year in January).
  const lmeYears = (code: CommodityCode) => {
    const have = prev?.commodities?.[code]?.bars?.[0]?.d;
    const covered = have && Number(have.slice(0, 4)) <= year - 10;
    return covered ? (now.getUTCMonth() === 0 ? [year - 1, year] : [year]) : Array.from({ length: 11 }, (_, i) => year - 10 + i);
  };
  const lmeFetch = async (code: CommodityCode) => {
    const field = SPECS[code].lme!;
    const parts = await Promise.all(lmeYears(code).map(y => westmetall(field, y).catch(() => [] as LmeDay[])));
    const rows = parts.flat();
    if (!rows.length) throw new Error(`westmetall ${field}: no data`);
    return rows;
  };

  const today = new Date(Date.now() + 5.5 * 3600_000);
  const [gold, silver, dxyBars, inrBars, dgs10, dfii10, cpi, al, zn, cotG, cotS, iau, slv, ...rest] = await Promise.all([
    safe('Yahoo gold', yahooDaily('GC=F')), safe('Yahoo silver', yahooDaily('SI=F')),
    safe('Yahoo DXY', yahooDaily('DX-Y.NYB', '2y')), safe('Yahoo USD/INR', yahooDaily('INR=X', '2y')),
    // Official Treasury and BLS feeds first; FRED (same data) as a fallback.
    safe('US 10Y (Treasury)', treasury10y('nominal', [year - 1, year]).catch(() => fredSeries('DGS10'))),
    safe('US 10Y real (Treasury)', treasury10y('real', [year - 1, year]).catch(() => fredSeries('DFII10'))),
    safe('US CPI (BLS)', blsCpi().catch(() => fredSeries('CPIAUCSL'))),
    safe('LME aluminium', lmeFetch('ALUMINIUM')), safe('LME zinc', lmeFetch('ZINC')),
    safe('CFTC gold', cftcCot('088691')), safe('CFTC silver', cftcCot('084691')),
    safe('IAU holdings', isharesTonnes(SPECS.GOLD.etf!.url)), safe('SLV holdings', isharesTonnes(SPECS.SILVER.etf!.url)),
    ...(['GOLD', 'SILVER'] as const).flatMap(c => curveSymbols(SPECS[c].curve!.root, SPECS[c].curve!.months, today).map(s => safe(`Curve ${s.symbol}`, yahooLast(s.symbol).then(p => ({ code: c, ...s, price: p }))))),
    // Base-metal news flow is thin, so look back two days for them.
    ...CODES.map(c => safe(`News ${c}`, googleNews(SPECS[c].news, 40, PRECIOUS.has(c) ? 1 : 2))),
  ]);
  const curveQuotes = rest.slice(0, 4) as ({ code: CommodityCode; symbol: string; ym: number; price: number } | null)[];
  const newsByCode = Object.fromEntries(CODES.map((c, i) => [c, (rest[4 + i] as RawNews[] | null) ?? []])) as Record<CommodityCode, RawNews[]>;

  // Macro lookups by date.
  const dxyAt = asOfLookup(dxyBars ? barsToSeries(dxyBars) : []);
  const inrAt = asOfLookup(inrBars ? barsToSeries(inrBars) : []);
  const y10At = asOfLookup(dgs10 ?? []);
  const ryAt = asOfLookup(dfii10 ?? []);
  const cpiYoy = cpi && cpi.length > 12 ? r2((cpi.at(-1)!.value / cpi.at(-13)!.value - 1) * 100) : null;
  const lastDate = (s: { date: string }[] | null) => s?.at(-1)?.date ?? '';

  const dxyNow = dxyBars?.at(-1)?.c ?? null;
  const dxyChange1d = dxyBars && dxyBars.length > 1 ? pct(dxyBars.at(-2)!.c, dxyBars.at(-1)!.c) : null;
  const dxyChange3m = dxyBars && dxyBars.length > 64 ? pct(dxyBars.at(-64)!.c, dxyBars.at(-1)!.c) : null;
  const ryChange5d = dfii10 && dfii10.length > 5 ? dfii10.at(-1)!.value - dfii10.at(-6)!.value : null;
  const ryChange3m = dfii10 && dfii10.length > 64 ? dfii10.at(-1)!.value - dfii10.at(-64)!.value : null;

  const out = {} as Record<CommodityCode, CommodityState>;
  for (const code of CODES) {
    const spec = SPECS[code], old = prev?.commodities?.[code];
    const precious = PRECIOUS.has(code);

    // Price bars: Yahoo OHLC for precious; LME cash (close only) merged with stored history for base metals.
    let bars: Bar[] = [];
    let lme: Map<string, LmeDay> = new Map();
    if (precious) bars = (code === 'GOLD' ? gold : silver) ?? old?.bars ?? [];
    else {
      const fresh = (code === 'ALUMINIUM' ? al : zn) ?? [];
      const merged = new Map<string, Bar>((old?.bars ?? []).map(b => [b.d, b]));
      for (const r of fresh) merged.set(r.date, { d: r.date, c: r.cash });
      bars = [...merged.values()].sort((a, b) => a.d.localeCompare(b.d));
      lme = new Map((old?.history ?? []).filter(h => h.lmeCash != null).map(h => [h.date, { date: h.date, cash: h.lmeCash!, m3: h.lme3m, stock: h.lmeStock }]));
      for (const r of fresh) lme.set(r.date, r);
    }
    if (bars.length < 30) { health[code] = 'error: not enough price history'; if (old) out[code] = old; continue; }

    // ETF tonnes accumulate one reading per day (the trust pages only show today's figure).
    const etfOld = new Map((old?.history ?? []).filter(h => h.etfTonnes != null).map(h => [h.date, h.etfTonnes!]));
    const etfNow = code === 'GOLD' ? iau : code === 'SILVER' ? slv : null;
    if (etfNow) etfOld.set(etfNow.asOf, etfNow.tonnes);

    const history: DailyRow[] = bars.slice(-260).map(b => {
      const l = lme.get(b.d), fx = inrAt(b.d);
      return {
        date: b.d, price: b.c, inrParity: fx ? r2(spec.toInr(b.c, fx)) : null,
        lmeCash: l?.cash ?? null, lme3m: l?.m3 ?? null,
        cash3mPct: l?.m3 ? r2(((l.cash - l.m3) / l.m3) * 100) : null, lmeStock: l?.stock ?? null,
        // Only on the date the trust reported it: carrying it forward would fake "no change" days.
        etfTonnes: precious ? etfOld.get(b.d) ?? null : null,
        usdInr: fx, dxy: dxyAt(b.d), us10y: y10At(b.d), realYield: ryAt(b.d),
      };
    });

    const cotRows = code === 'GOLD' ? cotG : code === 'SILVER' ? cotS : null;
    let cot: Cot | null = null;
    if (cotRows?.length) {
      const nets = cotRows.map(r => r.mmNet), latest = cotRows.at(-1)!;
      cot = { latest, netPctile3y: Math.round((nets.filter(n => n < latest.mmNet).length / nets.length) * 100), history: cotRows, source: 'CFTC Commitments of Traders (disaggregated)' };
    }

    let curve: Curve | null = null;
    const cq = curveQuotes.filter((q): q is NonNullable<typeof q> => !!q && q.code === code);
    if (cq.length === 2) {
      const months = cq[1].ym - cq[0].ym;
      const annualisedPct = r2(((cq[1].price / cq[0].price - 1) * 100 * 12) / months);
      curve = { front: { symbol: cq[0].symbol, price: cq[0].price }, next: { symbol: cq[1].symbol, price: cq[1].price }, months, annualisedPct,
        structure: annualisedPct > 0.25 ? 'contango' : annualisedPct < -0.25 ? 'backwardation' : 'flat', source: 'COMEX futures (Yahoo Finance)' };
    }

    const last = history.at(-1)!, prevRow = history.at(-2);
    const m = (key: string, label: string, field: keyof DailyRow, unit: string, source: string, extra: Partial<Metric> = {}): Metric => ({
      key, label, value: (last[field] as number | null) ?? null, prev: (prevRow?.[field] as number | null) ?? null, unit, source,
      asOf: last.date, available: last[field] != null, frequency: 'daily', ...extra,
    });
    const days = (stock: number | null) => (stock != null && spec.consumptionT ? r2(stock / (spec.consumptionT / 365)) : null);
    const metrics: Metric[] = [
      m('price', `Spot price (${spec.unit})`, 'price', spec.unit, spec.priceSource, { sourceUrl: spec.priceUrl, higherIsBullish: true }),
      m('inr', `International price in ₹ (${spec.inrUnit})`, 'inrParity', spec.inrUnit, 'Spot × USD/INR, before Indian import duty and GST — not the MCX quote', { higherIsBullish: true }),
      NA('mcx', 'MCX spot / near-month price', 'MCX (prices load via JavaScript; can be added through your Dhan API)', 'https://www.mcxindia.com/market-data/market-watch', 'daily'),
      NA('mcxPremium', 'MCX premium vs LME / COMEX', 'Needs the MCX quote', undefined, 'daily'),
      ...(precious ? [] : [
        m('lmeCash', 'LME cash (USD/t)', 'lmeCash', 'USD/t', 'LME official prices via westmetall.com', { higherIsBullish: true }),
        m('lme3m', 'LME 3-month (USD/t)', 'lme3m', 'USD/t', 'LME official prices via westmetall.com', { higherIsBullish: true }),
        m('spread', 'LME cash–3M spread (% of 3M; + = backwardation)', 'cash3mPct', '%', 'Derived from LME cash and 3-month', { higherIsBullish: true }),
        m('lmeStock', 'LME warehouse stock (t)', 'lmeStock', 't', 'LME stocks via westmetall.com', { higherIsBullish: false }),
        { key: 'lmeDays', label: 'LME stock in days of global consumption', value: days(last.lmeStock), prev: days(prevRow?.lmeStock ?? null), unit: 'days', source: `LME stock ÷ approx. annual global consumption (${(spec.consumptionT! / 1e6).toFixed(1)} Mt, IAI/ILZSG)`, asOf: last.date, available: last.lmeStock != null, higherIsBullish: false, frequency: 'daily' } as Metric,
        NA('shfe', 'SHFE warehouse stock', 'SHFE weekly report (site changed; no stable free endpoint)', 'https://www.shfe.com.cn', 'weekly'),
        NA('cancelled', 'LME cancelled warrants %', 'LME (requires LME data licence)', 'https://www.lme.com', 'daily'),
        NA('prod', 'Global production', code === 'ALUMINIUM' ? 'International Aluminium Institute (monthly)' : 'ILZSG (monthly)', code === 'ALUMINIUM' ? 'https://international-aluminium.org/statistics/primary-aluminium-production/' : 'https://www.ilzsg.org'),
        NA('chinaProd', 'China production & smelter operating rate', 'NBS / SMM (paid)'),
        NA('chinaCons', 'China apparent consumption', 'NBS / China Customs / SMM'),
        NA('chinaTrade', 'China imports / exports (unwrought + concentrate)', 'China Customs (GACC)'),
        NA('chinaSocial', 'China social inventory (weekly)', 'SMM / Mysteel (paid)', undefined, 'weekly'),
        NA('cost', code === 'ALUMINIUM' ? 'Power cost / alumina cost' : 'Power cost / treatment charges', 'SMM / Fastmarkets (paid)'),
        NA('balance', 'Surplus / deficit (production − consumption)', code === 'ALUMINIUM' ? 'IAI / industry estimates' : 'ILZSG monthly balance'),
      ]),
      ...(precious ? [
        m('etf', `ETF holdings — ${spec.etf!.name} (t)`, 'etfTonnes', 't', `${spec.etf!.name} daily holdings (iShares)`, { sourceUrl: spec.etf!.url, higherIsBullish: true }),
        { key: 'cot', label: 'COT managed-money net long (contracts)', value: cot?.latest.mmNet ?? null, prev: cot?.history.at(-2)?.mmNet ?? null, unit: 'contracts', source: 'CFTC Commitments of Traders, weekly', sourceUrl: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders', asOf: cot?.latest.date, available: !!cot, higherIsBullish: true, frequency: 'weekly' } as Metric,
        { key: 'curve', label: 'Futures curve, annualised (+ = contango)', value: curve?.annualisedPct ?? null, prev: null, unit: '%', source: curve ? `${curve.front.symbol} vs ${curve.next.symbol}` : 'COMEX futures', available: !!curve, frequency: 'daily' } as Metric,
        NA('cb', 'Central-bank net buying (China / India / Turkey / Poland)', 'World Gold Council (Goldhub, registration required)', 'https://www.gold.org/goldhub/data/gold-reserves-by-country'),
        NA('mine', 'Global mine production', 'WGC / Metals Focus (quarterly)'),
        NA('recycle', 'Recycled supply', 'WGC (quarterly)'),
        NA('comex', 'COMEX vault stock', 'CME depository report (XLS; not yet wired)', 'https://www.cmegroup.com/clearing/operations-and-deliveries/nymex-delivery-notices.html', 'daily'),
        NA('lbma', 'LBMA London vault stock', 'LBMA (monthly)', 'https://www.lbma.org.uk/prices-and-data/london-vault-data'),
        NA('jewellery', 'Jewellery demand (India + China)', 'WGC Gold Demand Trends (quarterly)'),
        NA('sge', 'SGE premium to London (China demand)', 'Shanghai Gold Exchange (page is script-rendered)', 'https://en.sge.com.cn', 'daily'),
      ] : []),
      m('usdInr', 'USD/INR', 'usdInr', '₹', 'Yahoo Finance (INR=X)', { higherIsBullish: undefined }),
      m('dxy', 'Dollar index (DXY)', 'dxy', '', 'Yahoo Finance (DX-Y.NYB)', { higherIsBullish: false }),
      m('us10y', 'US 10-year yield', 'us10y', '%', 'US Treasury daily yield curve (10 Yr)', { sourceUrl: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve', higherIsBullish: precious ? false : undefined }),
      m('realYield', 'US 10-year real yield (TIPS)', 'realYield', '%', 'US Treasury daily real yield curve (10 Yr)', { sourceUrl: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_real_yield_curve', higherIsBullish: precious ? false : undefined }),
      ...(precious ? [{ key: 'real10yCpi', label: 'Real yield (10Y − CPI YoY)', value: last.us10y != null && cpiYoy != null ? r2(last.us10y - cpiYoy) : null, prev: prevRow?.us10y != null && cpiYoy != null ? r2(prevRow.us10y - cpiYoy) : null, unit: '%', source: `Treasury 10Y − BLS CPI-U YoY (${cpiYoy ?? '—'}%)`, asOf: last.date, available: last.us10y != null && cpiYoy != null, higherIsBullish: false, frequency: 'daily' } as Metric] : []),
    ];

    const seasonal = seasonality(bars, 10);
    const signal = computeSignal({ code, bars, history, cot, dxyChange1d, realYieldChange5d: ryChange5d });
    const { months: forecast } = forecast12m({ code, bars, seasonal, history, cot, dxyChange3m, realYieldChange3m: ryChange3m });
    const news = newsByCode[code]?.length ? tagNews(code, newsByCode[code]) : old?.news ?? [];

    out[code] = {
      code, name: spec.name, unit: spec.unit, inrUnit: spec.inrUnit, priceSource: spec.priceSource,
      latest: { date: last.date, price: last.price!, changePct: prevRow?.price ? r2(((last.price! - prevRow.price) / prevRow.price) * 100) : null },
      bars, metrics, history, cot, curve, seasonal, news, signal, forecast,
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    macro: { usdInr: inrBars?.at(-1)?.c ?? null, dxy: dxyNow, us10y: dgs10?.at(-1)?.value ?? null, realYield: dfii10?.at(-1)?.value ?? null, cpiYoy },
    commodities: out,
    health: { ...health, lastMacroDates: `10Y ${lastDate(dgs10)}, real ${lastDate(dfii10)}` },
  };
}
