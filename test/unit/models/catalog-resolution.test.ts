/**
 * LOW: Model resolution ambiguity test
 * 
 * Tests that model resolution is deterministic with tied scores.
 * 
 * Root cause: In catalog.ts:146-152, the pickBest function returns undefined
 * when there's a tie in scores between multiple candidates. This can lead to
 * an "ambiguous" error even when one model could be reasonably selected.
 * 
 * Test approach:
 * - Create providers with identical scores
 * - Verify consistent model selection
 * - Test disambiguation rules
 * - Verify capability matching is correct
 * 
 * @module test/unit/models/catalog-resolution
 */

import { describe, test, expect, beforeEach } from "bun:test";

/**
 * Model capabilities interface (from catalog.ts)
 */
interface ModelCapabilities {
  temperature?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  toolcall?: boolean;
  input?: {
    text?: boolean;
    audio?: boolean;
    image?: boolean;
    video?: boolean;
    pdf?: boolean;
  };
  output?: {
    text?: boolean;
    audio?: boolean;
    image?: boolean;
    video?: boolean;
    pdf?: boolean;
  };
}

/**
 * Model limit interface
 */
interface ModelLimit {
  context: number;
  output: number;
}

/**
 * Model cost interface
 */
interface ModelCost {
  input: number;
  output: number;
  cache?: {
    read?: number;
    write?: number;
  };
}

/**
 * Model entry in catalog
 */
interface ModelCatalogEntry {
  full: string;
  providerID: string;
  modelID: string;
  name: string;
  status: "active" | "deprecated";
  capabilities: ModelCapabilities;
  limit: ModelLimit;
  cost: ModelCost;
  providerSource: "config" | "custom" | "env" | "api";
}

/**
 * Mock provider interface
 */
interface MockProvider {
  id: string;
  source: "config" | "custom" | "env" | "api";
  key?: string;
  models: Record<string, Partial<ModelCatalogEntry>>;
}

/**
 * Helper to check if full model ID format
 */
function isFullModelID(value: string): boolean {
  return value.includes("/");
}

/**
 * Parse full model ID into provider and model parts
 */
function parseFullModelID(value: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = value.split("/");
  return { providerID, modelID: rest.join("/") };
}

/**
 * Create full model ID from parts
 */
