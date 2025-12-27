import { describe, expect, test } from "bun:test";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getRepoContext, getRepoContextForWorker } from "../../src/ux/repo-context";

describe("repo context", () => {
  test("returns undefined when directory is missing", async () => {
    const ctx = await getRepoContext({ directory: "/path/does/not/exist" });
    expect(ctx).toBeUndefined();
  });

  test("builds repo context with package.json and README", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-repo-ctx-"));

    // Initialize a git repo so git info paths are covered.
    execSync("git init", { cwd: dir });
    execSync("git config user.email \"test@example.com\"", { cwd: dir });
    execSync("git config user.name \"Test\"", { cwd: dir });
    execSync("git remote add origin https://example.com/repo.git", { cwd: dir });

    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "sample-app",
        description: "Sample desc",
        scripts: { test: "vitest" },
        dependencies: { solid: "1.0.0" },
        devDependencies: { vitest: "1.0.0" },
      }),
      "utf8",
    );
    await writeFile(join(dir, "README.md"), "Hello README", "utf8");
    execSync("git add package.json README.md", { cwd: dir });
    execSync("git commit -m \"init\"", { cwd: dir });
    await writeFile(join(dir, "temp.txt"), "change", "utf8");

    const ctx = await getRepoContext({ directory: dir, maxReadmeChars: 1000, maxTotalChars: 2000 });
    expect(ctx?.name).toBe("sample-app");
    expect(ctx?.description).toBe("Sample desc");
    expect(ctx?.structure.length).toBeGreaterThan(0);
    expect(ctx?.git?.branch).toBeTruthy();
    expect(ctx?.git?.remoteUrl).toContain("example.com");
    expect(ctx?.git?.hasUncommittedChanges).toBe(true);
    expect(ctx?.markdown).toContain("Project Context");

    const wrapped = await getRepoContextForWorker(dir);
    expect(wrapped).toContain("<repo-context>");
  });

  test("handles non-git directories and truncation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-repo-nogit-"));
    await writeFile(join(dir, "README.md"), "A".repeat(200), "utf8");

    const ctx = await getRepoContext({ directory: dir, maxReadmeChars: 10, maxTotalChars: 20 });
    expect(ctx?.git).toBeUndefined();
    expect(ctx?.truncated).toBe(true);
  });

  test("handles directory structure failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-repo-struct-"));
    await symlink(join(dir, "missing"), join(dir, "broken-link"));
    const ctx = await getRepoContext({ directory: dir });
    expect(ctx?.structure).toContain("broken-link");

    const filePath = join(dir, "not-a-dir.txt");
    await writeFile(filePath, "content", "utf8");
    const fileCtx = await getRepoContext({ directory: filePath });
    expect(fileCtx?.structure).toEqual([]);
  });
});
