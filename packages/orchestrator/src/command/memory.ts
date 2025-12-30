import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import { loadNeo4jConfigFromEnv } from "../memory/neo4j";
import { linkMemory, recentMemory, searchMemory, upsertMemory, type MemoryScope } from "../memory/graph";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { getOrchestratorContext } from "./state";

type MemoryTools = {
  memoryPut: ToolDefinition;
  memoryLink: ToolDefinition;
  memorySearchTool: ToolDefinition;
  memoryRecentTool: ToolDefinition;
};

export function createMemoryTools(context: OrchestratorContext): MemoryTools {
  const memoryPut: ToolDefinition = tool({
    description:
      "Upsert a memory entry into Neo4j (requires env: OPENCODE_NEO4J_URI/USERNAME/PASSWORD). Stores to global or per-project graph.",
    args: {
      scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
      key: tool.schema.string().describe("Stable key (e.g. 'architecture:db', 'decision:use-minimax')"),
      value: tool.schema.string().describe("Memory content (concise, no secrets)"),
      tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tags"),
    },
    async execute(args) {
      const cfg = loadNeo4jConfigFromEnv();
      if (!cfg) {
        return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
      }

      const scope: MemoryScope = args.scope ?? "project";
      const projectId = scope === "project" ? context.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

      const node = await upsertMemory({
        cfg,
        scope,
        projectId,
        key: args.key,
        value: args.value,
        tags: args.tags ?? [],
      });

      const client = context.client;
      if (client) {
        void client.tui
          .showToast({ body: { message: `Saved memory: ${node.key} (${node.scope})`, variant: "success" } })
          .catch(() => {});
      }

      return JSON.stringify(node, null, 2);
    },
  });

  const memoryLink: ToolDefinition = tool({
    description: "Create a relationship between two memory entries (by key).",
    args: {
      scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
      fromKey: tool.schema.string().describe("Source key"),
      toKey: tool.schema.string().describe("Target key"),
      relation: tool.schema.string().optional().describe("Relationship type (default: relates_to)"),
    },
    async execute(args) {
      const cfg = loadNeo4jConfigFromEnv();
      if (!cfg) {
        return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
      }

      const scope: MemoryScope = args.scope ?? "project";
      const projectId = scope === "project" ? context.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

      const res = await linkMemory({
        cfg,
        scope,
        projectId,
        fromKey: args.fromKey,
        toKey: args.toKey,
        type: args.relation ?? "relates_to",
      });

      return JSON.stringify(res, null, 2);
    },
  });

  const memorySearchTool: ToolDefinition = tool({
    description: "Search memory entries (full-text-ish) in Neo4j.",
    args: {
      scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
      query: tool.schema.string().describe("Search query"),
      limit: tool.schema.number().optional().describe("Max results (default: 10)"),
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const cfg = loadNeo4jConfigFromEnv();
      if (!cfg) {
        return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
      }

      const scope: MemoryScope = args.scope ?? "project";
      const projectId = scope === "project" ? context.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

      const results = await searchMemory({ cfg, scope, projectId, query: args.query, limit: args.limit ?? 10 });
      const format = args.format ?? context.defaultListFormat;
      if (format === "json") return JSON.stringify(results, null, 2);

      if (results.length === 0) return "No matches.";
      return results
        .map((r) => `- \`${r.key}\` (${r.scope})${r.tags.length ? ` [${r.tags.join(", ")}]` : ""}\n  - ${r.value}`)
        .join("\n");
    },
  });

  const memoryRecentTool: ToolDefinition = tool({
    description: "List recent memory entries.",
    args: {
      scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
      limit: tool.schema.number().optional().describe("Max results (default: 10)"),
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const cfg = loadNeo4jConfigFromEnv();
      if (!cfg) {
        return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
      }

      const scope: MemoryScope = args.scope ?? "project";
      const projectId = scope === "project" ? context.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

      const results = await recentMemory({ cfg, scope, projectId, limit: args.limit ?? 10 });
      const format = args.format ?? context.defaultListFormat;
      if (format === "json") return JSON.stringify(results, null, 2);
      if (results.length === 0) return "No memory entries.";
      return results.map((r) => `- \`${r.key}\` (${r.scope}) - ${r.value}`).join("\n");
    },
  });

  return { memoryPut, memoryLink, memorySearchTool, memoryRecentTool };
}

const defaultTools: MemoryTools = createMemoryTools(getOrchestratorContext());

export const memoryPut: ToolDefinition = defaultTools.memoryPut;
export const memoryLink: ToolDefinition = defaultTools.memoryLink;
export const memorySearchTool: ToolDefinition = defaultTools.memorySearchTool;
export const memoryRecentTool: ToolDefinition = defaultTools.memoryRecentTool;
