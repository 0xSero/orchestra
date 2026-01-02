import {
  getMemoryByKey,
  recentMemory,
  type MemoryNode,
  type MemoryScope,
} from "./graph";
import { loadNeo4jConfigFromEnv, type Neo4jConfig } from "./neo4j";
import { shortenWithMarker } from "./text";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function shorten(text: string, maxChars: number): string {
  return shortenWithMarker(text, maxChars, { headRatio: 0.4 });
}

function isMessageLike(node: MemoryNode): boolean {
  if (node.key.startsWith("message:")) return true;
  if (node.tags.includes("message")) return true;
  return false;
}

function isAutoScaffold(node: MemoryNode): boolean {
  if (node.key.startsWith("summary:")) return true;
  if (node.key.startsWith("project:")) return true;
  if (node.key.startsWith("user:")) return true;
  return false;
}

function renderEntry(node: MemoryNode): string {
  const value = node.value.replace(/\s+/g, " ").trim();
  return `- \`${node.key}\` ${value}`;
}

export async function buildMemoryInjection(input: {
  enabled: boolean;
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  sessionId?: string;
  inject?: {
    maxChars?: number;
    maxEntries?: number;
    includeMessages?: boolean;
    includeSessionSummary?: boolean;
    includeProjectSummary?: boolean;
    includeGlobal?: boolean;
    maxGlobalEntries?: number;
  };
}): Promise<string | undefined> {
  if (!input.enabled) return undefined;
  const cfg = input.cfg ?? loadNeo4jConfigFromEnv();
  if (!cfg) return undefined;

  const maxChars = clamp(input.inject?.maxChars ?? 2000, 200, 20000);
  const maxEntries = clamp(input.inject?.maxEntries ?? 8, 0, 50);
  const includeMessages = input.inject?.includeMessages === true;
  const includeSessionSummary = input.inject?.includeSessionSummary !== false;
  const includeProjectSummary = input.inject?.includeProjectSummary !== false;
  const includeGlobal = input.inject?.includeGlobal !== false;
  const maxGlobalEntries = clamp(input.inject?.maxGlobalEntries ?? 3, 0, 20);

  const scope = input.scope;
  const projectId = input.projectId;
  const sessionId = input.sessionId;

  const lines: string[] = ["## Memory (auto)", ""];

  const projectSummaryKey =
    scope === "project"
      ? "summary:project"
      : projectId
        ? `summary:project:${projectId}`
        : undefined;
  const sessionSummaryKey = sessionId
    ? `summary:session:${sessionId}`
    : undefined;

  if (includeProjectSummary && projectSummaryKey) {
    const node = await getMemoryByKey({
      cfg,
      scope,
      projectId: scope === "project" ? projectId : undefined,
      key: projectSummaryKey,
    }).catch(() => undefined);
    if (node?.value?.trim()) {
      lines.push("### Project");
      lines.push(
        shorten(
          node.value.trim(),
          clamp(Math.floor(maxChars * 0.5), 200, 6000),
        ),
      );
      lines.push("");
    }
  }

  if (
    includeSessionSummary &&
    scope === "project" &&
    projectId &&
    sessionSummaryKey
  ) {
    const node = await getMemoryByKey({
      cfg,
      scope: "project",
      projectId,
      key: sessionSummaryKey,
    }).catch(() => undefined);
    if (node?.value?.trim()) {
      lines.push("### Session");
      lines.push(
        shorten(
          node.value.trim(),
          clamp(Math.floor(maxChars * 0.35), 200, 4000),
        ),
      );
      lines.push("");
    }
  }

  const gather = async (
    scopeToRead: MemoryScope,
    projectIdToRead: string | undefined,
    limit: number,
  ): Promise<MemoryNode[]> => {
    const nodes = await recentMemory({
      cfg,
      scope: scopeToRead,
      projectId: projectIdToRead,
      limit,
    }).catch(() => []);
    const filtered = nodes.filter((n) => {
      if (!includeMessages && isMessageLike(n)) return false;
      if (isAutoScaffold(n)) return false;
      return true;
    });
    return filtered;
  };

  const mainNodes = await gather(
    scope,
    scope === "project" ? projectId : undefined,
    50,
  );
  const extras: string[] = [];
  for (const node of mainNodes.slice(0, maxEntries)) {
    extras.push(renderEntry(node));
  }

  if (includeGlobal && scope === "project" && maxGlobalEntries > 0) {
    const globalNodes = await gather("global", undefined, 50);
    for (const node of globalNodes.slice(0, maxGlobalEntries)) {
      extras.push(renderEntry(node));
    }
  }

  if (extras.length > 0) {
    lines.push("### Notes");
    lines.push(...extras);
    lines.push("");
  }

  if (lines.length <= 2) return undefined;
  return shorten(lines.join("\n").trim(), maxChars);
}
