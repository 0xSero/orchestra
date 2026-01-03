/**
 * Default worker profiles and configuration
 */

import type { WorkerProfile } from "../types";

/**
 * Built-in worker profiles that can be used out of the box
 */
export const builtInProfiles: Record<string, WorkerProfile> = {
  // Vision specialist - for analyzing images, diagrams, screenshots
  // NOTE: Vision workers MUST use backend: "server" because the model is specified at spawn time.
  // The agent backend shares the orchestrator's model which may not support vision.
  vision: {
    id: "vision",
    name: "Vision Analyst",
    backend: "server",
    model: "node:vision",
    purpose: "Analyze images, screenshots, diagrams, and visual content",
    whenToUse:
      "When you need to understand visual content like screenshots, architecture diagrams, UI mockups, error screenshots, or any image-based information",
    supportsVision: true,
    promptFile: "workers/vision.md",
  },

  // Documentation specialist - for looking up docs and examples
  docs: {
    id: "docs",
    name: "Documentation Librarian",
    backend: "server",
    model: "node:docs",
    purpose:
      "Research documentation, find examples, explain APIs and libraries",
    whenToUse:
      "When you need to look up official documentation, find code examples, understand library APIs, or research best practices",
    supportsWeb: true,
    injectRepoContext: true, // Docs worker gets repo context on auto-launch
    tools: {
      write: false,
      edit: false,
    },
    promptFile: "workers/docs.md",
  },

  // Coding specialist - main implementation worker
  coder: {
    id: "coder",
    name: "Code Implementer",
    backend: "agent",
    kind: "subagent",
    model: "node",
    purpose: "Write, edit, and refactor code with full tool access",
    whenToUse:
      "When you need to actually write or modify code, create files, run commands, or implement features",
    promptFile: "workers/coder.md",
  },

  // Architecture/planning specialist
  architect: {
    id: "architect",
    name: "System Architect",
    backend: "agent",
    kind: "subagent",
    model: "node",
    purpose:
      "Design systems, plan implementations, review architecture decisions",
    whenToUse:
      "When you need to plan a complex feature, design system architecture, or make high-level technical decisions",
    tools: {
      write: false,
      edit: false,
      bash: false,
    },
    promptFile: "workers/architect.md",
  },

  // Fast explorer - for quick codebase searches
  explorer: {
    id: "explorer",
    name: "Code Explorer",
    backend: "agent",
    kind: "subagent",
    model: "node:fast",
    purpose: "Quickly search and navigate the codebase",
    whenToUse:
      "When you need to quickly find files, search for patterns, or locate specific code without deep analysis",
    tools: {
      write: false,
      edit: false,
    },
    temperature: 0.1,
    promptFile: "workers/explorer.md",
  },

  // Memory specialist - maintains project/global memory graph (Neo4j) and advises on pruning
  memory: {
    id: "memory",
    name: "Memory Graph Curator",
    backend: "agent",
    model: "node",
    purpose:
      "Maintain a Neo4j-backed memory graph (project + global) and advise on context pruning",
    whenToUse:
      "When you want to record durable project knowledge, track decisions and entities over time, or decide what context can be safely pruned",
    supportsWeb: true,
    tags: [
      "memory",
      "neo4j",
      "knowledge-graph",
      "context-pruning",
      "summarization",
    ],
    promptFile: "workers/memory.md",
  },
};

/**
 * Get a profile by ID (built-in or custom)
 */
export function getProfile(
  id: string,
  customProfiles?: Record<string, WorkerProfile>,
): WorkerProfile | undefined {
  return customProfiles?.[id] ?? builtInProfiles[id];
}

/**
 * Merge custom profile with built-in defaults
 */
export function mergeProfile(
  baseId: string,
  overrides: Partial<WorkerProfile>,
): WorkerProfile {
  const base = builtInProfiles[baseId];
  if (!base) {
    throw new Error(`Unknown base profile: ${baseId}`);
  }
  return {
    ...base,
    ...overrides,
    id: overrides.id ?? base.id,
  };
}
