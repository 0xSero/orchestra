import { describe, expect, test } from "bun:test";
import { resolveProfileInheritance } from "../../src/config/profile-inheritance";
import type { WorkerProfile } from "../../src/types";

const builtIns: Record<string, WorkerProfile> = {
  coder: {
    id: "coder",
    name: "Coder",
    model: "auto:code",
    purpose: "write code",
    whenToUse: "use for code",
    tools: { write: true, edit: true },
    permissions: { categories: { filesystem: "full" } },
  },
  docs: {
    id: "docs",
    name: "Docs",
    model: "auto:docs",
    purpose: "docs",
    whenToUse: "use for docs",
    tools: { write: false },
  },
};

describe("profile inheritance", () => {
  test("extends base profile", () => {
    const profiles = resolveProfileInheritance({
      builtIns,
      definitions: {
        "safe-coder": {
          id: "safe-coder",
          extends: "coder",
          permissions: { categories: { execution: "sandboxed" } },
        },
      },
    });

    expect(profiles["safe-coder"].model).toBe("auto:code");
    expect(profiles["safe-coder"].permissions?.categories?.filesystem).toBe("full");
    expect(profiles["safe-coder"].permissions?.categories?.execution).toBe("sandboxed");
  });

  test("compose merges tools", () => {
    const profiles = resolveProfileInheritance({
      builtIns,
      definitions: {
        "full-stack": {
          id: "full-stack",
          compose: ["coder", "docs"],
          model: "auto:code",
        },
      },
    });

    expect(profiles["full-stack"].tools?.write).toBe(false);
    expect(profiles["full-stack"].tools?.edit).toBe(true);
  });
});
