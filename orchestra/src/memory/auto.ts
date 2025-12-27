import { loadNeo4jConfig, type Neo4jConfig } from "./neo4j";
import type { MemoryScope } from "./store";
import { getMemoryByKey, linkMemory, trimGlobalMessageProjects, trimMemoryByKeyPrefix, upsertMemory } from "./store";
import { appendRollingSummary, normalizeForMemory } from "./text";

export type MessageMemoryInput = {
  cfg?: Neo4jConfig;
  text: string;
  sessionId?: string;
  messageId?: string;
  role?: string;
  userId?: string;
  scope: MemoryScope;
  projectId?: string;
  maxChars?: number;
  deps?: {
    loadNeo4jConfig?: typeof loadNeo4jConfig;
    upsertMemory?: typeof upsertMemory;
    linkMemory?: typeof linkMemory;
    getMemoryByKey?: typeof getMemoryByKey;
    trimMemoryByKeyPrefix?: typeof trimMemoryByKeyPrefix;
    trimGlobalMessageProjects?: typeof trimGlobalMessageProjects;
  };
  summaries?: {
    enabled?: boolean;
    sessionMaxChars?: number;
    projectMaxChars?: number;
  };
  trim?: {
    maxMessagesPerSession?: number;
    maxMessagesPerProject?: number;
    maxMessagesGlobal?: number;
    maxProjectsGlobal?: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function recordMessageMemory(input: MessageMemoryInput): Promise<void> {
  const deps = input.deps ?? {};
  const loadNeo4jConfigFn = deps.loadNeo4jConfig ?? loadNeo4jConfig;
  const upsertMemoryFn = deps.upsertMemory ?? upsertMemory;
  const linkMemoryFn = deps.linkMemory ?? linkMemory;
  const getMemoryByKeyFn = deps.getMemoryByKey ?? getMemoryByKey;
  const trimMemoryByKeyPrefixFn = deps.trimMemoryByKeyPrefix ?? trimMemoryByKeyPrefix;
  const trimGlobalMessageProjectsFn = deps.trimGlobalMessageProjects ?? trimGlobalMessageProjects;

  const cfg = input.cfg ?? loadNeo4jConfigFn();

  const text = input.text.trim();
  if (!text) return;

  const maxChars = clamp(input.maxChars ?? 2000, 100, 8000);
  const keyBase = input.messageId ?? `${Date.now()}`;
  const session = input.sessionId ?? "unknown";
  const role = input.role ?? "unknown";
  const userId = input.userId ?? "unknown";
  const projectId = input.projectId;
  const key =
    input.scope === "global"
      ? `message:${projectId ?? "unknown"}:${session}:${keyBase}`
      : `message:${session}:${keyBase}`;

  const tags = ["message", role, `session:${session}`, `user:${userId}`];
  if (projectId) tags.push(`project:${projectId}`);

  try {
    await upsertMemoryFn({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? input.projectId : undefined,
      key,
      value: normalizeForMemory(text, maxChars),
      tags,
    });
  } catch {
  }

  const projectKey = projectId ? `project:${projectId}` : undefined;
  const userKey = `user:${userId}`;

  try {
    await upsertMemoryFn({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? projectId : undefined,
      key: userKey,
      value: `User ${userId}`,
      tags: ["user"],
    });
  } catch {
  }

  // Also keep a lightweight global index of known users/projects for cross-project retrieval.
  try {
    await upsertMemoryFn({
      cfg,
      scope: "global",
      key: userKey,
      value: `User ${userId}`,
      tags: ["user"],
    });
  } catch {
  }

  if (projectKey) {
    try {
      await upsertMemoryFn({
        cfg,
        scope: input.scope === "project" ? "project" : "global",
        ...(input.scope === "project" ? { projectId } : {}),
        key: projectKey,
        value: `Project ${projectId}`,
        tags: ["project"],
      });
    } catch {
    }

    try {
      await upsertMemoryFn({
        cfg,
        scope: "global",
        key: projectKey,
        value: `Project ${projectId}`,
        tags: ["project"],
      });
    } catch {
    }
  }

  try {
    await linkMemoryFn({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? projectId : undefined,
      fromKey: key,
      toKey: userKey,
      type: "belongs_to_user",
    });
  } catch {
  }

  if (projectKey) {
    try {
      await linkMemoryFn({
        cfg,
        scope: input.scope,
        projectId: input.scope === "project" ? projectId : undefined,
        fromKey: key,
        toKey: projectKey,
        type: "belongs_to_project",
      });
    } catch {
    }
  }

  const summariesEnabled = input.summaries?.enabled !== false;
  if (summariesEnabled && projectId) {
    const entrySnippet = normalizeForMemory(text, 420);
    const entry = `- ${new Date().toISOString()} [${role}/${userId}] ${entrySnippet}`;

    const projectMaxChars = clamp(input.summaries?.projectMaxChars ?? 2000, 200, 20000);
    const globalProjectSummaryKey = `summary:project:${projectId}`;

    if (input.scope === "project") {
      let prev;
      try {
        prev = await getMemoryByKeyFn({ cfg, scope: "project", projectId, key: "summary:project" });
      } catch {
        prev = undefined;
      }
      const next = appendRollingSummary(prev?.value, entry, projectMaxChars);
      try {
        await upsertMemoryFn({
          cfg,
          scope: "project",
          projectId,
          key: "summary:project",
          value: next,
          tags: ["summary", "project"],
        });
      } catch {
      }

      const sessionMaxChars = clamp(input.summaries?.sessionMaxChars ?? 2000, 200, 20000);
      const sessionKey = `summary:session:${session}`;
      let prevSession;
      try {
        prevSession = await getMemoryByKeyFn({ cfg, scope: "project", projectId, key: sessionKey });
      } catch {
        prevSession = undefined;
      }
      const nextSession = appendRollingSummary(prevSession?.value, entry, sessionMaxChars);
      try {
        await upsertMemoryFn({
          cfg,
          scope: "project",
          projectId,
          key: sessionKey,
          value: nextSession,
          tags: ["summary", "session", `session:${session}`],
        });
      } catch {
      }
    }

    // Always update a global per-project summary for cross-project retrieval.
    let prevGlobal;
    try {
      prevGlobal = await getMemoryByKeyFn({ cfg, scope: "global", key: globalProjectSummaryKey });
    } catch {
      prevGlobal = undefined;
    }
    const nextGlobal = appendRollingSummary(prevGlobal?.value, entry, projectMaxChars);
    try {
      await upsertMemoryFn({
        cfg,
        scope: "global",
        key: globalProjectSummaryKey,
        value: nextGlobal,
        tags: ["summary", "project", `project:${projectId}`],
      });
    } catch {
    }
  }

  // Trimming: keep memory bounded.
  const maxPerSession = input.trim?.maxMessagesPerSession;
  const maxPerProject = input.trim?.maxMessagesPerProject;
  const maxGlobal = input.trim?.maxMessagesGlobal;
  const maxProjectsGlobal = input.trim?.maxProjectsGlobal;

  const sessionLimit = typeof maxPerSession === "number" ? clamp(maxPerSession, 0, 10000) : undefined;
  const projectLimit = typeof maxPerProject === "number" ? clamp(maxPerProject, 0, 100000) : undefined;
  const globalLimit = typeof maxGlobal === "number" ? clamp(maxGlobal, 0, 200000) : undefined;
  const projectsLimit = typeof maxProjectsGlobal === "number" ? clamp(maxProjectsGlobal, 0, 10000) : undefined;

  if (sessionLimit !== undefined) {
    const prefix = input.scope === "global" ? `message:${projectId ?? "unknown"}:${session}:` : `message:${session}:`;
    try {
      await trimMemoryByKeyPrefixFn({
        cfg,
        scope: input.scope,
        projectId: input.scope === "project" ? projectId : undefined,
        keyPrefix: prefix,
        keepLatest: sessionLimit,
      });
    } catch {
    }
  }

  if (projectLimit !== undefined && projectId) {
    const prefix = input.scope === "global" ? `message:${projectId}:` : "message:";
    try {
      await trimMemoryByKeyPrefixFn({
        cfg,
        scope: input.scope,
        projectId: input.scope === "project" ? projectId : undefined,
        keyPrefix: prefix,
        keepLatest: projectLimit,
      });
    } catch {
    }
  }

  if (input.scope === "global" && globalLimit !== undefined) {
    try {
      await trimMemoryByKeyPrefixFn({ cfg, scope: "global", keyPrefix: "message:", keepLatest: globalLimit });
    } catch {
    }
  }

  if (input.scope === "global" && projectsLimit !== undefined) {
    try {
      await trimGlobalMessageProjectsFn({ cfg, keepProjects: projectsLimit });
    } catch {
    }
  }
}
