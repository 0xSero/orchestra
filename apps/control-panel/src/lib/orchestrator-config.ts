/**
 * Orchestrator Config - Static configuration loaded from orchestrator.json
 *
 * This is a temporary solution until we add proper API endpoints.
 * TODO: Replace with API calls to orchestrator bridge
 */

export type ProfileConfig = {
  id: string;
  name: string;
  model: string;
  purpose: string;
  whenToUse: string;
  kind?: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  tags?: string[];
  tools?: {
    write?: boolean;
    edit?: boolean;
    bash?: boolean;
  };
  temperature?: number;
  docker?: Record<string, unknown>;
};

export type WorkflowConfig = {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  config?: Record<string, unknown>;
};

/**
 * All configured profiles from orchestrator.json
 */
export const ORCHESTRATOR_PROFILES: ProfileConfig[] = [
  {
    id: "vision",
    name: "Vision Analyst",
    model: "zhipuai-coding-plan/glm-4.6v",
    purpose: "Analyze images, screenshots, diagrams, and visual content",
    whenToUse: "When you need to understand visual content like screenshots, architecture diagrams, UI mockups, or error screenshots",
    supportsVision: true,
  },
  {
    id: "docs",
    name: "Documentation Librarian",
    model: "zhipuai-coding-plan/glm-4.7",
    purpose: "Research documentation, find examples, explain APIs and libraries",
    whenToUse: "When you need to look up official documentation, find code examples, understand library APIs, or research best practices",
    supportsWeb: true,
    tools: {
      write: false,
      edit: false,
    },
  },
  {
    id: "coder",
    name: "Code Implementer",
    kind: "server",
    model: "minimax/MiniMax-M2.1",
    purpose: "Write, edit, and refactor code with full tool access",
    whenToUse: "When you need to actually write or modify code, create files, run commands, or implement features",
  },
  {
    id: "memory",
    name: "Memory Graph Curator",
    model: "zhipuai-coding-plan/glm-4.7",
    purpose: "Maintain a Neo4j-backed memory graph (project + global) and advise on context pruning",
    whenToUse: "When you want to record durable project knowledge, track decisions and entities over time, or decide what context can be safely pruned",
    supportsWeb: true,
    tags: ["memory", "neo4j", "knowledge-graph", "context-pruning", "summarization"],
  },
  {
    id: "architect",
    name: "System Architect",
    model: "zhipuai-coding-plan/glm-4.7",
    purpose: "Design systems, plan implementations, review architecture decisions",
    whenToUse: "When you need to plan a complex feature, design system architecture, or make high-level technical decisions",
    tools: {
      write: false,
      edit: false,
      bash: false,
    },
  },
  {
    id: "explorer",
    name: "Code Explorer",
    model: "zhipuai-coding-plan/glm-4.7",
    purpose: "Quickly search and navigate the codebase",
    whenToUse: "When you need to quickly find files, search for patterns, or locate specific code without deep analysis",
    tools: {
      write: false,
      edit: false,
    },
    temperature: 0.1,
  },
];

/**
 * Configured workflows from orchestrator.json
 */
export const ORCHESTRATOR_WORKFLOWS: WorkflowConfig[] = [
  {
    id: "infinite-orchestra",
    name: "Infinite Orchestra",
    enabled: true,
    description: "Continuously improve orchestrator reliability and performance",
    config: {
      goal: "Continuously improve orchestrator reliability and performance for 24/7 operation",
      queueDir: ".opencode/orchestra/tasks",
      archiveDir: ".opencode/orchestra/done",
      maxTasksPerCycle: 2,
    },
  },
  {
    id: "roocode-boomerang",
    name: "Roocode Boomerang",
    enabled: true,
    description: "Architect + Coder workflow for implementing features",
    config: {
      plannerModel: "zhipuai-coding-plan/glm-4.7",
      implementerModel: "minimax/MiniMax-M2.1",
    },
  },
  {
    id: "self-improve",
    name: "Self Improve",
    enabled: false,
    description: "Self-improvement workflow (idle trigger)",
  },
];

/**
 * Memory configuration from orchestrator.json
 */
export const ORCHESTRATOR_MEMORY_CONFIG = {
  enabled: true,
  autoSpawn: false,
  autoRecord: true,
  autoInject: true,
  scope: "project" as const,
  maxChars: 3000,
  summaries: {
    enabled: true,
    sessionMaxChars: 3000,
    projectMaxChars: 4000,
  },
  trim: {
    maxMessagesPerSession: 100,
    maxMessagesPerProject: 500,
    maxMessagesGlobal: 3000,
    maxProjectsGlobal: 50,
  },
};
