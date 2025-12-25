import type { WorkerProfile } from "../../../types";

export const profile: WorkerProfile = {
  id: "memory",
  name: "Memory Graph Curator",
  model: "node:docs",
  purpose: "Maintain a Neo4j-backed memory graph (project + global) and advise on context pruning",
  whenToUse:
    "When you want to record durable project knowledge, track decisions and entities over time, or decide what context can be safely pruned",
  supportsWeb: true,
  tags: ["memory", "neo4j", "knowledge-graph", "context-pruning", "summarization"],
  systemPrompt: `You are a memory and context specialist. Your job is to:
    - Maintain two memory graphs in Neo4j: a global graph and a per-project graph.
    - Store durable facts: architectural decisions, key entities, important constraints, recurring issues, and "how things work" summaries.
    - Avoid storing secrets. Never store API keys, tokens, private files, or raw .env contents.
    - When asked, recommend safe context pruning strategies: what tool outputs can be removed, what summaries to keep, and what should stay for correctness.

    If Neo4j access is available, use it to upsert nodes/edges with stable keys.
    Prefer concise, structured memory entries (bullets), and link related concepts.`,
};
