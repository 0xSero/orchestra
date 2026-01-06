import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  archiveQueueTask,
  loadQueueTasks,
  resolveConfiguredPath,
} from "../../../src/workflows/runner";

const makeTempDir = async () => await mkdtemp(join(tmpdir(), "orch-"));

describe("infinite orchestra queue helpers", () => {
  test("resolveConfiguredPath blocks paths outside the base", async () => {
    const base = await makeTempDir();
    try {
      expect(() =>
        resolveConfiguredPath(base, "../outside", ".opencode/orchestra/tasks"),
      ).toThrow();
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("resolveConfiguredPath resolves relative paths under the base", async () => {
    const base = await makeTempDir();
    try {
      const resolved = resolveConfiguredPath(base, "queue", "fallback");
      expect(resolved.startsWith(base)).toBe(true);
      expect(resolved.endsWith("queue")).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("loadQueueTasks orders tasks by numeric index", async () => {
    const base = await makeTempDir();
    const tasksDir = join(base, "tasks");
    await mkdir(tasksDir, { recursive: true });
    await writeFile(join(tasksDir, "task-02.md"), "two", "utf8");
    await writeFile(join(tasksDir, "task-10.md"), "ten", "utf8");
    await writeFile(join(tasksDir, "task-01.md"), "one", "utf8");

    try {
      const tasks = await loadQueueTasks(tasksDir);
      expect(tasks.map((task) => task.id)).toEqual([
        "task-01",
        "task-02",
        "task-10",
      ]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("archiveQueueTask moves the task into the archive directory", async () => {
    const base = await makeTempDir();
    const tasksDir = join(base, "tasks");
    const archiveDir = join(base, "done");
    await mkdir(tasksDir, { recursive: true });
    const taskPath = join(tasksDir, "task-00.md");
    await writeFile(taskPath, "task", "utf8");

    try {
      const dest = await archiveQueueTask(
        { id: "task-00", path: taskPath, content: "task" },
        archiveDir,
      );

      expect(dest.startsWith(archiveDir)).toBe(true);
      expect(dest.includes("task-00-")).toBe(true);
      expect(dest.endsWith(".md")).toBe(true);
      await expect(stat(taskPath)).rejects.toThrow();
      const destStat = await stat(dest);
      expect(destStat.isFile()).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
