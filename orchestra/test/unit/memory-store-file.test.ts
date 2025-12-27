import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getUserConfigDir } from "../../src/helpers/format";
import {
  getMemoryByKey,
  linkMemory,
  recentMemory,
  searchMemory,
  trimGlobalMessageProjects,
  trimMemoryByKeyPrefix,
  upsertMemory,
} from "../../src/memory/store-file";

describe("memory file store", () => {
  let tempDir = "";
  const originalXdg = process.env.XDG_CONFIG_HOME;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orch-mem-file-"));
    process.env.XDG_CONFIG_HOME = tempDir;
  });

  afterEach(async () => {
    if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
    else delete process.env.XDG_CONFIG_HOME;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("upserts, searches, and links memory", async () => {
    const node = await upsertMemory({
      scope: "project",
      projectId: "project one",
      key: "note:1",
      value: "Remember the tokens",
      tags: [" tag ", 1 as unknown as string],
    });

    expect(node.tags).toEqual(["tag"]);

    const fetched = await getMemoryByKey({ scope: "project", projectId: "project one", key: "note:1" });
    expect(fetched?.value).toBe("Remember the tokens");

    const search = await searchMemory({ scope: "project", projectId: "project one", query: "tokens", limit: 5 });
    expect(search.length).toBeGreaterThan(0);

    const linked = await linkMemory({
      scope: "project",
      projectId: "project one",
      fromKey: "note:1",
      toKey: "note:2",
      type: "relates_to",
    });
    expect(linked.ok).toBe(true);

    const recent = await recentMemory({ scope: "project", projectId: "project one", limit: 5 });
    expect(recent.length).toBeGreaterThan(0);
  });

  test("trims memory by prefix and project limits", async () => {
    await upsertMemory({ scope: "global", key: "message:proj1:1", value: "m1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await upsertMemory({ scope: "global", key: "message:proj1:2", value: "m2" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await upsertMemory({ scope: "global", key: "message:proj2:1", value: "m3" });

    const trimmed = await trimMemoryByKeyPrefix({
      scope: "global",
      keyPrefix: "message:proj1:",
      keepLatest: 1,
    });
    expect(trimmed.deleted).toBeGreaterThan(0);

    const none = await trimMemoryByKeyPrefix({
      scope: "global",
      keyPrefix: "missing:",
      keepLatest: 1,
    });
    expect(none.deleted).toBe(0);

    const dropped = await trimGlobalMessageProjects({ keepProjects: 1 });
    expect(dropped.projectsDropped).toBeGreaterThan(0);
    expect(dropped.messagesDeleted).toBeGreaterThan(0);

    const droppedAll = await trimGlobalMessageProjects({ keepProjects: 0 });
    expect(droppedAll.messagesDeleted).toBeGreaterThan(0);
  });

  test("handles invalid memory file JSON", async () => {
    const base = join(getUserConfigDir(), "opencode", "orchestrator-memory");
    await mkdir(base, { recursive: true });
    await writeFile(join(base, "global.json"), "{ invalid", "utf8");

    const recent = await recentMemory({ scope: "global", limit: 5 });
    expect(recent.length).toBe(0);
  });
});
