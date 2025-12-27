import { describe, expect, test, mock } from "bun:test";

describe("fixture manager error handling", () => {
  test("handles missing fixture directories and cleanup errors", async () => {
    mock.module("node:fs", () => ({
      existsSync: () => true,
    }));

    mock.module("node:fs/promises", () => ({
      mkdir: async () => {},
      mkdtemp: async () => "/tmp/test-fixture",
      readdir: async () => {
        throw new Error("missing");
      },
      readFile: async () => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
      rm: async () => {
        throw new Error("rm failed");
      },
    }));

    const { createTestFixtures } = await import("../helpers/fixtures-manager");
    const fixtures = createTestFixtures();

    try {
      expect(fixtures.getFixturesDir()).toContain("fixtures");

      const configs = await fixtures.listConfigs();
      const profiles = await fixtures.listProfiles();
      expect(configs).toEqual([]);
      expect(profiles).toEqual([]);

      const tmpDir = await fixtures.createTempDir();
      expect(tmpDir).toBe("/tmp/test-fixture");

      await fixtures.cleanup();
    } finally {
      mock.restore();
    }
  });
});
