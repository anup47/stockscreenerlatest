import { NextResponse } from 'next/server';
import type { SupplyDemandTheme, SupplyDemandSnapshot, LivePrice } from '@/lib/supply-demand-types';
import { slugify } from '@/lib/supply-demand-tracker';

export const maxDuration = 60;

// ── Provider resolution ────────────────────────────────────────────────────
// Priority: GROQ_API_KEY → OPENROUTER_API_KEY → OLLAMA_BASE_URL (local)
function resolveProvider(): { baseUrl: string; model: string; apiKey: string | null } {
  if (process.env.GROQ_API_KEY) {
    return {
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      apiKey: process.env.GROQ_API_KEY,
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL ?? 'qwen/qwen-2.5-72b-instruct',
      apiKey: process.env.OPENROUTER_API_KEY,
    };
  }
  // Local Ollama fallback
  return {
    baseUrl: `${(process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')}/v1`,
    model: process.env.OLLAMA_MODEL ?? 'qwen2.5:14b',
    apiKey: null,
  };
}

// ── Live commodity price fetching ─────────────────────────────────────────────
// Tickers: Yahoo Finance futures/ETF proxies for key commodities
const COMMODITY_TICKERS: Record<string, { ticker: string; unit: string }> = {
  'Cocoa':           { ticker: 'CC=F',   unit: '$/tonne' },
  'Crude Oil (WTI)': { ticker: 'CL=F',   unit: '$/barrel' },
  'Natural Gas':     { ticker: 'NG=F',   unit: '$/MMBtu' },
  'Copper':          { ticker: 'HG=F',   unit: '$/lb' },
  'Aluminium':       { ticker: 'ALI=F',  unit: '$/lb' },
  'Gold':            { ticker: 'GC=F',   unit: '$/oz' },
  'Wheat':           { ticker: 'ZW=F',   unit: '¢/bushel' },
  'Soybean':         { ticker: 'ZS=F',   unit: '¢/bushel' },
  'Sugar':           { ticker: 'SB=F',   unit: '¢/lb' },
  'Cotton':          { ticker: 'CT=F',   unit: '¢/lb' },
  'Palm Oil':        { ticker: 'FCPO.BMD', unit: 'MYR/tonne' },
  'NVDA (AI proxy)': { ticker: 'NVDA',   unit: '$/share' },
  'Micron (DRAM proxy)': { ticker: 'MU', unit: '$/share' },
  'Lithium ETF':     { ticker: 'LIT',    unit: '$/share' },
};

async function fetchLivePrices(): Promise<Record<string, LivePrice>> {
  const results: Record<string, LivePrice> = {};
  await Promise.allSettled(
    Object.entries(COMMODITY_TICKERS).map(async ([name, { ticker, unit }]) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          // @ts-ignore
          cache: 'no-store',
          signal: AbortSignal.timeout(6_000),
        });
        if (!res.ok) return;
        const json = await res.json() as { chart?: { result?: Array<{ indicators: { quote: Array<{ close: number[] }> } }> } };
        const closes = (json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => v != null && !isNaN(v));
        if (closes.length >= 2) {
          results[name] = {
            price:    Math.round(closes[closes.length - 1] * 100) / 100,
            change1d: Math.round((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2] * 1000) / 10,
            unit,
          };
        }
      } catch { /* skip unavailable tickers */ }
    })
  );
  return results;
}

function formatPricesForPrompt(prices: Record<string, LivePrice>): string {
  if (Object.keys(prices).length === 0) return '';
  const lines = Object.entries(prices).map(([name, p]) => {
    const sign = p.change1d >= 0 ? '+' : '';
    return `  ${name}: ${p.price} ${p.unit} (${sign}${p.change1d}% today)`;
  });
  return `\nLIVE MARKET PRICES fetched right now (use these actual prices in your analysis — do NOT use prices from your training data):\n${lines.join('\n')}\n`;
}

const SYSTEM_MESSAGE = `You are a senior institutional commodity research analyst. You write for equity investors who need to act on TODAY's supply-demand reality, not historical situations.

Critical rule: Your training data may be months or years old. Live market prices are provided in the prompt — use them as ground truth. If a commodity's current price differs significantly from what you learned in training, your training data is stale — trust the live price.

You identify NSE/BSE listed companies that benefit from or are harmed by current supply-demand dynamics. You cite specific current data points in every description.`;

