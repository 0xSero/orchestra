import { describe, expect, test } from "bun:test";
import type { TestFixturesDeps } from "../helpers/fixtures-manager";

describe("fixture manager error handling", () => {
  test("handles missing fixture directories and cleanup errors", async () => {
    const { createTestFixtures } = await import("../helpers/fixtures-manager");
    const consoleWarn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args);

    try {
      const fixtures = createTestFixtures({
        existsSync: () => true,
        mkdir: async () => {},
        mkdtemp: (async () => "/tmp/test-fixture") as unknown as TestFixturesDeps["mkdtemp"],
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
      });

      expect(fixtures.getFixturesDir()).toContain("fixtures");

      const configs = await fixtures.listConfigs();
      const profiles = await fixtures.listProfiles();
      expect(configs).toEqual([]);
      expect(profiles).toEqual([]);

      const tmpDir = await fixtures.createTempDir();
      expect(tmpDir).toBe("/tmp/test-fixture");

      await expect(fixtures.loadConfig("missing")).rejects.toThrow("Config fixture not found: missing");
      await expect(fixtures.loadProfile("missing")).rejects.toThrow("Profile fixture not found: missing");

      await fixtures.cleanup();
      expect(warnings.length).toBe(1);
    } finally {
      console.warn = consoleWarn;
    }
  });
});
