import type { Category, PricingPower, ThemeStock, SupplyDemandTheme, LivePrice } from './supply-demand-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StoryStatus = 'new' | 'escalating' | 'easing' | 'stable' | 'resolved';

export interface StoryUpdate {
  date: string;            // YYYY-MM-DD IST
  description: string;
  confidence: number;
  category: Category;
  pricingPower: PricingPower;
  sources: string[];
  livePrice?: { value: number; unit: string; change1d: number }; // spot price at time of update
}

export interface TrackedStory {
  id: string;
  commodity: string;
  timeHorizon: 'near-term' | 'medium-term' | 'long-term';
  beneficiaries: ThemeStock[];
  adverselyAffected: ThemeStock[];
  historicalAnalog: string;
  firstSeen: string;       // YYYY-MM-DD IST
  lastUpdated: string;     // YYYY-MM-DD IST
  status: StoryStatus;
  updates: StoryUpdate[];  // newest first, capped at 60
}

export interface SupplyDemandTracker {
  stories: TrackedStory[];
  lastRun: string;         // ISO timestamp UTC
  totalRuns: number;
}

// ── Helpers (exported so route and page can import instead of duplicating) ────

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function deriveStatus(updates: StoryUpdate[]): StoryStatus {
  if (updates.length < 2) return 'new';
  const [latest, prev] = updates;
  const delta = latest.confidence - prev.confidence;
  if (delta >= 8  || (['shortage', 'emerging'] as Category[]).includes(latest.category) && (['oversupply', 'balanced'] as Category[]).includes(prev.category)) return 'escalating';
  if (delta <= -8 || (['oversupply', 'balanced'] as Category[]).includes(latest.category) && (['shortage', 'emerging'] as Category[]).includes(prev.category)) return 'easing';
  return 'stable';
}

// Fuzzy commodity match — handles "Thermal Coal" vs "Coal (Thermal)" etc.
function sameStory(existing: string, incoming: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(existing);
  const b = norm(incoming);
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  // Substring match (≥6 chars, ≥60% length ratio) — "Crude Oil" in "Crude Oil (WTI)"
  if (shorter.length >= 6 && shorter.length / longer.length >= 0.6 && longer.includes(shorter)) return true;
  // Prefix match (≥4 chars) — handles "Urea" vs "Urea or Palm Oil" from old LLM runs
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  // Share a significant word (≥6 chars)
  const wordsA = existing.toLowerCase().split(/\s+/).filter(w => w.length >= 6);
  const wordsB = incoming.toLowerCase().split(/\s+/).filter(w => w.length >= 6);
  return wordsA.some(w => wordsB.includes(w));
}

// ── Merge new themes into tracker ─────────────────────────────────────────────

export function mergeIntoTracker(
  tracker: SupplyDemandTracker,
  themes: SupplyDemandTheme[],
  priceData?: Record<string, LivePrice>,
): SupplyDemandTracker {
  const today = todayIST();
  const updatedStories = [...tracker.stories];

  for (const theme of themes) {
    // Find the live price for this commodity (fuzzy match on commodity name)
    let livePrice: StoryUpdate['livePrice'];
    if (priceData) {
      const matchKey = Object.keys(priceData).find(k => sameStory(k.split('(')[0].trim(), theme.commodity));
      if (matchKey) {
        const p = priceData[matchKey];
        livePrice = { value: p.price, unit: p.unit, change1d: p.change1d };
      }
    }

    const newUpdate: StoryUpdate = {
      date:         today,
      description:  theme.description,
      confidence:   theme.confidence,
      category:     theme.category,
      pricingPower: theme.pricingPower,
      sources:      theme.sources,
      ...(livePrice ? { livePrice } : {}),
    };

    const existingIdx = updatedStories.findIndex(s => sameStory(s.commodity, theme.commodity));

    if (existingIdx >= 0) {
      const story = updatedStories[existingIdx];
      // Skip if already updated today (idempotent)
      const alreadyToday = story.updates[0]?.date === today;
      const freshUpdates = alreadyToday
        ? [newUpdate, ...story.updates.slice(1)]   // replace today's entry
        : [newUpdate, ...story.updates];
      const capped = freshUpdates.slice(0, 60);
      updatedStories[existingIdx] = {
        ...story,
        commodity:        theme.commodity,   // normalise name (e.g. "Urea or palm oil" → "Urea")
        lastUpdated:      today,
        status:           deriveStatus(capped),
        updates:          capped,
        // Always refresh these from the latest run
        beneficiaries:    theme.beneficiaries,
        adverselyAffected:theme.adverselyAffected,
        historicalAnalog: theme.historicalAnalog,
        timeHorizon:      theme.timeHorizon,
      };
    } else {
      // New story
      updatedStories.push({
        id:               slugify(theme.commodity),
        commodity:        theme.commodity,
        timeHorizon:      theme.timeHorizon,
        beneficiaries:    theme.beneficiaries,
        adverselyAffected:theme.adverselyAffected,
        historicalAnalog: theme.historicalAnalog,
        firstSeen:        today,
        lastUpdated:      today,
        status:           'new',
        updates:          [newUpdate],
      });
    }
  }

  // Sort: most recently updated first
  updatedStories.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));

  return {
    stories:    updatedStories,
    lastRun:    new Date().toISOString(),
    totalRuns:  tracker.totalRuns + 1,
  };
}

export const EMPTY_TRACKER: SupplyDemandTracker = {
  stories:   [],
  lastRun:   '',
  totalRuns: 0,
};
