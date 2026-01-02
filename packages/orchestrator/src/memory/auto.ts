import type { MemoryScope } from "./graph";
import {
  getMemoryByKey,
  linkMemory,
  trimGlobalMessageProjects,
  trimMemoryByKeyPrefix,
  upsertMemory,
} from "./graph";
import { loadNeo4jConfigFromEnv, type Neo4jConfig } from "./neo4j";
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

export async function recordMessageMemory(
  input: MessageMemoryInput,
): Promise<void> {
  const cfg = input.cfg ?? loadNeo4jConfigFromEnv();
  if (!cfg) {
    return;
  }

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

  await upsertMemory({
    cfg,
    scope: input.scope,
    projectId: input.scope === "project" ? input.projectId : undefined,
    key,
    value: normalizeForMemory(text, maxChars),
    tags,
  }).catch(() => {});

  const projectKey = projectId ? `project:${projectId}` : undefined;
  const userKey = `user:${userId}`;

  await upsertMemory({
    cfg,
    scope: input.scope,
    projectId: input.scope === "project" ? projectId : undefined,
    key: userKey,
    value: `User ${userId}`,
    tags: ["user"],
  }).catch(() => {});

  // Also keep a lightweight global index of known users/projects for cross-project retrieval.
  await upsertMemory({
    cfg,
    scope: "global",
    key: userKey,
    value: `User ${userId}`,
    tags: ["user"],
  }).catch(() => {});

  if (projectKey) {
    await upsertMemory({
      cfg,
      scope: input.scope === "project" ? "project" : "global",
      ...(input.scope === "project" ? { projectId } : {}),
      key: projectKey,
      value: `Project ${projectId}`,
      tags: ["project"],
    }).catch(() => {});

    await upsertMemory({
      cfg,
      scope: "global",
      key: projectKey,
      value: `Project ${projectId}`,
      tags: ["project"],
    }).catch(() => {});
  }

  await linkMemory({
    cfg,
    scope: input.scope,
    projectId: input.scope === "project" ? projectId : undefined,
    fromKey: key,
    toKey: userKey,
    type: "belongs_to_user",
  }).catch(() => {});

  if (projectKey) {
    await linkMemory({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? projectId : undefined,
      fromKey: key,
      toKey: projectKey,
      type: "belongs_to_project",
    }).catch(() => {});
  }

  const summariesEnabled = input.summaries?.enabled !== false;
  if (summariesEnabled && projectId) {
    const entrySnippet = normalizeForMemory(text, 420);
    const entry = `- ${new Date().toISOString()} [${role}/${userId}] ${entrySnippet}`;

    const projectMaxChars = clamp(
      input.summaries?.projectMaxChars ?? 2000,
      200,
      20000,
    );
    const globalProjectSummaryKey = `summary:project:${projectId}`;

    if (input.scope === "project") {
      const prev = await getMemoryByKey({
        cfg,
        scope: "project",
        projectId,
        key: "summary:project",
      }).catch(() => undefined);
      const next = appendRollingSummary(prev?.value, entry, projectMaxChars);
      await upsertMemory({
        cfg,
        scope: "project",
        projectId,
        key: "summary:project",
        value: next,
        tags: ["summary", "project"],
      }).catch(() => {});

      const sessionMaxChars = clamp(
        input.summaries?.sessionMaxChars ?? 2000,
        200,
        20000,
      );
      const sessionKey = `summary:session:${session}`;
      const prevSession = await getMemoryByKey({
        cfg,
        scope: "project",
        projectId,
        key: sessionKey,
      }).catch(() => undefined);
      const nextSession = appendRollingSummary(
        prevSession?.value,
        entry,
        sessionMaxChars,
      );
      await upsertMemory({
        cfg,
        scope: "project",
        projectId,
        key: sessionKey,
        value: nextSession,
        tags: ["summary", "session", `session:${session}`],
      }).catch(() => {});
    }

    // Always update a global per-project summary for cross-project retrieval.
    const prevGlobal = await getMemoryByKey({
      cfg,
      scope: "global",
      key: globalProjectSummaryKey,
    }).catch(() => undefined);
    const nextGlobal = appendRollingSummary(
      prevGlobal?.value,
      entry,
      projectMaxChars,
    );
    await upsertMemory({
      cfg,
      scope: "global",
      key: globalProjectSummaryKey,
      value: nextGlobal,
      tags: ["summary", "project", `project:${projectId}`],
    }).catch(() => {});
  }

  // Trimming: keep memory bounded.
  const maxPerSession = input.trim?.maxMessagesPerSession;
  const maxPerProject = input.trim?.maxMessagesPerProject;
  const maxGlobal = input.trim?.maxMessagesGlobal;
  const maxProjectsGlobal = input.trim?.maxProjectsGlobal;

  const sessionLimit =
    typeof maxPerSession === "number"
      ? clamp(maxPerSession, 0, 10000)
      : undefined;
  const projectLimit =
    typeof maxPerProject === "number"
      ? clamp(maxPerProject, 0, 100000)
      : undefined;
  const globalLimit =
    typeof maxGlobal === "number" ? clamp(maxGlobal, 0, 200000) : undefined;
  const projectsLimit =
    typeof maxProjectsGlobal === "number"
      ? clamp(maxProjectsGlobal, 0, 10000)
      : undefined;

  if (sessionLimit !== undefined) {
    const prefix =
      input.scope === "global"
        ? `message:${projectId ?? "unknown"}:${session}:`
        : `message:${session}:`;
    await trimMemoryByKeyPrefix({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? projectId : undefined,
      keyPrefix: prefix,
      keepLatest: sessionLimit,
    }).catch(() => {});
  }

  if (projectLimit !== undefined && projectId) {
    const prefix =
      input.scope === "global" ? `message:${projectId}:` : "message:";
    await trimMemoryByKeyPrefix({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? projectId : undefined,
      keyPrefix: prefix,
      keepLatest: projectLimit,
    }).catch(() => {});
  }

  if (input.scope === "global" && globalLimit !== undefined) {
    await trimMemoryByKeyPrefix({
      cfg,
      scope: "global",
      keyPrefix: "message:",
      keepLatest: globalLimit,
    }).catch(() => {});
  }

  if (input.scope === "global" && projectsLimit !== undefined) {
    await trimGlobalMessageProjects({ cfg, keepProjects: projectsLimit }).catch(
      () => {},
    );
  }
}