function buildUserPrompt(today: string, prices: Record<string, LivePrice>): string {
  const priceBlock = formatPricesForPrompt(prices);

  return `Today's date is ${today}.${priceBlock}
Analyze CURRENT global supply-demand dynamics relevant to Indian equity investors. Generate a JSON array of exactly 12 themes.

IMPORTANT: Base your analysis on the live prices above. If a commodity shows a price significantly different from what you expected from training data, reflect the CURRENT situation accurately. For example, if cocoa is trading at $6,000/tonne (down from the 2024 peak of ~$10,000), describe the CURRENT situation, not the 2024 peak.

MANDATORY commodities to cover:
1. Cocoa — use current price above; describe whether shortage/easing/recovery vs the 2024 peak
2. AI compute hardware — NVDA price above reflects demand; GPU/HBM supply chain
3. Thermal coal — current import price, India dependency
4. Crude Oil — use current WTI price; OPEC policy, refining margins
5. Copper — green energy demand vs mining supply; use current price
6. DRAM / NAND — Micron price above reflects memory cycle; current oversupply or recovery
7. Urea / Fertilisers — natural gas feedstock cost at current NG price
8. Palm Oil / Edible oils — use current price; India import exposure
9. Steel — China overcapacity vs India expansion; use current indicators
10. Lithium — EV demand vs supply glut; LIT ETF price reflects sentiment
11. Rare Earths — China export controls, current geopolitical tension
12. Your choice: natural gas, aluminium, sugar, caustic soda, or solar glass

Distribution: at least 3 shortage, 3 oversupply, 3 emerging, remainder balanced.

Schema for each theme:
{
  "commodity": string,
  "category": "shortage" | "oversupply" | "emerging" | "balanced",
  "pricingPower": "rising" | "collapsing" | "stable",
  "description": string,   // MUST cite the current price from the live data above
  "confidence": number,    // Lower confidence (40-55) if uncertain about recency
  "timeHorizon": "near-term" | "medium-term" | "long-term",
  "beneficiaries": [{"symbol": string, "company": string, "rationale": string, "impact": "high"|"medium"|"low"}],
  "adverselyAffected": [{"symbol": string, "company": string, "rationale": string, "impact": "high"|"medium"|"low"}],
  "historicalAnalog": string,
  "sources": string[]
}

NSE tickers: NESTLEIND, ITC, HINDUNILVR, BRITANNIA (FMCG/cocoa) | INFY, TCS, WIPRO, HCLTECH, LTIM, PERSISTENT, KAYNES, DIXON (IT/electronics) | COALINDIA, ONGC, RELIANCE, BPCL, IOC, GAIL (energy) | TATASTEEL, JSWSTEEL, HINDALCO, VEDL, SAIL (metals) | TATAMOTORS, MOTHERSON, ADANIGREEN, TATAPOWER (EV/renewables) | COROMANDEL, CHAMBAL, UPL, DEEPAKNITRIT (agri)

Rules: description MUST use the live price cited above. confidence 40-95. beneficiaries and adverselyAffected: 2-4 each.
Return ONLY a valid JSON array. No markdown, no prose.`;
}


