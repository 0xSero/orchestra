import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { recordMessageMemory } from "../src/memory/auto";
import { loadNeo4jConfigFromEnv } from "../src/memory/neo4j";
import { searchMemory } from "../src/memory/graph";
import { withNeo4jSession } from "../src/memory/neo4j";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

let containerName: string | undefined;

async function waitForNeo4j(cfg: ReturnType<typeof loadNeo4jConfigFromEnv>): Promise<void> {
  if (!cfg) return;
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    try {
      await withNeo4jSession(cfg, async (session) => {
        await session.run("RETURN 1");
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Neo4j did not become ready within 60s");
}

describe("memory auto record", () => {
  beforeAll(async () => {
    if (loadNeo4jConfigFromEnv()) return;
    containerName = `opencode-neo4j-test-${process.pid}-${Date.now()}`;
    const boltPort = 17687 + Math.floor(Math.random() * 1000);

    await exec("docker", [
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "-p",
      `${boltPort}:7687`,
      "-e",
      "NEO4J_AUTH=neo4j/testpass",
      "neo4j:5",
    ]);

    process.env.OPENCODE_NEO4J_URI = `bolt://localhost:${boltPort}`;
    process.env.OPENCODE_NEO4J_USERNAME = "neo4j";
    process.env.OPENCODE_NEO4J_PASSWORD = "testpass";
    delete process.env.OPENCODE_NEO4J_DATABASE;

    await waitForNeo4j(loadNeo4jConfigFromEnv());
  }, 120_000);

  afterAll(async () => {
    if (!containerName) return;
    await exec("docker", ["stop", containerName]).catch(() => {});
  }, 120_000);

  test("records a message into the project memory graph", async () => {
    const cfg = loadNeo4jConfigFromEnv();
    expect(cfg).toBeTruthy();
    if (!cfg) throw new Error("Missing OPENCODE_NEO4J_* environment variables");

    const projectId = `test-project-${Date.now()}`;
    const messageId = `msg-${Date.now()}`;
    const text = `memory-auto-${Math.random().toString(36).slice(2)}`;

    await recordMessageMemory({
      text,
      sessionId: "session-test",
      messageId,
      role: "user",
      userId: "tester",
      scope: "project",
      projectId,
      maxChars: 2000,
    });

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
    expect(projectNodes.some((r) => r.key === `project:${projectId}`)).toBe(true);

    const userNodes = await searchMemory({
      cfg,
      scope: "project",
      projectId,
      query: "user:tester",
      limit: 5,
    });
    expect(userNodes.some((r) => r.key === "user:tester")).toBe(true);
  }, 60_000);
});
