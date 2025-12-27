import type { ApiService } from "../api";
import {
  getMemoryBackend,
  type MemoryNode,
  type MemoryScope,
  recentMemory,
  searchMemory,
  upsertMemory,
} from "../memory/store";
import type { CommandDefinition } from "./index";

function pickFirstString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseTags(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const tags = Array.isArray(value) ? value : value.split(",");
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

async function resolveProjectId(api: ApiService): Promise<string | undefined> {
  try {
    const res = await api.project.current({});
    const data = res && typeof res === "object" && "data" in res ? (res as { data?: unknown }).data : (res as unknown);
    if (data && typeof data === "object" && "id" in data) {
      const idValue = (data as { id?: unknown }).id;
      if (idValue) return String(idValue);
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function resolveScope(input: {
  api: ApiService;
  requested: MemoryScope;
  requireProject: boolean;
  projectId?: string;
}): Promise<{ scope: MemoryScope; projectId?: string }> {
  if (input.requested !== "project") return { scope: input.requested };
  const projectId = input.projectId ?? (await resolveProjectId(input.api));
  if (!projectId) {
    if (input.requireProject) {
      throw new Error("Project scope requested but project ID is unavailable.");
    }
    return { scope: "global" };
  }
  return { scope: "project", projectId };
}

function formatNode(node: MemoryNode): string {
  const tags = node.tags.length > 0 ? ` tags=[${node.tags.join(", ")}]` : "";
  const scope = node.projectId ? `project:${node.projectId}` : node.scope;
  return `- ${node.key}: ${node.value}${tags} (${scope})`;
}

export function createMemoryCommands(): Record<string, CommandDefinition> {
  return {
    "memory.record": {
      description: "Record a memory entry in the knowledge graph",
      usage: "<key> <value> [--tags tag1,tag2]",
      async execute(ctx) {
        if (!ctx.deps.memory.enabled) return "Memory is disabled.";

        const named = ctx.parsed.named;
        const positional = ctx.parsed.positional;
        const raw = ctx.parsed.raw;

        let key = pickFirstString(named.key ?? named.k);
        let value = pickFirstString(named.value ?? named.v);

        if ((!key || !value) && raw.includes(":")) {
          const [head, ...rest] = raw.split(":");
          const candidateKey = head.trim();
          const candidateValue = rest.join(":").trim();
          if (candidateKey && candidateValue) {
            key = candidateKey;
            value = candidateValue;
          }
        }

        if (!key && positional.length >= 2) {
          key = positional[0];
          value = positional.slice(1).join(" ");
        }

        if (!key || !value) {
          return "Usage: /memory.record <key> <value> [--tags tag1,tag2]";
        }

        const tags = parseTags(pickFirstString(named.tags ?? named.tag));
        const scopeOverride = pickFirstString(named.scope) as MemoryScope | undefined;
        const requested =
          scopeOverride === "global" || scopeOverride === "project" ? scopeOverride : ctx.deps.memory.getScope();

        const { scope, projectId } = await resolveScope({
          api: ctx.deps.api,
          requested,
          requireProject: scopeOverride === "project",
          projectId: ctx.deps.memory.getProjectId(),
        });

        const node = await upsertMemory({
          scope,
          projectId,
          key,
          value,
          tags,
        });

        const backend = getMemoryBackend();
        return `Stored (${backend})\n${formatNode(node)}`;
      },
    },
    "memory.query": {
      description: "Query the memory graph",
      usage: "<query> [--limit 10]",
      async execute(ctx) {
        if (!ctx.deps.memory.enabled) return "Memory is disabled.";

        const named = ctx.parsed.named;
        const positional = ctx.parsed.positional;
        const query = pickFirstString(named.query) ?? positional.join(" ");
        const limitRaw = pickFirstString(named.limit);
        const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
        const limit =
          Number.isFinite(parsedLimit ?? NaN) && (parsedLimit as number) > 0 ? (parsedLimit as number) : undefined;

        const scopeOverride = pickFirstString(named.scope) as MemoryScope | undefined;
        const requested =
          scopeOverride === "global" || scopeOverride === "project" ? scopeOverride : ctx.deps.memory.getScope();

        const { scope, projectId } = await resolveScope({
          api: ctx.deps.api,
          requested,
          requireProject: scopeOverride === "project",
          projectId: ctx.deps.memory.getProjectId(),
        });

        const results = query
          ? await searchMemory({ scope, projectId, query, limit })
          : await recentMemory({ scope, projectId, limit });

        if (results.length === 0) {
          return "No memory entries found.";
        }

        const backend = getMemoryBackend();
        const header = query ? `Results (${backend}) for "${query}"` : `Recent entries (${backend})`;
        return [header, ...results.map(formatNode)].join("\n");
      },
    },
  };
}
