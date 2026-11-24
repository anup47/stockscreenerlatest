// AI & data-centre value chain: who earns from AI spending, in the order the money flows.
// Pure definitions and maths only; lib/ai-dc-server.ts fetches prices and fills these in.
import type { Bar } from './commodities/types';
export type { Bar };

export type Read = 'tailwind' | 'mixed' | 'headwind';
export type Link = 'Source of spend' | 'Direct' | 'Indirect' | 'Two-sided';

export interface AiStockDef { symbol: string; yahoo: string; name: string; role: string }
export interface AiLayer {
  key: string;
  title: string;
  india: boolean;           // compared with Nifty 50; global layers with the Nasdaq 100
  link: Link;
  why: string;
  watch: string;
  stocks: AiStockDef[];
}

const IN = (symbol: string, name: string, role: string): AiStockDef => ({ symbol, yahoo: `${symbol}.NS`, name, role });
const US = (symbol: string, name: string, role: string): AiStockDef => ({ symbol, yahoo: symbol, name, role });

export const LAYERS: AiLayer[] = [
  {
    key: 'spend', title: 'Who pays: hyperscalers & AI labs', india: false, link: 'Source of spend',
    why: 'Their capex budgets fund every layer below. When they raise spending guidance, orders flow to chips, then data centres, then power and grid equipment.',
    watch: 'Capex guidance at quarterly results. A cut of 10% or more usually reaches suppliers within 1–2 quarters.',
    stocks: [
      US('MSFT', 'Microsoft', 'Azure cloud; largest AI data-centre spender with OpenAI and Anthropic as customers'),
      US('GOOGL', 'Alphabet', 'Google Cloud and in-house TPU chips; Anthropic shareholder and compute supplier'),
      US('AMZN', 'Amazon', 'AWS and Trainium chips; major Anthropic shareholder and compute partner'),
      US('META', 'Meta Platforms', 'Spends on AI for its own apps — no cloud business to resell capacity'),
      US('ORCL', 'Oracle', 'Fast-growing AI cloud backed by large multi-year contracts'),
      US('ANT', 'Anthropic', 'Frontier AI lab (Claude); listed on Nasdaq 19 Nov 2026'),
    ],
  },
  {
    key: 'chips', title: 'Chips & memory', india: false, link: 'Direct',
    why: 'First to receive hyperscaler spending — GPUs, custom accelerators, foundry capacity and high-bandwidth memory.',
    watch: 'Order backlogs and gross margins. Inventory build-up is the earliest sign of over-supply.',
    stocks: [
      US('NVDA', 'NVIDIA', 'Dominant AI GPU supplier'),
      US('AVGO', 'Broadcom', 'Custom AI chips (Google TPU, others) and data-centre networking'),
      US('AMD', 'AMD', 'Second-source AI GPUs and server CPUs'),
      US('TSM', 'TSMC', 'Manufactures nearly all leading AI chips'),
      US('MU', 'Micron', 'High-bandwidth memory (HBM) stacked next to AI GPUs'),
    ],
  },
  {
    key: 'dc-global', title: 'Global data-centre builders & power', india: false, link: 'Direct',
    why: 'Build, cool and power the facilities. Their order books are the template for which Indian stocks benefit next.',
    watch: 'Power is now the bottleneck — utility deals and grid-connection queues decide how fast capacity comes online.',
    stocks: [
      US('VRT', 'Vertiv', 'Data-centre power and liquid-cooling equipment'),
      US('ETN', 'Eaton', 'Electrical distribution gear for data centres'),
      US('EQIX', 'Equinix', 'Largest colocation data-centre operator'),
      US('DLR', 'Digital Realty', 'Hyperscale data-centre landlord'),
      US('CEG', 'Constellation Energy', 'Nuclear power sold to data centres on long contracts'),
      US('VST', 'Vistra', 'Power producer benefiting from data-centre demand'),
    ],
  },
  {
    key: 'in-dc', title: 'India data-centre builders & GPU cloud', india: true, link: 'Direct',
    why: 'The most direct Indian play — revenue grows with each megawatt of capacity commissioned and leased.',
    watch: 'Capacity under construction vs contracted, funding and debt, and execution delays.',
    stocks: [
      IN('ANANTRAJ', 'Anant Raj', 'Building data-centre parks in Haryana alongside its real-estate business'),
      IN('TECHNOE', 'Techno Electric', 'Power EPC contractor that also builds and runs its own data centres'),
      IN('E2E', 'E2E Networks', 'Indian GPU cloud renting Nvidia GPUs, incl. under the IndiaAI Mission'),
      { symbol: 'SIFY', yahoo: 'SIFY', name: 'Sify Technologies', role: 'Data-centre operator (Sify Infinit Spaces); US-listed, priced in USD' },
    ],
  },
  {
    key: 'in-power', title: 'Power generation & transmission', india: true, link: 'Indirect',
    why: 'Data centres run 24×7 and need firm power — a new, fast-growing source of electricity demand on top of a rising base.',
    watch: 'Supply deals signed with data-centre operators; regulated returns cap the upside for some utilities.',
    stocks: [
      IN('NTPC', 'NTPC', 'Largest power producer; adding renewables and nuclear'),
      IN('TATAPOWER', 'Tata Power', 'Generation, renewables and Mumbai distribution — India\'s main data-centre hub'),
      IN('JSWENERGY', 'JSW Energy', 'Thermal, hydro and renewable generation plus storage'),
      IN('ADANIPOWER', 'Adani Power', 'Large private thermal producer selling into rising peak demand'),
      IN('POWERGRID', 'Power Grid', 'Builds the transmission lines that connect new data-centre clusters'),
    ],
  },
  {
    key: 'in-grid', title: 'Grid & electrical equipment', india: true, link: 'Direct',
    why: 'Every new megawatt needs transformers, switchgear and substations — order books show the build-out first.',
    watch: 'Order inflows and book-to-bill. Valuations already assume years of growth, so an order slowdown hurts.',
    stocks: [
      IN('POWERINDIA', 'Hitachi Energy India', 'Transformers, HVDC and grid automation'),
      IN('GVT&D', 'GE Vernova T&D India', 'Grid transformers, switchgear and substations'),
      IN('ABB', 'ABB India', 'Electrification, UPS and data-centre power distribution'),
      IN('SIEMENS', 'Siemens', 'Electrification and automation for infrastructure and industry'),
      IN('ENRIN', 'Siemens Energy India', 'Power generation and transmission equipment'),
      IN('CGPOWER', 'CG Power', 'Transformers, switchgear and motors; building a chip assembly (OSAT) plant'),
      IN('SCHNEIDER', 'Schneider Electric Infra', 'Distribution transformers and medium-voltage switchgear'),
      IN('TARIL', 'Transformers & Rectifiers', 'Power and distribution transformers'),
      IN('VOLTAMP', 'Voltamp Transformers', 'Dry-type and distribution transformers'),
      IN('BHEL', 'BHEL', 'Power-plant equipment for new generation capacity'),
    ],
  },
  {
    key: 'in-cables', title: 'Cables & conductors', india: true, link: 'Indirect',
    why: 'Data-centre campuses and grid upgrades use large volumes of power and control cables.',
    watch: 'Copper and aluminium prices (passed on with a lag) and new entrants adding capacity.',
    stocks: [
      IN('POLYCAB', 'Polycab', 'Largest wires and cables maker'),
      IN('KEI', 'KEI Industries', 'Power cables incl. extra-high-voltage'),
      IN('APARINDS', 'APAR Industries', 'Conductors and specialty cables for transmission and renewables'),
      IN('HAVELLS', 'Havells', 'Cables, switchgear and electricals'),
    ],
  },
  {
    key: 'in-cooling', title: 'Cooling & backup power', india: true, link: 'Direct',
    why: 'Cooling is one of the biggest running costs in a data centre, and every facility needs standby generators — both scale with megawatts built.',
    watch: 'The shift to liquid cooling favours specialists; tighter genset emission norms raise costs.',
    stocks: [
      IN('BLUESTARCO', 'Blue Star', 'Commercial and precision cooling incl. data-centre chillers'),
      IN('VOLTAS', 'Voltas', 'Cooling and MEP contracting for large facilities'),
      IN('CUMMINSIND', 'Cummins India', 'Standby generator engines — mandatory for data centres'),
      IN('KIRLOSENG', 'Kirloskar Oil Engines', 'Gensets and engines for standby power'),
    ],
  },
  {
    key: 'in-network', title: 'Fibre & networking', india: true, link: 'Indirect',
    why: 'AI clusters need far more fibre and high-speed links inside and between data centres.',
    watch: 'Telecom capex (BSNL, Jio, Airtel) still drives most revenue; watch export orders.',
    stocks: [
      IN('HFCL', 'HFCL', 'Optical fibre, cables and telecom equipment'),
      IN('STLTECH', 'Sterlite Technologies', 'Optical fibre and data-centre connectivity'),
      IN('TEJASNET', 'Tejas Networks', 'Optical and wireless networking gear'),
    ],
  },
  {
    key: 'in-hardware', title: 'Servers & electronics manufacturing', india: true, link: 'Indirect',
    why: 'Made-in-India servers and electronics, helped by semiconductor and IndiaAI incentives.',
    watch: 'Thin contract-manufacturing margins, working capital and customer concentration.',
    stocks: [
      IN('NETWEB', 'Netweb Technologies', 'Builds AI/HPC servers in India; Nvidia partner'),
      IN('KAYNES', 'Kaynes Technology', 'Electronics manufacturing; building a chip assembly (OSAT) unit'),
      IN('SYRMA', 'Syrma SGS', 'Electronics manufacturing services'),
      IN('CYIENTDLM', 'Cyient DLM', 'Electronics for aerospace, medical and industrial customers'),
    ],
  },
  {
    key: 'in-it', title: 'IT services — users and disrupted', india: true, link: 'Two-sided',
    why: 'They win work helping companies deploy AI, but AI coding tools shrink traditional billable hours. The net effect is still being priced in.',
    watch: 'AI-related deal wins, revenue per employee, renewal pricing and US tech budgets.',
    stocks: [
      IN('TCS', 'TCS', 'Largest IT services firm'),
      IN('INFY', 'Infosys', 'IT services; enterprise AI platform (Topaz)'),
      IN('HCLTECH', 'HCLTech', 'IT services plus engineering and software products'),
      IN('PERSISTENT', 'Persistent Systems', 'Product engineering; fast-growing AI work'),
      IN('COFORGE', 'Coforge', 'Mid-size IT services'),
      IN('TATAELXSI', 'Tata Elxsi', 'Design and embedded engineering'),
    ],
  },
];

