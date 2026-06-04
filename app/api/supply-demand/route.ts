import { NextResponse } from 'next/server';
import type { SupplyDemandSnapshot, SupplyDemandTheme } from '@/lib/supply-demand-types';

export const maxDuration = 55;

const SYSTEM_MESSAGE = `You are a senior institutional research analyst specializing in commodity and supply-demand dynamics for the Indian equity market. You have deep expertise in tracking global and domestic supply chains, demand trends, pricing cycles, and their impact on NSE-listed companies. Your analysis is grounded in real macroeconomic data, government policy, seasonal patterns, and industry fundamentals. You communicate in precise, factual language suitable for institutional investment decisions.`;

const USER_PROMPT = `Analyze current supply-demand dynamics relevant to the Indian stock market and generate a JSON array of exactly 6 supply-demand themes.

Focus on REAL, current supply-demand dynamics as of today. Cover a mix of:
- Commodity shortages affecting Indian industries
- Oversupply situations creating margin pressure
- Emerging supply-demand imbalances developing now
- Balanced themes with sector-specific nuances

For each theme, produce an object with these exact fields:
- commodity: string — the commodity, material, or resource (e.g. "Coal", "Edible Oil", "Semiconductor Chips")
- category: one of "shortage" | "oversupply" | "emerging" | "balanced"
- pricingPower: one of "rising" | "collapsing" | "stable"
- description: 2-3 sentences describing the supply-demand situation with specific data points where possible
- confidence: integer 0-100 representing conviction in the theme
- timeHorizon: one of "near-term" | "medium-term" | "long-term"
- beneficiaries: array of 2-4 objects, each with { symbol: string (NSE ticker), company: string, rationale: string, impact: "high"|"medium"|"low" }
- adverselyAffected: array of 2-4 objects, same structure as beneficiaries
- historicalAnalog: one sentence referencing a past episode with similar dynamics
- sources: array of 2-3 real Indian or international publication names (e.g. "Economic Times", "Bloomberg", "CRISIL Research")

Rules:
- beneficiaries and adverselyAffected must be real NSE-listed companies with correct NSE ticker symbols
- description must reflect plausible current market conditions for India
- Do NOT include an "id" field — it will be assigned externally
- Return ONLY a valid JSON array. No markdown, no code fences, no explanation text whatsoever.`;

export async function GET(): Promise<NextResponse> {
  const startTime = performance.now();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY environment variable is not set' },
      { status: 503 }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    let anthropicRes: Response;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: SYSTEM_MESSAGE,
          messages: [{ role: 'user', content: USER_PROMPT }],
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!anthropicRes.ok) {
      const excerpt = await anthropicRes.text().then((t) => t.slice(0, 500));
      throw new Error(
        `Anthropic API returned ${anthropicRes.status}: ${excerpt}`
      );
    }

    const body = await anthropicRes.json();
    const rawText: string = body?.content?.[0]?.text;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      throw new Error('Model returned an empty or unexpected response structure');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      throw new Error('Model returned non-JSON response');
    }

    if (!Array.isArray(parsed) || parsed.length < 6 || parsed.length > 8) {
      throw new Error(
        `Expected array of 6-8 themes, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`
      );
    }

    const themes: SupplyDemandTheme[] = (parsed as Record<string, unknown>[]).map(
      (theme, index) => ({
        ...(theme as Omit<SupplyDemandTheme, 'id'>),
        id:
          String(theme.commodity ?? 'theme')
            .toLowerCase()
            .replace(/\s+/g, '-') +
          '-' +
          index,
      })
    );

    const elapsedMs = Math.round(performance.now() - startTime);

    const snapshot: SupplyDemandSnapshot = {
      themes,
      generatedAt: new Date().toISOString(),
      elapsedMs,
    };

    return NextResponse.json(snapshot);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