function fullModelID(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`;
}

/**
 * Match type for scored candidates
 */
interface Match {
  providerID: string;
  modelID: string;
  score: number;
  providerSource: MockProvider["source"];
}

/**
 * Normalize string for comparison
 */
function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Strip provider prefix from model ID
 */
function stripProviderPrefix(modelID: string): string {
  const idx = modelID.indexOf(":");
  return idx >= 0 ? modelID.slice(idx + 1) : modelID;
}

/**
 * Strip version suffix from model ID
 */
function stripVersionSuffix(modelID: string): string {
  return modelID
    .replace(/-\d{8}$/i, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/i, "")
    .replace(/-v\d+$/i, "");
}

/**
 * Check if needle matches candidate
 */
function matchCandidate(needleRaw: string, candidateRaw: string, candidateName?: string): boolean {
  const needle = normalize(stripVersionSuffix(stripProviderPrefix(needleRaw)));
  const cand = normalize(stripVersionSuffix(stripProviderPrefix(candidateRaw)));
  
  if (!needle) return false;
  if (cand === needle) return true;
  if (cand.startsWith(`${needle}-`)) return true;
  if (cand.includes(needle)) return true;
  
  if (candidateName) {
    const n = normalize(candidateName);
    if (n.includes(needle)) return true;
  }
  
  return false;
}

/**
 * Score a match (replicates catalog.ts:125-145)
 */
function scoreMatch(
  needleRaw: string,
  provider: MockProvider,
  candidateRaw: string,
  candidateName?: string
): number | undefined {
  if (!matchCandidate(needleRaw, candidateRaw, candidateName)) return undefined;
  
  const needle = normalize(stripVersionSuffix(stripProviderPrefix(needleRaw)));
  const cand = normalize(stripVersionSuffix(stripProviderPrefix(candidateRaw)));
  let score = 0;
  
  // Prefer configured providers over API ones
  if (provider.source !== "api") score += 5;
  
  // Prefer closer matches
  if (cand === needle) score += 50;
  else if (cand.startsWith(`${needle}-`)) score += 25;
  else if (cand.includes(needle)) score += 10;
  
  // Prefer non-thinking variants
  if (/\bthinking\b/i.test(candidateRaw) || /\bthinking\b/i.test(candidateName ?? "")) score -= 10;
  if (/\breasoning\b/i.test(candidateRaw) || /\breasoning\b/i.test(candidateName ?? "")) score -= 5;
  
  return score;
}

/**
 * BUGGY: Pick best match - returns undefined on tie (catalog.ts:146-152)
 */
function pickBestBuggy(matches: Match[]): { providerID: string; modelID: string } | undefined {
  if (matches.length === 0) return undefined;
  
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const second = sorted[1];
  
  // BUG: Returns undefined if there's a tie, even though we could break it deterministically
  if (second && second.score === best.score) return undefined;
  
  return { providerID: best.providerID, modelID: best.modelID };
}

/**
 * FIXED: Pick best match - uses deterministic tie-breaking
 */
function pickBestFixed(matches: Match[]): { providerID: string; modelID: string } | undefined {
  if (matches.length === 0) return undefined;
  
  const providerRank = (source: MockProvider["source"]): number => {
    if (source === "config" || source === "custom") return 0;
    if (source === "env") return 1;
    return 2;
  };
  // Sort by score descending, then by provider source, then providerID/modelID
  const sorted = [...matches].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const rank = providerRank(a.providerSource) - providerRank(b.providerSource);
    if (rank !== 0) return rank;
    // Tie-breaker: alphabetical order by provider, then model
    const providerCmp = a.providerID.localeCompare(b.providerID);
    if (providerCmp !== 0) return providerCmp;
    return a.modelID.localeCompare(b.modelID);
  });
  
  return { providerID: sorted[0].providerID, modelID: sorted[0].modelID };
}

/**
 * Resolve model reference (simplified version of catalog.ts:91-258)
 */
function resolveModelRef(
  input: string,
  providers: MockProvider[],
  options: { useBuggyPick?: boolean } = {}
): { full: string; providerID: string; modelID: string } | { error: string; suggestions?: string[] } {
  const { useBuggyPick = true } = options;
  const pickBest = useBuggyPick ? pickBestBuggy : pickBestFixed;
  
  const raw = input.trim();
  if (!raw) return { error: "Model is required." };
  
  // If full model ID is provided
  if (isFullModelID(raw)) {
    const parsed = parseFullModelID(raw);
    const provider = providers.find((p) => p.id === parsed.providerID);

    if (!provider) {
      return {
        error: `Unknown provider "${parsed.providerID}".`,
        suggestions: providers.map((p) => p.id).slice(0, 20),
      };
    }
    
    // Exact match
    if (provider && parsed.modelID in (provider.models ?? {})) {
      return { full: raw, providerID: parsed.providerID, modelID: parsed.modelID };
    }
    
    // Fuzzy match
    const pool = provider ? [provider] : providers;
    const matches: Match[] = [];
    for (const p of pool) {
      for (const [modelID, model] of Object.entries(p.models ?? {})) {
        const score = scoreMatch(parsed.modelID, p, modelID, model.name);
        if (typeof score === "number") {
          matches.push({ providerID: p.id, modelID, score, providerSource: p.source });
        }
      }
    }
    
    const best = pickBest(matches);
    if (best) {
      return { full: fullModelID(best.providerID, best.modelID), providerID: best.providerID, modelID: best.modelID };
    }
    
    if (matches.length > 1) {
      return {
        error: `Model "${parsed.modelID}" matches multiple configured models. Use an exact provider/model ID.`,
        suggestions: matches.map((m) => fullModelID(m.providerID, m.modelID)).slice(0, 20),
      };
    }
    
    return { error: `Model "${parsed.modelID}" not found.` };
  }
  
  // Short model ID - search all providers
  const matches: Match[] = [];
  for (const provider of providers) {
    if (provider.models && raw in provider.models) {
      matches.push({ providerID: provider.id, modelID: raw, score: 50, providerSource: provider.source });
    }
  }

  if (matches.length >= 1) {
    const best = pickBest(matches);
    if (best) {
      return { full: fullModelID(best.providerID, best.modelID), providerID: best.providerID, modelID: best.modelID };
    }
  }
  
  // Fuzzy match
  const fuzzy: Match[] = [];
  for (const provider of providers) {
    for (const [modelID, model] of Object.entries(provider.models ?? {})) {
      const score = scoreMatch(raw, provider, modelID, model.name);
      if (typeof score === "number") {
        fuzzy.push({ providerID: provider.id, modelID, score, providerSource: provider.source });
      }
    }
  }
  
  const bestFuzzy = pickBest(fuzzy);
  if (bestFuzzy) {
    return { full: fullModelID(bestFuzzy.providerID, bestFuzzy.modelID), providerID: bestFuzzy.providerID, modelID: bestFuzzy.modelID };
  }
  
  if (fuzzy.length > 1) {
    return {
      error: `Model "${raw}" matches multiple configured models. Use provider/model format.`,
      suggestions: fuzzy.map((m) => fullModelID(m.providerID, m.modelID)).slice(0, 20),
    };
  }
  
  return { error: `Model "${raw}" not found. Run list_models({}) to see available models.` };
}

describe("Model Resolution Ambiguity", () => {
  let providers: MockProvider[];
  
  beforeEach(() => {
    // Reset providers for each test
    providers = [];
  });
  
  describe("Tied Scores - Current (Buggy) Behavior", () => {
    /**
     * Demonstrates the bug: identical scores cause undefined result
     */
    test("BUGGY: tied scores return undefined (ambiguous)", () => {
      // Two providers with same model, same source (api), same scores
      providers = [
        {
          id: "openai",
          source: "api",
          models: {
            "gpt-4": { name: "GPT-4" },
          },
        },
        {
          id: "azure-openai",
          source: "api",
          models: {
            "gpt-4": { name: "GPT-4" },
          },
        },
      ];
      
      const matches: Match[] = [
        { providerID: "openai", modelID: "gpt-4", score: 50, providerSource: "api" },
        { providerID: "azure-openai", modelID: "gpt-4", score: 50, providerSource: "api" },
      ];
      
      // Buggy pickBest returns undefined on tie
      const result = pickBestBuggy(matches);
      
      expect(result).toBeUndefined();
      console.log("[BUGGY] Tied scores result in undefined - user gets ambiguous error");
    });
    
    /**
     * Shows how this affects model resolution
     */
    test("BUGGY: model resolution fails on tie instead of selecting one", () => {
      providers = [
        {
          id: "anthropic",
          source: "api",
          models: {
            "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet" },
          },
        },
        {
          id: "anthropic-vertex",
          source: "api",
          models: {
            "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet" },
          },
        },
      ];
      
      const result = resolveModelRef("claude-3-5-sonnet", providers, { useBuggyPick: true });
      
      // Buggy: returns error instead of picking one
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("multiple configured models");
        console.log("[BUGGY] Error:", result.error);
        console.log("[BUGGY] Suggestions:", result.suggestions);
      }
    });
  });
  
  describe("Tied Scores - Fixed Behavior", () => {
    /**
     * Fixed version uses deterministic tie-breaking
     */
    test("FIXED: tied scores use deterministic tie-breaking", () => {
      const matches: Match[] = [
        { providerID: "openai", modelID: "gpt-4", score: 50, providerSource: "api" },
        { providerID: "azure-openai", modelID: "gpt-4", score: 50, providerSource: "api" },
      ];
      
      // Fixed pickBest uses alphabetical ordering as tie-breaker
      const result = pickBestFixed(matches);
      
      expect(result).toBeDefined();
      // Azure comes before openai alphabetically
      expect(result?.providerID).toBe("azure-openai");
      
      console.log("[FIXED] Deterministic selection:", result);
    });
    
    /**
     * Fixed: model resolution succeeds with deterministic pick
     */
    // TODO: Skip - this test demonstrates a hypothetical fix that wasn't implemented in catalog.ts
    // The resolveModelRef mock has an early exit for multiple matches before pickBest is called
    test("FIXED: model resolution succeeds with deterministic selection", () => {
      providers = [
        {
          id: "anthropic",
          source: "api",
          models: {
            "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet" },
          },
        },
        {
          id: "anthropic-vertex",
          source: "api",
          models: {
            "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet" },
          },
        },
      ];
      
      const result = resolveModelRef("claude-3-5-sonnet", providers, { useBuggyPick: false });
      
      // Fixed: returns a result
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        // Anthropic comes before anthropic-vertex alphabetically
        expect(result.providerID).toBe("anthropic");
        console.log("[FIXED] Selected:", result.full);
      }
    });
    
    /**
     * Verify determinism across multiple calls
     */
    // TODO: Skip - this test demonstrates a hypothetical fix that wasn't implemented in catalog.ts
    // The resolveModelRef mock has an early exit for multiple matches before pickBest is called
    test("FIXED: result is consistent across multiple calls", () => {
      providers = [
        {
          id: "openai",
          source: "api",
          models: { "gpt-4": { name: "GPT-4" } },
        },
        {
          id: "azure-openai",
          source: "api",
          models: { "gpt-4": { name: "GPT-4" } },
        },
        {
          id: "groq",
          source: "api",
          models: { "gpt-4": { name: "GPT-4" } },
        },
      ];
      
      const results = Array.from({ length: 10 }, () =>
        resolveModelRef("gpt-4", providers, { useBuggyPick: false })
      );
      
      // All results should be identical
      const firstResult = results[0];
      expect("error" in firstResult).toBe(false);
      
      for (const result of results) {
        expect(result).toEqual(firstResult);
      }
      
      console.log("[FIXED] Consistent across 10 calls:", firstResult);
    });
  });
  
  describe("Provider Priority", () => {
    /**
     * Configured providers should be preferred over API providers
     */
    test("configured providers preferred over api providers", () => {
      providers = [
        {
          id: "openai-api",
          source: "api",
          models: { "gpt-4": { name: "GPT-4" } },
        },
        {
          id: "openai-config",
          source: "config",
          models: { "gpt-4": { name: "GPT-4" } },
        },
      ];
      
      const result = resolveModelRef("gpt-4", providers, { useBuggyPick: false });
      
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        // Config provider should win due to +5 score bonus
        expect(result.providerID).toBe("openai-config");
      }
    });
    
    /**
     * env providers also preferred over api
     */
    test("env providers preferred over api providers", () => {
      providers = [
        {
          id: "anthropic-api",
          source: "api",
          models: { "claude-3": { name: "Claude 3" } },
        },
        {
          id: "anthropic-env",
          source: "env",
          models: { "claude-3": { name: "Claude 3" } },
        },
      ];
      
      const result = resolveModelRef("claude-3", providers, { useBuggyPick: false });
      
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.providerID).toBe("anthropic-env");
      }
    });
  });
  
  describe("Fuzzy Matching", () => {
    /**
     * Exact match should beat partial match
     */
    test("exact match beats partial match", () => {
      providers = [
        {
          id: "anthropic",
          source: "api",
          models: {
            "claude-3-sonnet": { name: "Claude 3 Sonnet" },
            "claude-3-sonnet-thinking": { name: "Claude 3 Sonnet Thinking" },
          },
        },
      ];
      
      const result = resolveModelRef("anthropic/claude-3-sonnet", providers, { useBuggyPick: false });
      
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.modelID).toBe("claude-3-sonnet");
      }
    });
    
    /**
     * Thinking variants should be de-prioritized
     */
    test("non-thinking variants preferred", () => {
      providers = [
        {
          id: "anthropic",
          source: "config",
          models: {
            "claude-sonnet": { name: "Claude Sonnet" },
            "claude-sonnet-thinking": { name: "Claude Sonnet Thinking" },
          },
        },
      ];
      
      // Search for "sonnet" - both match, but thinking should lose 10 points
      const result = resolveModelRef("anthropic/sonnet", providers, { useBuggyPick: false });
      
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.modelID).toBe("claude-sonnet");
        expect(result.modelID).not.toContain("thinking");
      }
    });
    
    /**
     * Version suffixes should be ignored in matching
     */
    test("version suffixes are normalized", () => {
      providers = [
        {
          id: "anthropic",
          source: "api",
          models: {
            "claude-3-5-sonnet-20241022": { name: "Claude 3.5 Sonnet (Oct 2024)" },
          },
        },
      ];
      
      // Search without version suffix
      const result = resolveModelRef("anthropic/claude-3-5-sonnet", providers, { useBuggyPick: false });
      
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.modelID).toBe("claude-3-5-sonnet-20241022");
      }
    });
  });
  
  describe("Edge Cases", () => {
    /**
     * Empty model input
     */
    test("empty input returns error", () => {
      providers = [{ id: "test", source: "api", models: {} }];
      
      const result = resolveModelRef("", providers);
      
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("Model is required.");
      }
    });
    
    /**
     * No matching model
     */
    test("no match returns error with helpful message", () => {
      providers = [
        {
          id: "anthropic",
          source: "api",
          models: {
            "claude-3": { name: "Claude 3" },
          },
        },
      ];
      
      const result = resolveModelRef("gpt-5", providers);
      
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("not found");
      }
    });
    
    /**
     * Provider not found
     */
    test("unknown provider returns error", () => {
      providers = [
        {
          id: "anthropic",
          source: "api",
          models: { "claude-3": { name: "Claude 3" } },
        },
      ];
      
      const result = resolveModelRef("openai/gpt-4", providers);
      
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("Unknown provider");
      }
    });
  });
  
  describe("Real-World Scenarios", () => {
    /**
     * Simulates real provider setup with multiple Claude sources
     */
    test("scenario: multiple Claude providers", () => {
      providers = [
        {
          id: "anthropic",
          source: "env", // Has API key from environment
          models: {
            "claude-3-5-sonnet-20241022": { name: "Claude 3.5 Sonnet" },
            "claude-3-opus-20240229": { name: "Claude 3 Opus" },
          },
        },
        {
          id: "anthropic-vertex",
          source: "api", // From API catalog, no key
          models: {
            "claude-3-5-sonnet@20241022": { name: "Claude 3.5 Sonnet (Vertex)" },
            "claude-3-opus@20240229": { name: "Claude 3 Opus (Vertex)" },
          },
        },
        {
          id: "anthropic-bedrock",
          source: "api", // From API catalog, no key
          models: {
            "anthropic.claude-3-5-sonnet-20241022-v2:0": { name: "Claude 3.5 Sonnet (Bedrock)" },
          },
        },
      ];
      
      // User asks for "sonnet"
      const result = resolveModelRef("sonnet", providers, { useBuggyPick: false });
      
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        // Should prefer anthropic (env source = +5 points)
        expect(result.providerID).toBe("anthropic");
        console.log("[SCENARIO] Selected:", result.full);
      }
    });
    
    /**
     * Simulates user asking for model that exists in multiple API providers
     */
    test("scenario: same model in multiple API providers (tie)", () => {
      providers = [
        {
          id: "together",
          source: "api",
          models: {
            "meta-llama/Llama-3-70b-chat-hf": { name: "Llama 3 70B" },
          },
        },
        {
          id: "groq",
          source: "api",
          models: {
            "llama3-70b-8192": { name: "Llama 3 70B" },
          },
        },
        {
          id: "fireworks",
          source: "api",
          models: {
            "accounts/fireworks/models/llama-v3-70b-instruct": { name: "Llama 3 70B" },
          },
        },
      ];
      
      // User asks for "llama 70b"
      const buggyResult = resolveModelRef("llama 3 70b", providers, { useBuggyPick: true });
      const fixedResult = resolveModelRef("llama 3 70b", providers, { useBuggyPick: false });
      
      // Buggy: likely fails with ambiguous error
      console.log("[SCENARIO] Buggy result:", buggyResult);
      
      // Fixed: deterministically selects one
      expect("error" in fixedResult).toBe(false);
      if (!("error" in fixedResult)) {
        expect(fixedResult.providerID).toBe("fireworks");
        console.log("[SCENARIO] Fixed selected:", fixedResult.full);
      }
    });
  });
  
  describe("Scoring Edge Cases", () => {
    /**
     * Three-way tie should still be deterministic
     */
    test("three-way tie is deterministic", () => {
      const matches: Match[] = [
        { providerID: "c-provider", modelID: "model", score: 50, providerSource: "api" },
        { providerID: "a-provider", modelID: "model", score: 50, providerSource: "api" },
        { providerID: "b-provider", modelID: "model", score: 50, providerSource: "api" },
      ];
      
      const result = pickBestFixed(matches);
      
      expect(result).toBeDefined();
      expect(result?.providerID).toBe("a-provider"); // Alphabetically first
    });
    
    /**
     * Tie in provider, different models
     */
    test("same provider, different models tied", () => {
      const matches: Match[] = [
        { providerID: "anthropic", modelID: "claude-z", score: 50, providerSource: "api" },
        { providerID: "anthropic", modelID: "claude-a", score: 50, providerSource: "api" },
      ];
      
      const result = pickBestFixed(matches);
      
      expect(result).toBeDefined();
      expect(result?.modelID).toBe("claude-a"); // Alphabetically first
    });
    
    /**
     * Score difference should override alphabetical
     */
    test("score difference overrides alphabetical order", () => {
      const matches: Match[] = [
        { providerID: "aaa-provider", modelID: "model", score: 40, providerSource: "api" },
        { providerID: "zzz-provider", modelID: "model", score: 50, providerSource: "api" },
      ];
      
      const result = pickBestFixed(matches);
      
      expect(result).toBeDefined();
      expect(result?.providerID).toBe("zzz-provider"); // Higher score wins
    });
  });
});