function stripMarkdownFences(raw: string): string {
  // Strip ```json ... ``` or ``` ... ``` wrappers the model may add despite format:json
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

export async function GET() {
  const startMs = Date.now();

  const provider = resolveProvider();

  // Fast-fail on Vercel when no provider is configured (saves a 55s timeout)
  if (!provider.apiKey && !process.env.OLLAMA_BASE_URL && process.env.VERCEL) {
    return NextResponse.json(
      { error: 'No LLM provider configured. Add GROQ_API_KEY to your Vercel environment variables (free at console.groq.com).' },
      { status: 503 }
    );
  }

  // IST date for prompt context
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayISO = nowIST.toISOString().slice(0, 10);

  // Fetch live commodity prices to ground the analysis in current reality
  const [priceData] = await Promise.allSettled([fetchLivePrices()]);
  const prices = priceData.status === 'fulfilled' ? priceData.value : {};
  const pricesAsOf = new Date().toISOString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

  let llmRes: Response;
  try {
    llmRes = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_MESSAGE },
          { role: 'user', content: buildUserPrompt(todayISO, prices) },
        ],
      }),
      signal: controller.signal,
      // @ts-ignore — Next.js fetch cache option
      cache: 'no-store',
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isConnRefused =
      err instanceof Error &&
      (err.message.includes('ECONNREFUSED') ||
        err.message.includes('fetch failed') ||
        err.name === 'AbortError');
    if (isConnRefused) {
      return NextResponse.json(
        { error: provider.apiKey
            ? `Could not reach ${provider.baseUrl}. Check your API key and network.`
            : `Ollama not reachable at ${provider.baseUrl}. Run: ollama serve && ollama pull ${provider.model}` },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!llmRes.ok) {
    const body = await llmRes.text().catch(() => '');
    if (llmRes.status === 401) {
      return NextResponse.json(
        { error: `Invalid API key for provider. Check your environment variable.` },
        { status: 401 }
      );
    }
    if (llmRes.status === 404 || llmRes.status === 400) {
      return NextResponse.json(
        { error: `Model "${provider.model}" not found. Check GROQ_MODEL / OLLAMA_MODEL env var.` },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: `LLM provider returned HTTP ${llmRes.status}: ${body.slice(0, 200)}` },
      { status: 500 }
    );
  }

  let responseBody: unknown;
  try {
    responseBody = await llmRes.json();
  } catch {
    return NextResponse.json({ error: 'Failed to parse LLM response as JSON.' }, { status: 500 });
  }

  // Extract the text content from OpenAI-compatible response shape
  const rawContent: string =
    (responseBody as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
      ?.content ?? '';

  if (!rawContent) {
    return NextResponse.json(
      { error: 'Ollama returned an empty response. The model may have run out of context or VRAM.' },
      { status: 500 }
    );
  }

  // Parse JSON — handle model wrapping output in markdown fences
  let parsed: unknown;
  try {
    const cleaned = stripMarkdownFences(rawContent);
    parsed = JSON.parse(cleaned);
  } catch {
    // Second attempt: find the first '[' and last ']'
    const start = rawContent.indexOf('[');
    const end = rawContent.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        parsed = JSON.parse(rawContent.slice(start, end + 1));
      } catch {
        return NextResponse.json(
          { error: 'Could not parse model output as a JSON array. Raw excerpt: ' + rawContent.slice(0, 300) },
          { status: 500 }
        );
      }
    } else {
      // Try unwrapping a { themes: [...] } or similar wrapper that json_object mode may produce
      try {
        const obj = JSON.parse(stripMarkdownFences(rawContent)) as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (keys.length === 1 && Array.isArray(obj[keys[0]])) {
          parsed = obj[keys[0]];
        } else {
          return NextResponse.json(
            { error: 'Model returned a JSON object instead of an array. Keys: ' + keys.join(', ') },
            { status: 500 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Could not parse model output as JSON. Raw excerpt: ' + rawContent.slice(0, 300) },
          { status: 500 }
        );
      }
    }
  }

  // If json_object mode wrapped the array in an object, unwrap it
  if (!Array.isArray(parsed) && parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const keys = Object.keys(obj);
    for (const k of keys) {
      if (Array.isArray(obj[k])) {
        parsed = obj[k];
        break;
      }
    }
  }

  if (!Array.isArray(parsed) || parsed.length < 4) {
    return NextResponse.json(
      { error: `Expected a JSON array with at least 4 themes, got: ${JSON.stringify(parsed).slice(0, 200)}` },
      { status: 500 }
    );
  }

  // Assign server-side ids and light validation
  const themes: SupplyDemandTheme[] = (parsed as Record<string, unknown>[]).map((item, index) => ({
    id: `${slugify(String(item.commodity ?? 'theme'))}-${index}`,
    commodity: String(item.commodity ?? ''),
    category: (item.category as SupplyDemandTheme['category']) ?? 'balanced',
    pricingPower: (item.pricingPower as SupplyDemandTheme['pricingPower']) ?? 'stable',
    description: String(item.description ?? ''),
    confidence: Math.min(100, Math.max(0, Number(item.confidence ?? 50))),
    timeHorizon: (item.timeHorizon as SupplyDemandTheme['timeHorizon']) ?? 'medium-term',
    beneficiaries: Array.isArray(item.beneficiaries) ? item.beneficiaries : [],
    adverselyAffected: Array.isArray(item.adverselyAffected) ? item.adverselyAffected : [],
    historicalAnalog: String(item.historicalAnalog ?? ''),
    sources: Array.isArray(item.sources) ? item.sources : [],
  }));

  const snapshot: SupplyDemandSnapshot = {
    themes,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startMs,
    priceData: Object.keys(prices).length > 0 ? prices : undefined,
    pricesAsOf,
  };

  return NextResponse.json(snapshot);
}
