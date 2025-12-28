import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("writeJsonAtomic", () => {
  test("writes JSON data to disk", async () => {
    const { writeJsonAtomic } = await import("../../src/helpers/fs");
    const cleanupDir = await mkdtemp(join(tmpdir(), "orch-fs-test-"));
    const filePath = join(cleanupDir, "data.json");

    try {
      await writeJsonAtomic(filePath, { ok: true });
      const raw = await readFile(filePath, "utf8");
      expect(JSON.parse(raw)).toEqual({ ok: true });
    } finally {
      await rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("falls back when rename fails", async () => {
    let writeCount = 0;

    const { writeJsonAtomic } = await import("../../src/helpers/fs");
    const cleanupDir = await mkdtemp(join(tmpdir(), "orch-fs-fallback-"));
    const filePath = join(cleanupDir, "fallback.json");

    try {
      await writeJsonAtomic(
        filePath,
        { ok: false },
        {
          fs: {
            rename: async () => {
              throw new Error("rename failed");
            },
            writeFile: async (...args: Parameters<typeof writeFile>) => {
              writeCount += 1;
              return await writeFile(...args);
            },
            unlink,
          },
        },
      );
      expect(writeCount).toBeGreaterThan(0);
    } finally {
      await rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("ignores mkdir and unlink errors", async () => {
    const { writeJsonAtomic } = await import("../../src/helpers/fs");
    const cleanupDir = await mkdtemp(join(tmpdir(), "orch-fs-errors-"));
    const filePath = join(cleanupDir, "errors.json");

    try {
      await writeJsonAtomic(
        filePath,
        { ok: "errors" },
        {
          fs: {
            mkdir: async () => {
              throw new Error("mkdir failed");
            },
            rename: async () => {
              throw new Error("rename failed");
            },
            unlink: async () => {
              throw new Error("unlink failed");
            },
            writeFile,
          },
        },
      );
      const raw = await readFile(filePath, "utf8");
      expect(JSON.parse(raw)).toEqual({ ok: "errors" });
    } finally {
      await rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
