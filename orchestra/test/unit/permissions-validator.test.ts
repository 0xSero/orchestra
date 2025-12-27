import { describe, expect, test } from "bun:test";
import { buildToolConfigFromPermissions, mergeToolPermissions, summarizePermissions } from "../../src/permissions/validator";

describe("permissions validator helpers", () => {
  test("merges tool permissions and paths", () => {
    expect(mergeToolPermissions()).toBeUndefined();

    const merged = mergeToolPermissions(
      { paths: { allowed: ["a"] }, categories: { filesystem: "read" } },
      { paths: { denied: ["b"] }, tools: { read: { enabled: false } } },
    );
    expect(merged?.paths?.allowed).toEqual(["a"]);
    expect(merged?.paths?.denied).toEqual(["b"]);
    expect(merged?.categories?.filesystem).toBe("read");
    expect(merged?.tools?.read?.enabled).toBe(false);
  });

  test("builds tool config from permission categories and overrides", () => {
    const tools = buildToolConfigFromPermissions({
      permissions: {
        categories: { filesystem: "none", execution: "none", network: "none" },
        tools: { read: { enabled: true }, exec: { enabled: false } },
      },
      baseTools: { read: true, write: true, exec: true },
    });

    expect(tools?.read).toBe(true);
    expect(tools?.write).toBe(false);
    expect(tools?.exec).toBe(false);
  });

  test("downgrades filesystem write tools when set to read", () => {
    const tools = buildToolConfigFromPermissions({
      permissions: { categories: { filesystem: "read" } },
      baseTools: { write: true, edit: true },
    });

    expect(tools?.write).toBe(false);
    expect(tools?.edit).toBe(false);
  });

  test("summarizes permissions to human readable text", () => {
    expect(summarizePermissions()).toBeUndefined();
    expect(summarizePermissions({})).toBeUndefined();

    const summary = summarizePermissions({
      categories: { filesystem: "read", execution: "none" },
      paths: { allowed: ["src"], denied: ["dist"] },
      tools: { read: { enabled: true } },
    });
    expect(summary).toContain("filesystem: read");
    expect(summary).toContain("execution: none");
    expect(summary).toContain("allowed paths");
    expect(summary).toContain("denied paths");
    expect(summary).toContain("tool overrides");
  });
});
