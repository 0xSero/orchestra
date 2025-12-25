import { tool } from "@opencode-ai/plugin";
import { loadNeo4jConfig, loadNeo4jConfigFromEnv, loadNeo4jConfigFromIntegrations, getNeo4jDriver } from "../memory/neo4j";
import { getMemoryBackend, linkMemory, recentMemory, searchMemory, upsertMemory, type MemoryScope } from "../memory/store";
import { getClient, getDefaultListFormat, getProjectId, getIntegrationsConfig } from "./state";

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
    const cfg = loadNeo4jConfig();
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
    const cfg = loadNeo4jConfig();
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
    const cfg = loadNeo4jConfig();
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
    const cfg = loadNeo4jConfig();
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

export const memoryStatus = tool({
  description: "Check memory backend status (Neo4j connection, config source, etc.).",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    testConnection: tool.schema.boolean().optional().describe("Test the Neo4j connection (default: true)"),
  },
  async execute(args) {
    const format = args.format ?? getDefaultListFormat();
    const testConnection = args.testConnection !== false;

    // Check config sources
    const envConfig = loadNeo4jConfigFromEnv();
    const integrationsConfig = loadNeo4jConfigFromIntegrations();
    const effectiveConfig = loadNeo4jConfig();
    const backend = getMemoryBackend(effectiveConfig);

    // Determine source
    let configSource: string;
    if (envConfig && integrationsConfig) {
      configSource = "env (overrides integrations)";
    } else if (envConfig) {
      configSource = "env";
    } else if (integrationsConfig) {
      configSource = "integrations (orchestrator.json)";
    } else {
      configSource = "none (using file backend)";
    }

    // Get integrations config info
    const integrationsRaw = getIntegrationsConfig()?.neo4j;
    const integrationsEnabled = integrationsRaw?.enabled !== false && Boolean(integrationsRaw?.uri);

    const status: Record<string, unknown> = {
      backend,
      configSource,
      neo4j: {
        configured: Boolean(effectiveConfig),
        uri: effectiveConfig?.uri ? effectiveConfig.uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@") : undefined,
        database: effectiveConfig?.database,
        username: effectiveConfig?.username ? "***" : undefined,
      },
      envVars: {
        OPENCODE_NEO4J_URI: Boolean(process.env.OPENCODE_NEO4J_URI),
        OPENCODE_NEO4J_USERNAME: Boolean(process.env.OPENCODE_NEO4J_USERNAME),
        OPENCODE_NEO4J_PASSWORD: Boolean(process.env.OPENCODE_NEO4J_PASSWORD),
        OPENCODE_NEO4J_DATABASE: Boolean(process.env.OPENCODE_NEO4J_DATABASE),
      },
      integrations: {
        enabled: integrationsEnabled,
        hasUri: Boolean(integrationsRaw?.uri),
        hasCredentials: Boolean(integrationsRaw?.username && integrationsRaw?.password),
      },
    };

    // Test connection if requested and Neo4j is configured
    if (testConnection && effectiveConfig) {
      try {
        const driver = getNeo4jDriver(effectiveConfig);
        const session = driver.session(effectiveConfig.database ? { database: effectiveConfig.database } : undefined);
        try {
          const result = await session.run("RETURN 1 AS ok");
          const ok = result.records?.[0]?.get("ok") === 1;
          (status as any).connection = { success: ok, message: ok ? "Connected successfully" : "Unexpected result" };
        } finally {
          await session.close();
        }
      } catch (err) {
        (status as any).connection = {
          success: false,
          message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    if (format === "json") {
      return JSON.stringify(status, null, 2);
    }

    const lines: string[] = ["# Memory Status", ""];
    lines.push(`**Backend:** ${backend}`);
    lines.push(`**Config Source:** ${configSource}`);
    lines.push("");

    if (effectiveConfig) {
      lines.push("## Neo4j Configuration");
      lines.push(`- URI: \`${status.neo4j && (status.neo4j as any).uri}\``);
      lines.push(`- Database: ${effectiveConfig.database ?? "(default)"}`);
      lines.push(`- Username: configured`);
      lines.push("");
    }

    lines.push("## Environment Variables");
    const envVars = status.envVars as Record<string, boolean>;
    for (const [key, set] of Object.entries(envVars)) {
      lines.push(`- ${key}: ${set ? "✅ set" : "❌ not set"}`);
    }
    lines.push("");

    lines.push("## Integrations Config (orchestrator.json)");
    const integ = status.integrations as Record<string, boolean>;
    lines.push(`- Enabled: ${integ.enabled ? "✅" : "❌"}`);
    lines.push(`- Has URI: ${integ.hasUri ? "✅" : "❌"}`);
    lines.push(`- Has Credentials: ${integ.hasCredentials ? "✅" : "❌"}`);
    lines.push("");

    if ((status as any).connection) {
      const conn = (status as any).connection;
      lines.push("## Connection Test");
      lines.push(`- Status: ${conn.success ? "✅ Success" : "❌ Failed"}`);
      lines.push(`- Message: ${conn.message}`);
    }

    return lines.join("\n");
  },
});
