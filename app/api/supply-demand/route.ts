import { NextResponse } from 'next/server';
import type { SupplyDemandTheme, SupplyDemandSnapshot } from '@/lib/supply-demand-types';

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

const SYSTEM_MESSAGE = `You are a senior institutional commodity research analyst specializing in global supply-demand dynamics and their impact on the Indian equity market (NSE/BSE listed companies). You have deep expertise in:
- Global commodity markets: energy, metals, agricultural, chemicals
- Indian manufacturing, refining, and consumption patterns
- Supply chain disruptions, geopolitical trade flows, and seasonal demand cycles
- Identifying NSE/BSE listed beneficiaries and companies adversely affected by commodity shifts
Your analysis is grounded in real macroeconomic data, government policy, seasonal patterns, and industry fundamentals. You communicate in precise, factual language suitable for institutional use. You always cite specific data points (prices, percentages, volumes, trade flows) in your descriptions.`;

function buildUserPrompt(today: string): string {
  return `Today's date is ${today}. Analyze current global and domestic supply-demand dynamics most relevant to Indian equity investors. Generate a JSON array of exactly 12 supply-demand themes covering a diverse mix of commodities.

Coverage mandate — include themes from these sectors:
- Energy: crude oil, natural gas, thermal coal
- Battery/EV metals: lithium, cobalt, nickel
- Industrial metals: copper, aluminium
- Technology materials: semiconductors (DRAM, NAND flash, logic chips), silicon, rare earths, display panels
- Agriculture: wheat, soybean, sugar, palm oil, cotton
- Chemicals: urea, caustic soda, titanium dioxide, PVC, MDI/TDI isocyanates

Distribution requirement: include at least 3 shortage themes, 3 oversupply themes, 3 emerging themes, and the remainder balanced.

Each theme object must conform exactly to this schema (no extra fields, no missing fields):
{
  "commodity": string,              // commodity or sector name, e.g. "Thermal Coal", "DRAM Memory"
  "category": "shortage" | "oversupply" | "emerging" | "balanced",
  "pricingPower": "rising" | "collapsing" | "stable",
  "description": string,            // 2-3 sentences with specific data points (prices, %, volumes, trade flows)
  "confidence": number,             // integer 0-100 representing your confidence in this assessment
  "timeHorizon": "near-term" | "medium-term" | "long-term",
  "beneficiaries": [                // 2-4 real NSE-listed companies that benefit
    {
      "symbol": string,             // NSE ticker symbol only, e.g. "COALINDIA", "RELIANCE"
      "company": string,            // full company display name
      "rationale": string,          // 1 sentence explaining why this company benefits
      "impact": "high" | "medium" | "low"
    }
  ],
  "adverselyAffected": [            // 2-4 real NSE-listed companies harmed
    {
      "symbol": string,
      "company": string,
      "rationale": string,
      "impact": "high" | "medium" | "low"
    }
  ],
  "historicalAnalog": string,       // 1 sentence referencing a past comparable episode with year
  "sources": string[]               // 2-3 publication or data source names (e.g. "IEA Monthly Oil Report", "Bloomberg")
}

Hard rules:
- All ticker symbols must be real, actively traded NSE symbols (e.g. HINDUNILVR, TATASTEEL, JSWSTEEL, COALINDIA, ONGC, RELIANCE, ADANIPORTS, HINDALCO, VEDL, UPL, COROMANDEL, CHAMBAL, DEEPAKNITRIT, GNFC, ATUL, NAVINFLUOR)
- description must cite at least one specific number (price, %, volume, or capacity figure)
- confidence must be an integer between 40 and 95
- beneficiaries and adverselyAffected must each have 2 to 4 entries
- Return ONLY a valid JSON array — no markdown, no code fences, no prose, no explanation before or after
Respond with the JSON array only.`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

  if (!provider.apiKey && !process.env.OLLAMA_BASE_URL && typeof window === 'undefined') {
    // Running on Vercel with no provider configured
    const isVercel = !!process.env.VERCEL;
    if (isVercel) {
      return NextResponse.json(
        { error: 'No LLM provider configured. Add GROQ_API_KEY to your Vercel environment variables (free at console.groq.com).' },
        { status: 503 }
      );
    }
  }

  // IST date for prompt context
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayISO = nowIST.toISOString().slice(0, 10);

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
          { role: 'user', content: buildUserPrompt(todayISO) },
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
  };

  return NextResponse.json(snapshot);
}
