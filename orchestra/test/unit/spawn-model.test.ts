import { describe, expect, test } from "bun:test";
import type { WorkerProfile } from "../../src/types";
import { resolveProfileModel } from "../../src/workers/spawn-model";

describe("spawn model resolver", () => {
  test("throws when model resolution is unavailable for auto tags", async () => {
    const profile: WorkerProfile = {
      id: "alpha",
      name: "Alpha",
      model: "auto",
      purpose: "test",
      whenToUse: "testing",
    };

    await expect(resolveProfileModel({ api: {} as never, directory: process.cwd(), profile })).rejects.toThrow(
      "model resolution is unavailable",
    );
  });

  test("returns explicit models when no client is available", async () => {
    const profile: WorkerProfile = {
      id: "alpha",
      name: "Alpha",
      model: "provider/model",
      purpose: "test",
      whenToUse: "testing",
    };

    const result = await resolveProfileModel({ api: {} as never, directory: process.cwd(), profile });
    expect(result.profile.model).toBe("provider/model");
    expect(result.changes.length).toBe(0);
  });

  test("skips hydration for explicit models even with client", async () => {
    const profile: WorkerProfile = {
      id: "alpha",
      name: "Alpha",
      model: "provider/model",
      purpose: "test",
      whenToUse: "testing",
    };

    const result = await resolveProfileModel({
      api: { client: {} } as never,
      directory: process.cwd(),
      profile,
    });
    expect(result.profile.model).toBe("provider/model");
  });

  test("hydrates auto models when client is available", async () => {
    const profile: WorkerProfile = {
      id: "alpha",
      name: "Alpha",
      model: "auto:fast",
      purpose: "test",
      whenToUse: "testing",
    };

    const result = await resolveProfileModel({
      api: { client: {} } as never,
      directory: process.cwd(),
      profile,
      deps: {
        hydrateProfileModelsFromOpencode: async () => ({
          profiles: { alpha: { ...profile, model: "provider/fast" } },
          changes: [{ profileId: "alpha", from: "auto:fast", to: "provider/fast", reason: "auto" }],
          fallbackModel: "provider/fast",
        }),
      },
    });

    expect(result.profile.model).toBe("provider/fast");
    expect(result.changes.length).toBe(1);
  });
});
