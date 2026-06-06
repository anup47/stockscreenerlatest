import type { Category, PricingPower, ThemeStock, SupplyDemandTheme } from './supply-demand-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StoryStatus = 'new' | 'escalating' | 'easing' | 'stable' | 'resolved';

export interface StoryUpdate {
  date: string;            // YYYY-MM-DD IST
  description: string;
  confidence: number;
  category: Category;
  pricingPower: PricingPower;
  sources: string[];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function deriveStatus(updates: StoryUpdate[]): StoryStatus {
  if (updates.length < 2) return 'new';
  const [latest, prev] = updates;
  const confDelta = latest.confidence - prev.confidence;
  // Category shift towards shortage/emerging = escalating
  const escalatingCats: Category[] = ['shortage', 'emerging'];
  const easingCats: Category[] = ['oversupply', 'balanced'];
  if (confDelta >= 8 || (escalatingCats.includes(latest.category) && easingCats.includes(prev.category))) {
    return 'escalating';
  }
  if (confDelta <= -8 || (easingCats.includes(latest.category) && escalatingCats.includes(prev.category))) {
    return 'easing';
  }
  if (latest.category === 'balanced' && prev.category !== 'balanced') return 'resolved';
  return 'stable';
}

// Fuzzy commodity match — handles "Thermal Coal" matching "Coal (Thermal)" etc.
function sameStory(existing: string, incoming: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(existing);
  const b = norm(incoming);
  if (a === b) return true;
  // One contains the other (min 4 chars to avoid false positives)
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  // Share a significant word (≥5 chars)
  const wordsA = existing.toLowerCase().split(/\s+/).filter(w => w.length >= 5);
  const wordsB = incoming.toLowerCase().split(/\s+/).filter(w => w.length >= 5);
  return wordsA.some(w => wordsB.includes(w));
}

// ── Merge new themes into tracker ─────────────────────────────────────────────

export function mergeIntoTracker(
  tracker: SupplyDemandTracker,
  themes: SupplyDemandTheme[],
): SupplyDemandTracker {
  const today = todayIST();
  const updatedStories = [...tracker.stories];

  for (const theme of themes) {
    const newUpdate: StoryUpdate = {
      date:         today,
      description:  theme.description,
      confidence:   theme.confidence,
      category:     theme.category,
      pricingPower: theme.pricingPower,
      sources:      theme.sources,
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
