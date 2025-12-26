import type { WorkerProfile } from "../types";

export type ProfileSuggestion = {
  id: string;
  score: number;
  reason: string;
};

const keywordBoosts: Array<{ pattern: RegExp; profileId: string; score: number; reason: string }> = [
  { pattern: /image|vision|screenshot|diagram|ocr/i, profileId: "vision", score: 40, reason: "vision task" },
  { pattern: /docs?|documentation|reference|api|research|cite|example/i, profileId: "docs", score: 35, reason: "documentation" },
  { pattern: /code|implement|bug|fix|refactor|test|build/i, profileId: "coder", score: 30, reason: "coding task" },
  { pattern: /architecture|design|plan|tradeoff|strategy/i, profileId: "architect", score: 25, reason: "architecture" },
  { pattern: /search|find|locate|where|explore/i, profileId: "explorer", score: 20, reason: "codebase search" },
  { pattern: /memory|neo4j|knowledge/i, profileId: "memory", score: 20, reason: "memory system" },
];

function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
  return tokens ? Array.from(new Set(tokens)) : [];
}

export function suggestProfiles(
  query: string,
  profiles: Record<string, WorkerProfile>,
  options?: { limit?: number }
): ProfileSuggestion[] {
  const tokens = tokenize(query);
  const suggestions: ProfileSuggestion[] = [];

  for (const profile of Object.values(profiles)) {
    let score = 0;
    const reasons: string[] = [];

    for (const boost of keywordBoosts) {
      if (boost.profileId === profile.id && boost.pattern.test(query)) {
        score += boost.score;
        reasons.push(boost.reason);
      }
    }

    const haystack = [
      profile.id,
      profile.name,
      profile.purpose,
      profile.whenToUse,
      ...(profile.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    for (const token of tokens) {
      if (profile.id.toLowerCase().includes(token)) {
        score += 12;
        reasons.push(`id match: ${token}`);
      } else if ((profile.tags ?? []).some((tag) => tag.toLowerCase().includes(token))) {
        score += 8;
        reasons.push(`tag match: ${token}`);
      } else if (haystack.includes(token)) {
        score += 4;
        reasons.push(`text match: ${token}`);
      }
    }

    if (score > 0) {
      suggestions.push({
        id: profile.id,
        score,
        reason: Array.from(new Set(reasons)).join(", ") || "matched",
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return suggestions.slice(0, options?.limit ?? 5);
}

export function findProfile(query: string, profiles: Record<string, WorkerProfile>): string | undefined {
  const suggestions = suggestProfiles(query, profiles, { limit: 1 });
  return suggestions[0]?.id;
}
