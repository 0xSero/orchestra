import { afterAll, describe, expect, test } from "bun:test";
import { recordMessageMemory } from "../../src/memory/auto";
import {
  loadNeo4jConfigFromEnv,
  type Neo4jConfig,
} from "../../src/memory/neo4j";
import { searchMemory } from "../../src/memory/graph";
import { withNeo4jSession } from "../../src/memory/neo4j";
import { buildMemoryInjection } from "../../src/memory/inject";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

let containerName: string | undefined;
let neo4jCfg: Neo4jConfig | undefined = loadNeo4jConfigFromEnv();
let neo4jSkipReason: string | undefined;

async function docker(
  args: string[],
  timeoutMs = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  return (await exec("docker", args, { timeout: timeoutMs })) as any;
}

async function waitForNeo4j(
  cfg: Neo4jConfig,
  timeoutMs = 90_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await withNeo4jSession(cfg, async (session) => {
        await session.run("RETURN 1");
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Neo4j did not become ready within ${timeoutMs}ms`);
}

async function startNeo4jDocker(): Promise<void> {
  const name = `opencode-neo4j-test-${process.pid}-${Date.now()}`;
  containerName = name;

  try {
    await docker(
      [
        "run",
        "-d",
        "--name",
        name,
        "-p",
        "0:7687",
        "-e",
        "NEO4J_AUTH=neo4j/testpass",
        "-e",
        "NEO4J_server_memory_heap_initial__size=128M",
        "-e",
        "NEO4J_server_memory_heap_max__size=256M",
        "-e",
        "NEO4J_server_memory_pagecache_size=128M",
        "neo4j:5-community",
      ],
      120_000,
    );
  } catch (err: any) {
    containerName = undefined;
    neo4jSkipReason = String(
      err?.stderr || err?.message || "docker run failed",
    );
    return;
  }

  await new Promise((r) => setTimeout(r, 1500));

  const state = await docker(
    ["inspect", "-f", "{{.State.Status}}|{{.State.ExitCode}}", name],
    30_000,
  )
    .then((r) => String(r.stdout || "").trim())
    .catch(() => "unknown|0");

  if (!state.startsWith("running|")) {
    const logs = await docker(["logs", name, "--tail", "120"], 30_000)
      .then((r) => String(r.stdout || "").trim())
      .catch(() => "");
    neo4jSkipReason = `neo4j container not running (${state})${logs ? `: ${logs.split("\n").pop()}` : ""}`;
    await docker(["rm", "-f", name], 30_000).catch(() => {});
    containerName = undefined;
    return;
  }

  const hostPort = await docker(
    [
      "inspect",
      "-f",
      '{{(index (index .NetworkSettings.Ports "7687/tcp") 0).HostPort}}',
      name,
    ],
    30_000,
  )
    .then((r) => String(r.stdout || "").trim())
    .catch(() => "");

  const port = Number.parseInt(hostPort, 10);
  if (!Number.isFinite(port) || port <= 0) {
    neo4jSkipReason = "failed to determine Neo4j Bolt host port";
    await docker(["rm", "-f", name], 30_000).catch(() => {});
    containerName = undefined;
    return;
  }

  neo4jCfg = {
    uri: `bolt://localhost:${port}`,
    username: "neo4j",
    password: "testpass",
  };

  try {
    await waitForNeo4j(neo4jCfg, 120_000);
  } catch (err: any) {
    const logs = await docker(["logs", name, "--tail", "120"], 30_000)
      .then((r) => String(r.stdout || "").trim())
      .catch(() => "");
    neo4jSkipReason = `neo4j not ready: ${String(err?.message || err)}${logs ? ` (${logs.split("\n").pop()})` : ""}`;
    neo4jCfg = undefined;
    await docker(["rm", "-f", name], 30_000).catch(() => {});
    containerName = undefined;
  }
}

if (!neo4jCfg) {
  await startNeo4jDocker();
}

const SKIP = !neo4jCfg;
if (SKIP) {
  const reasonText = neo4jSkipReason
    ? neo4jSkipReason.replace(/\s+/g, " ").trim().slice(0, 220)
    : "";
  const reason = reasonText ? `: ${reasonText}` : "";
  test.skip(`memory auto record (neo4j unavailable${reason})`, () => {});
}

describe.skipIf(SKIP)("memory auto record", () => {
  afterAll(async () => {
    if (!containerName) return;
    await docker(["rm", "-f", containerName], 30_000).catch(() => {});
  });

  test("records a message into the project memory graph", async () => {
    const cfg = neo4jCfg;
    expect(cfg).toBeTruthy();
    if (!cfg) throw new Error("Missing Neo4j config");

    const projectId = `test-project-${Date.now()}`;
    const messageId = `msg-${Date.now()}`;
    const text = `memory-auto-${Math.random().toString(36).slice(2)}`;

    const common = {
      cfg,
      sessionId: "session-test",
      role: "user",
      userId: "tester",
      scope: "project" as const,
      projectId,
      maxChars: 2000,
      summaries: { enabled: true, sessionMaxChars: 500, projectMaxChars: 500 },
      trim: { maxMessagesPerSession: 3, maxMessagesPerProject: 5 },
    };

    await recordMessageMemory({
      ...common,
      text,
      messageId,
    });

    // Overwrite the session with more messages to force trimming.
    for (let i = 0; i < 6; i++) {
      await recordMessageMemory({
        ...common,
        text: `memory-auto-extra-${i}-${Math.random().toString(36).slice(2)}`,
        messageId: `msg-extra-${Date.now()}-${i}`,
      });
    }

    const results = await searchMemory({
      cfg,
      scope: "project",
      projectId,
      query: text,
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.value.includes(text))).toBe(true);

    const projectNodes = await searchMemory({
      cfg,
      scope: "project",
      projectId,
      query: `project:${projectId}`,
      limit: 5,
    });
    expect(projectNodes.some((r) => r.key === `project:${projectId}`)).toBe(
      true,
    );

    const userNodes = await searchMemory({
      cfg,
      scope: "project",
      projectId,
      query: "user:tester",
      limit: 5,
    });
    expect(userNodes.some((r) => r.key === "user:tester")).toBe(true);

    // Trimming: only keep latest 3 messages for the session.
    const count = await withNeo4jSession(cfg, async (session) => {
      const res = await session.run(
        `
MATCH (n:Memory { scope: $scope, projectId: $projectId })
WHERE n.key STARTS WITH $prefix
RETURN count(n) AS c
        `.trim(),
        { scope: "project", projectId, prefix: "message:session-test:" },
      );
      const rec = res.records?.[0] as any;
      return rec ? (rec.get("c") as number) : 0;
    });
    expect(count).toBeLessThanOrEqual(3);

    // Project cap should also hold (all message nodes).
    const projectCount = await withNeo4jSession(cfg, async (session) => {
      const res = await session.run(
        `
MATCH (n:Memory { scope: $scope, projectId: $projectId })
WHERE n.key STARTS WITH $prefix
RETURN count(n) AS c
        `.trim(),
        { scope: "project", projectId, prefix: "message:" },
      );
      const rec = res.records?.[0] as any;
      return rec ? (rec.get("c") as number) : 0;
    });
    expect(projectCount).toBeLessThanOrEqual(5);

    // Summaries exist and are bounded.
    const summaries = await withNeo4jSession(cfg, async (session) => {
      const res = await session.run(
        `
MATCH (n:Memory { scope: $scope, projectId: $projectId })
WHERE n.key IN $keys
RETURN n.key AS key, n.value AS value
        `.trim(),
        {
          scope: "project",
          projectId,
          keys: ["summary:project", "summary:session:session-test"],
        },
      );
      return res.records.map((r: any) => ({
        key: String(r.get("key")),
        value: String(r.get("value") ?? ""),
      }));
    });
    expect(
      summaries.find((s) => s.key === "summary:project")?.value.length ?? 0,
    ).toBeGreaterThan(0);
    expect(
      summaries.find((s) => s.key === "summary:project")?.value.length ?? 0,
    ).toBeLessThanOrEqual(500);

    const globalSummary = await withNeo4jSession(cfg, async (session) => {
      const res = await session.run(
        `
MATCH (n:Memory { scope: $scope, key: $key })
RETURN n.value AS value
LIMIT 1
        `.trim(),
        { scope: "global", key: `summary:project:${projectId}` },
      );
      const rec = res.records?.[0] as any;
      return rec ? String(rec.get("value") ?? "") : "";
    });
    expect(globalSummary.length).toBeGreaterThan(0);
    expect(globalSummary.length).toBeLessThanOrEqual(500);

    // Injection builder returns a bounded snippet.
    const injected = await buildMemoryInjection({
      enabled: true,
      cfg,
      scope: "project",
      projectId,
      sessionId: "session-test",
      inject: { maxChars: 800, maxEntries: 5 },
    });
    expect(typeof injected).toBe("string");
    expect((injected ?? "").length).toBeLessThanOrEqual(800);
  }, 60_000);
});
