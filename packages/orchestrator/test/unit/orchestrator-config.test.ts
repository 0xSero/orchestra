import { describe, expect, test } from "bun:test";
import { parseOrchestratorConfigFile, resolveWorkerEntry } from "../../src/config/orchestrator";
import { builtInProfiles } from "../../src/config/profiles";

describe("parseOrchestratorConfigFile", () => {
  test("filters invalid fields and preserves valid ones", () => {
    const parsed = parseOrchestratorConfigFile({
      basePort: "not-a-number",
      autoSpawn: true,
      ui: {
        toasts: false,
        defaultListFormat: "json",
        debug: "nope",
      },
      notifications: { idle: { enabled: true, title: 123, message: "hello", delayMs: 1500 } },
      profiles: ["coder", 123, { id: "custom" }],
    });

    expect(parsed.basePort).toBeUndefined();
    expect(parsed.autoSpawn).toBe(true);
    expect(parsed.ui).toEqual({ toasts: false, defaultListFormat: "json" });
    expect(parsed.notifications?.idle).toEqual({ enabled: true, message: "hello", delayMs: 1500 });
    const profiles = parsed.profiles ?? [];
    expect(profiles[0]).toBe("coder");
    const customProfile = profiles[1];
    if (customProfile && typeof customProfile === "object" && "id" in customProfile) {
      expect(customProfile.id).toBe("custom");
    } else {
      throw new Error("Expected custom profile entry to be parsed.");
    }
  });
});

describe("resolveWorkerEntry", () => {
  test("merges built-in profile defaults with overrides", () => {
    const resolved = resolveWorkerEntry({
      id: "coder",
      name: "Custom Coder",
      model: "node:fast",
      purpose: "Overrides the default",
      whenToUse: "Unit test",
    });

    expect(resolved?.id).toBe("coder");
    expect(resolved?.name).toBe("Custom Coder");
    expect(resolved?.model).toBe("node:fast");
    expect(resolved?.systemPrompt).toBe(builtInProfiles.coder.systemPrompt);
  });
});
