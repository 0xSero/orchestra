import { describe, expect, test } from "bun:test";
import type { WorkerConfig } from "../../src/db";
import { applyWorkerConfigOverrides } from "../../src/db/overrides";
import type { WorkerProfile } from "../../src/types";

describe("applyWorkerConfigOverrides", () => {
  test("applies sqlite overrides without mutating input", () => {
    const profiles: Record<string, WorkerProfile> = {
      vision: {
        id: "vision",
        name: "Vision Analyst",
        model: "provider/vision-1",
        purpose: "Analyze images",
        whenToUse: "When visuals are provided",
        temperature: 0.4,
      },
      docs: {
        id: "docs",
        name: "Docs Helper",
        model: "provider/docs-1",
        purpose: "Read docs",
        whenToUse: "When docs are needed",
      },
    };

    const configs: WorkerConfig[] = [
      {
        id: "cfg1",
        userId: "user1",
        workerId: "vision",
        model: "provider/vision-2",
        temperature: 0.2,
        maxTokens: 512,
        enabled: false,
        updatedAt: new Date("2024-01-01T00:00:00Z"),
      },
    ];

    const result = applyWorkerConfigOverrides(profiles, configs);

    expect(result.vision.model).toBe("provider/vision-2");
    expect(result.vision.temperature).toBe(0.2);
    expect(result.vision.maxTokens).toBe(512);
    expect(result.vision.enabled).toBe(false);
    expect(result.docs.model).toBe("provider/docs-1");

    expect(profiles.vision.model).toBe("provider/vision-1");
    expect(profiles.vision.enabled).toBeUndefined();
  });
});
