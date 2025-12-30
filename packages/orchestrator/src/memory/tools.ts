import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { loadNeo4jConfigFromEnv } from "./neo4j";
import { linkMemory, upsertMemory, type MemoryScope } from "./graph";
import { completeMemoryTask, recordMemoryLink, recordMemoryPut } from "./tasks";
import { publishOrchestratorEvent } from "../core/orchestrator-events";

function resolveScope(context: OrchestratorContext, input?: string): MemoryScope {
  if (input === "project" || input === "global") return input;
  return (context.config.memory?.scope ?? "project") as MemoryScope;
}

type MemoryAgentTools = {
  memoryPut: ToolDefinition;
  memoryLink: ToolDefinition;
  memoryDone: ToolDefinition;
};

export function createMemoryAgentTools(context: OrchestratorContext): MemoryAgentTools {
  const memoryPut: ToolDefinition = tool({
    description: "Store a durable memory entry for the memory workflow (Neo4j required).",
    args: {
      taskId: tool.schema.string().optional().describe("Memory task ID (for workflow tracking)"),
      scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: config scope)"),
      key: tool.schema.string().describe("Stable key (e.g. 'decision:use-neo4j')"),
      value: tool.schema.string().describe("Memory content (concise, no secrets)"),
      tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tags"),
    },
    async execute(args) {
      const cfg = loadNeo4jConfigFromEnv();
      if (!cfg) {
        return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
      }

      const scope = resolveScope(context, args.scope);
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

      if (args.taskId) recordMemoryPut(args.taskId, node.key);
      publishOrchestratorEvent("orchestra.memory.written", {
        action: "put",
        scope,
        projectId,
        taskId: args.taskId,
        key: node.key,
        tags: args.tags ?? [],
      });

      return JSON.stringify(node, null, 2);
    },
  });

  const memoryLink: ToolDefinition = tool({
    description: "Link two memory entries for the memory workflow (Neo4j required).",
    args: {
      taskId: tool.schema.string().optional().describe("Memory task ID (for workflow tracking)"),
      scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: config scope)"),
      fromKey: tool.schema.string().describe("Source key"),
      toKey: tool.schema.string().describe("Target key"),
      relation: tool.schema.string().optional().describe("Relationship type (default: relates_to)"),
    },
    async execute(args) {
      const cfg = loadNeo4jConfigFromEnv();
      if (!cfg) {
        return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
      }

      const scope = resolveScope(context, args.scope);
      const projectId = scope === "project" ? context.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

      const relation = args.relation ?? "relates_to";
      const res = await linkMemory({
        cfg,
        scope,
        projectId,
        fromKey: args.fromKey,
        toKey: args.toKey,
        type: relation,
      });

      if (args.taskId) recordMemoryLink(args.taskId, args.fromKey, args.toKey, relation);
      publishOrchestratorEvent("orchestra.memory.written", {
        action: "link",
        scope,
        projectId,
        taskId: args.taskId,
        fromKey: args.fromKey,
        toKey: args.toKey,
        relation,
      });

      return JSON.stringify(res, null, 2);
    },
  });

  const memoryDone: ToolDefinition = tool({
    description: "Acknowledge completion of a memory workflow task.",
    args: {
      taskId: tool.schema.string().describe("Memory task ID"),
      summary: tool.schema.string().optional().describe("Short summary of what was stored"),
      storedKeys: tool.schema.array(tool.schema.string()).optional().describe("Keys stored during this task"),
      linkedKeys: tool.schema
        .array(
          tool.schema.object({
            from: tool.schema.string(),
            to: tool.schema.string(),
            relation: tool.schema.string(),
          })
        )
        .optional()
        .describe("Links created during this task"),
      notes: tool.schema.string().optional().describe("Optional notes for the orchestrator"),
    },
    async execute(args) {
      const result = completeMemoryTask(args.taskId, {
        summary: args.summary,
        storedKeys: args.storedKeys,
        linkedKeys: args.linkedKeys,
        notes: args.notes,
      });
      return result.ok ? result.message : `Memory task not found: ${args.taskId}`;
    },
  });

  return { memoryPut, memoryLink, memoryDone };
}