// Pulse inputs, fetched alongside the stocks.
export const PULSE_SYMBOLS = { chips: 'SOXX', us10y: '^TNX', vix: '^VIX', usdinr: 'INR=X', nifty: '^NSEI', ndx: '^NDX' } as const;

// Anthropic listed on Nasdaq on 19 Nov 2026; the IPO priced at $83 on 18 Nov (final prospectus, as reported).
export const ANTHROPIC_IPO_PRICE = 83;

// ── Output shapes ────────────────────────────────────────────────────────────


export interface StockStat extends AiStockDef {
  currency: 'INR' | 'USD';
  price: number;
  chg1d: number | null;
  chg1m: number | null;
  chg3m: number | null;
  chg1y: number | null;
  offHigh: number | null;   // % below the 52-week high (≤ 0)
  trend: 'up' | 'down' | 'mixed' | null; // price vs 50- and 200-day averages
  pullback: boolean;        // uptrend, 5–15% below the high
}

export interface LayerStat extends Omit<AiLayer, 'stocks'> {
  stocks: StockStat[];
  median3m: number | null;
  vsBench3m: number | null; // median 3M minus benchmark 3M, percentage points
  breadth: number | null;   // % of stocks above their 200-day average
  status: 'leading' | 'in line' | 'lagging' | null;
}

