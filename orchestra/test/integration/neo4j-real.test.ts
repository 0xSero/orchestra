import { describe, expect, test } from "bun:test";
import { loadNeo4jConfig, withNeo4jSession } from "../../src/memory/neo4j";

describe("neo4j real integration", () => {
  const cfg = loadNeo4jConfig();

  if (!cfg) {
    test("returns undefined when Neo4j config is missing", () => {
      expect(loadNeo4jConfig()).toBeUndefined();
    });
    return;
  }

  test("connects and runs a simple query", async () => {
    try {
      const result = await withNeo4jSession(cfg, async (session) => {
        return session.run("RETURN 1 AS ok");
      });

      const record = result.records[0];
      expect(record).toBeTruthy();
      expect(record.get("ok")).toBe(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: string } | undefined)?.code;
      if (code === "Neo.DatabaseError.Transaction.TransactionStartFailed" || message.includes("needs to be restarted")) {
        return;
      }
      throw error;
    }
  });
});
