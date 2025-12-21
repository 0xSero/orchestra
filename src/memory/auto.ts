import type { MemoryScope } from "./graph";
import { linkMemory, upsertMemory } from "./graph";
import { loadNeo4jConfigFromEnv } from "./neo4j";

export type MessageMemoryInput = {
  text: string;
  sessionId?: string;
  messageId?: string;
  role?: string;
  userId?: string;
  scope: MemoryScope;
  projectId?: string;
  maxChars?: number;
};

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export async function recordMessageMemory(input: MessageMemoryInput): Promise<void> {
  const cfg = loadNeo4jConfigFromEnv();
  if (!cfg) {
    return;
  }

  const text = input.text.trim();
  if (!text) return;

  const maxChars = Math.max(100, Math.min(8000, input.maxChars ?? 2000));
  const keyBase = input.messageId ?? `${Date.now()}`;
  const session = input.sessionId ?? "unknown";
  const role = input.role ?? "unknown";
  const userId = input.userId ?? "unknown";
  const key = `message:${session}:${keyBase}`;

  const tags = ["message", role, `session:${session}`, `user:${userId}`];
  if (input.scope === "project" && input.projectId) tags.push(`project:${input.projectId}`);

  await upsertMemory({
    cfg,
    scope: input.scope,
    projectId: input.scope === "project" ? input.projectId : undefined,
    key,
    value: truncate(text, maxChars),
    tags,
  }).catch(() => {});

  const projectId = input.projectId;
  const projectKey = projectId ? `project:${projectId}` : undefined;
  const userKey = `user:${userId}`;

  await upsertMemory({
    cfg,
    scope: input.scope === "project" ? "project" : "global",
    projectId: input.scope === "project" ? projectId : undefined,
    key: userKey,
    value: `User ${userId}`,
    tags: ["user"],
  }).catch(() => {});

  if (projectKey && input.scope === "project") {
    await upsertMemory({
      cfg,
      scope: "project",
      projectId,
      key: projectKey,
      value: `Project ${projectId}`,
      tags: ["project"],
    }).catch(() => {});
  }

  await linkMemory({
    cfg,
    scope: input.scope === "project" ? "project" : "global",
    projectId: input.scope === "project" ? projectId : undefined,
    fromKey: key,
    toKey: userKey,
    type: "belongs_to_user",
  }).catch(() => {});

  if (projectKey && input.scope === "project") {
    await linkMemory({
      cfg,
      scope: "project",
      projectId,
      fromKey: key,
      toKey: projectKey,
      type: "belongs_to_project",
    }).catch(() => {});
  }
}
