import type { ApiService } from "../api";
import type { Factory, MemoryConfig, ServiceLifecycle } from "../types";
import { recordMessageMemory } from "./auto";
import { buildMemoryInjection } from "./inject";
import { loadNeo4jConfig, type Neo4jConfig } from "./neo4j";
import type { MemoryScope } from "./store";

type SessionClient = {
  session: {
    prompt: (args: any) => Promise<any>;
  };
};

export type MemoryDeps = {
  api?: ApiService;
};

export type MemoryService = ServiceLifecycle & {
  enabled: boolean;
  getScope: () => MemoryScope;
  getProjectId: () => string | undefined;
  inject: (input: { client: SessionClient; sessionId: string; directory?: string }) => Promise<boolean>;
  record: (input: {
    text: string;
    sessionId?: string;
    messageId?: string;
    role?: string;
    userId?: string;
  }) => Promise<void>;
};

export const createMemoryStore: Factory<MemoryConfig | undefined, MemoryDeps, MemoryService> = ({ config, deps }) => {
  const cfg: MemoryConfig = config ?? {};
  const enabled = cfg.enabled !== false;
  const autoRecord = cfg.autoRecord !== false;
  const autoInject = cfg.autoInject !== false;
  const requestedScope: MemoryScope = cfg.scope ?? "project";
  const neo4j: Neo4jConfig | undefined = loadNeo4jConfig();

  let projectId: string | undefined;
  let projectResolved = false;

  const resolveProjectId = async () => {
    if (projectResolved) return projectId;
    projectResolved = true;
    if (!deps.api || requestedScope !== "project") return projectId;
    try {
      const res = await deps.api.project.current({});
      // SDK response type has complex conditional generics - use type assertion for data extraction
      const data = (res as { data?: { id?: string } })?.data ?? (res as { id?: string });
      if (data?.id) projectId = data.id;
    } catch {
      // ignore
    }
    return projectId;
  };

  const resolveScope = async (): Promise<MemoryScope> => {
    if (requestedScope !== "project") return requestedScope;
    const pid = await resolveProjectId();
    return pid ? "project" : "global";
  };

  const resolveProjectForScope = async (): Promise<{ scope: MemoryScope; projectId?: string }> => {
    const scope = await resolveScope();
    if (scope !== "project") return { scope };
    return { scope, projectId: await resolveProjectId() };
  };

  return {
    enabled,
    getScope: () => requestedScope,
    getProjectId: () => projectId,
    inject: async ({ client, sessionId, directory }) => {
      if (!enabled || !autoInject) return false;
      const { scope, projectId: pid } = await resolveProjectForScope();
      const injection = await buildMemoryInjection({
        enabled: true,
        cfg: neo4j,
        scope,
        projectId: pid,
        sessionId,
        inject: cfg.inject,
      });
      if (!injection) return false;
      try {
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            noReply: true,
            parts: [{ type: "text", text: injection }],
          },
          ...(directory ? { query: { directory } } : {}),
        });
        return true;
      } catch {
        return false;
      }
    },
    record: async (input) => {
      if (!enabled || !autoRecord) return;
      const { scope, projectId: pid } = await resolveProjectForScope();
      await recordMessageMemory({
        cfg: neo4j,
        text: input.text,
        sessionId: input.sessionId,
        messageId: input.messageId,
        role: input.role,
        userId: input.userId,
        scope,
        projectId: pid,
        maxChars: cfg.maxChars,
        summaries: cfg.summaries,
        trim: cfg.trim,
      }).catch(() => {});
    },
    start: async () => {
      if (!enabled) return;
      // Don't block startup - resolve project ID in background
      resolveProjectId().catch(() => {});
    },
    stop: async () => {},
    health: async () => ({
      ok: true,
      info: {
        enabled,
        scope: requestedScope,
        projectId,
      },
    }),
  };
};
