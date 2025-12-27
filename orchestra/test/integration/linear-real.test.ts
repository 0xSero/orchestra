import { describe, expect, test } from "bun:test";
import { getTeamStates, getViewer, loadLinearConfigFromEnv, resolveLinearConfig } from "../../src/integrations/linear";

describe("linear real integration", () => {
  const cfg = loadLinearConfigFromEnv();

  if (!cfg) {
    test("returns undefined when credentials are missing", () => {
      expect(loadLinearConfigFromEnv()).toBeUndefined();
    });

    test("resolveLinearConfig throws when missing credentials", () => {
      expect(() => resolveLinearConfig()).toThrow("Missing Linear credentials");
    });
    return;
  }

  test("connects and returns viewer", async () => {
    const viewer = await getViewer(cfg);
    expect(viewer.id).toBeTruthy();
  });

  test("loads team states", async () => {
    const states = await getTeamStates({ cfg });
    expect(states.length).toBeGreaterThan(0);
  });
});
