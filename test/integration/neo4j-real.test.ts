import { describe, expect, test } from "bun:test";
import { loadNeo4jConfigFromEnv, withNeo4jSession } from "../../src/memory/neo4j";

describe("neo4j real integration", () => {
  const cfg = loadNeo4jConfigFromEnv();

  if (!cfg) {
    test.skip("requires OPENCODE_NEO4J_* environment variables", () => {});
    return;
  }

  test("connects and runs a simple query", async () => {
    const result = await withNeo4jSession(cfg, async (session) => {
      return session.run("RETURN 1 AS ok");
    });

    const record = result.records[0];
    expect(record).toBeTruthy();
    expect(record.get("ok")).toBe(1);
  });
});