export interface PulseSignal { key: string; label: string; value: string; read: Read; note: string }

export interface AiDcData {
  asOf: string;
  pulse: PulseSignal[];
  layers: LayerStat[];
  bench: { nifty3m: number | null; ndx3m: number | null };
  anthropic: { price: number; ipoPrice: number; vsIpo: number; high: number | null; low: number | null; sessions: number } | null;
  failed: string[];
}

// ── Maths ────────────────────────────────────────────────────────────────────

const r1 = (x: number) => Math.round(x * 10) / 10;
export const pctFrom = (from: number | undefined, to: number) => (from ? r1(((to - from) / from) * 100) : null);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return r1(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

// Returns over ~1/21/63/252 trading days; trend from the 50- and 200-day averages.
export function stockStat(def: AiStockDef, bars: Bar[], currency: 'INR' | 'USD'): StockStat | null {
  const closes = bars.map(b => b.c).filter((c): c is number => c != null);
  if (!closes.length) return null;
  const n = closes.length, price = closes[n - 1];
  const back = (k: number) => (n > k ? closes[n - 1 - k] : undefined);
  const high = Math.max(...bars.slice(-252).map(b => b.h ?? b.c ?? 0));
  const ma50 = n >= 50 ? avg(closes.slice(-50)) : null;
  const ma200 = n >= 200 ? avg(closes.slice(-200)) : null;
  const trend = ma50 == null || ma200 == null ? null
    : price > ma50 && ma50 > ma200 ? 'up'
    : price < ma50 && ma50 < ma200 ? 'down' : 'mixed';
  const offHigh = n >= 50 && high > 0 ? Math.min(0, r1(((price - high) / high) * 100)) : null;
  return {
    ...def, currency, price,
    chg1d: pctFrom(back(1), price),
    chg1m: pctFrom(back(21), price),
    chg3m: pctFrom(back(63), price),
    chg1y: n >= 240 ? pctFrom(closes[0], price) : null,
    offHigh, trend,
    pullback: trend === 'up' && offHigh != null && offHigh <= -5 && offHigh >= -15,
  };
}

export function layerStat(layer: AiLayer, stocks: StockStat[], bench3m: number | null): LayerStat {
  const m3 = median(stocks.map(s => s.chg3m).filter((x): x is number => x != null));
  const withTrend = stocks.filter(s => s.trend != null);
  const vs = m3 != null && bench3m != null ? r1(m3 - bench3m) : null;
  return {
    ...layer, stocks,
    median3m: m3,
    vsBench3m: vs,
    breadth: withTrend.length ? Math.round((withTrend.filter(s => s.trend === 'up').length / withTrend.length) * 100) : null,
    status: vs == null ? null : vs >= 5 ? 'leading' : vs <= -5 ? 'lagging' : 'in line',
  };
}

const sg = (x: number, d = 1) => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;

export interface PulseInputs {
  chips: StockStat | null;
  spend: LayerStat | undefined;
  gpu: { chg13w: number | null; verdict: string; asOf: string } | null;
  us10y: Bar[];
  vix: Bar[];
  usdinr: Bar[];
}

// Six plain-English reads on whether the AI trade has the wind behind it.
export function pulseSignals(x: PulseInputs): PulseSignal[] {
  const out: PulseSignal[] = [];
  const last = (b: Bar[]) => b.at(-1)?.c;
  const ago = (b: Bar[], k: number) => (b.length > k ? b[b.length - 1 - k].c : undefined);

  if (x.chips?.chg3m != null && x.chips.trend) {
    const { chg3m, trend } = x.chips;
    out.push({
      key: 'chips', label: 'AI chips (SOXX)', value: `${sg(chg3m)}% 3M · ${trend === 'up' ? 'uptrend' : trend === 'down' ? 'downtrend' : 'mixed trend'}`,
      read: trend === 'up' && chg3m > 0 ? 'tailwind' : trend === 'down' && chg3m < 0 ? 'headwind' : 'mixed',
      note: 'Chip stocks price AI demand first. Uptrend = market still expects spending to grow.',
    });
  }
  if (x.spend?.median3m != null) {
    const m = x.spend.median3m;
    out.push({
      key: 'spend', label: 'Hyperscaler stocks', value: `${sg(m)}% median 3M`,
      read: m > 5 ? 'tailwind' : m < -5 ? 'headwind' : 'mixed',
      note: 'The buyers of AI capacity. If investors punish their spending, budgets get trimmed.',
    });
  }
  if (x.gpu?.chg13w != null) {
    const g = x.gpu.chg13w;
    out.push({
      key: 'gpu', label: 'GPU rental prices', value: `${sg(g, 0)}% over 13 wks (wk ${x.gpu.asOf})`,
      read: g > 0 ? 'tailwind' : g < -10 ? 'headwind' : 'mixed',
      note: 'Rising rents mean demand for compute is outrunning new supply — no sign of over-build.',
    });
  }
  const y = last(x.us10y), y3 = ago(x.us10y, 63);
  if (y != null && y3 != null) {
    const bps = Math.round((y - y3) * 100);
    out.push({
      key: 'rates', label: 'US 10-year yield', value: `${y.toFixed(2)}% · ${bps > 0 ? '+' : ''}${bps} bps 3M`,
      read: y >= 5 || bps >= 30 ? 'headwind' : bps <= -30 ? 'tailwind' : 'mixed',
      note: 'Higher yields cut what investors pay for long-dated growth like AI, and pull money out of emerging markets.',
    });
  }
  const v = last(x.vix);
  if (v != null) {
    out.push({
      key: 'vix', label: 'Volatility (VIX)', value: v.toFixed(1),
      read: v < 18 ? 'tailwind' : v > 25 ? 'headwind' : 'mixed',
      note: 'Fear gauge. Above 25, high-valuation AI stocks usually fall hardest.',
    });
  }
  const fx = last(x.usdinr), fx3 = ago(x.usdinr, 63);
  if (fx != null && fx3 != null) {
    const c = ((fx - fx3) / fx3) * 100;
    out.push({
      key: 'inr', label: 'USD/INR', value: `₹${fx.toFixed(2)} · ${sg(c)}% 3M`,
      read: c > 2 ? 'headwind' : c < -1 ? 'tailwind' : 'mixed',
      note: 'A weakening rupee usually comes with foreign selling of Indian stocks.',
    });
  }
  return out;
}
