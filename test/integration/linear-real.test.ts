import { describe, expect, test } from "bun:test";
import { getTeamStates, getViewer, loadLinearConfigFromEnv } from "../../src/integrations/linear";

describe("linear real integration", () => {
  const cfg = loadLinearConfigFromEnv();

  if (!cfg) {
    test.skip("requires LINEAR_API_KEY and LINEAR_TEAM_ID", () => {});
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
