import { describe, expect, test } from "bun:test";
import {
  canAutoSpawn,
  canReuseExisting,
  canSpawnManually,
  canSpawnOnDemand,
  canWarmPool,
  resolveSpawnPolicy,
} from "../../src/core/spawn-policy";

describe("spawn policy helpers", () => {
  test("resolves policy defaults and overrides", () => {
    const config = {
      default: { autoSpawn: false, allowManual: true },
      profiles: { alpha: { onDemand: false } },
    };
    const resolved = resolveSpawnPolicy(config, "alpha");
    expect(resolved.autoSpawn).toBe(false);
    expect(resolved.allowManual).toBe(true);
    expect(resolved.onDemand).toBe(false);
  });

  test("evaluates capability flags", () => {
    const config = {
      default: {
        autoSpawn: true,
        onDemand: true,
        allowManual: false,
        warmPool: false,
        reuseExisting: true,
      },
      profiles: {
        beta: { autoSpawn: false, onDemand: false, allowManual: true, warmPool: true, reuseExisting: false },
      },
    };
    expect(canAutoSpawn(config, "beta")).toBe(false);
    expect(canSpawnOnDemand(config, "beta")).toBe(false);
    expect(canSpawnManually(config, "beta")).toBe(true);
    expect(canWarmPool(config, "beta")).toBe(true);
    expect(canReuseExisting(config, "beta")).toBe(false);
  });
});
