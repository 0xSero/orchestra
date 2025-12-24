import { tool } from "@opencode-ai/plugin";
import { loadNeo4jConfigFromEnv } from "../memory/neo4j";
import { getMemoryBackend, linkMemory, recentMemory, searchMemory, upsertMemory, type MemoryScope } from "../memory/store";
import { getClient, getDefaultListFormat, getProjectId } from "./state";

export const memoryPut = tool({
  description:
    "Upsert a memory entry (file-based by default; uses Neo4j if configured). Stores to global or per-project memory.",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    key: tool.schema.string().describe("Stable key (e.g. 'architecture:db', 'decision:use-minimax')"),
    value: tool.schema.string().describe("Memory content (concise, no secrets)"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tags"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    const backend = getMemoryBackend(cfg);

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? getProjectId() : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    const node = await upsertMemory({
      cfg,
      scope,
      projectId,
      key: args.key,
      value: args.value,
      tags: args.tags ?? [],
    });

    const client = getClient();
    if (client) {
      void client.tui
        .showToast({ body: { message: `Saved memory: ${node.key} (${node.scope}, ${backend})`, variant: "success" } })
        .catch(() => {});
    }

    return JSON.stringify({ backend, ...node }, null, 2);
  },
});

export const memoryLink = tool({
  description: "Create a relationship between two memory entries (by key).",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    fromKey: tool.schema.string().describe("Source key"),
    toKey: tool.schema.string().describe("Target key"),
    relation: tool.schema.string().optional().describe("Relationship type (default: relates_to)"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    const backend = getMemoryBackend(cfg);

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? getProjectId() : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    const res = await linkMemory({
      cfg,
      scope,
      projectId,
      fromKey: args.fromKey,
      toKey: args.toKey,
      type: args.relation ?? "relates_to",
    });

    return JSON.stringify({ backend, ...res }, null, 2);
  },
});

export const memorySearchTool = tool({
  description: "Search memory entries (full-text-ish). Uses file storage by default.",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    query: tool.schema.string().describe("Search query"),
    limit: tool.schema.number().optional().describe("Max results (default: 10)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    const backend = getMemoryBackend(cfg);

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? getProjectId() : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    const results = await searchMemory({ cfg, scope, projectId, query: args.query, limit: args.limit ?? 10 });
    const format = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify({ backend, results }, null, 2);

    if (results.length === 0) return "No matches.";
    return results
      .map((r) => `- \`${r.key}\` (${r.scope})${r.tags.length ? ` [${r.tags.join(", ")}]` : ""}\n  - ${r.value}`)
      .join("\n");
  },
});

export const memoryRecentTool = tool({
  description: "List recent memory entries.",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    limit: tool.schema.number().optional().describe("Max results (default: 10)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    const backend = getMemoryBackend(cfg);

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? getProjectId() : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    const results = await recentMemory({ cfg, scope, projectId, limit: args.limit ?? 10 });
    const format = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify({ backend, results }, null, 2);
    if (results.length === 0) return "No memory entries.";
    return results.map((r) => `- \`${r.key}\` (${r.scope}) - ${r.value}`).join("\n");
  },
});
