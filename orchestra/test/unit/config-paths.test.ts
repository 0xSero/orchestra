import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getDefaultGlobalOpenCodeConfigPath,
  getDefaultGlobalOrchestratorConfigPath,
  getDefaultProjectOrchestratorConfigPath,
} from "../../src/config/orchestrator/paths";

describe("config path helpers", () => {
  const originalXdg = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    process.env.XDG_CONFIG_HOME = "/tmp/opencode-config";
  });

  afterEach(() => {
    if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
    else delete process.env.XDG_CONFIG_HOME;
  });

  test("returns global config paths", () => {
    expect(getDefaultGlobalOrchestratorConfigPath()).toBe("/tmp/opencode-config/opencode/orchestrator.json");
    expect(getDefaultGlobalOpenCodeConfigPath()).toBe("/tmp/opencode-config/opencode/opencode.json");
  });

  test("returns project config path", () => {
    expect(getDefaultProjectOrchestratorConfigPath("/workspace")).toBe("/workspace/.opencode/orchestrator.json");
  });
});
