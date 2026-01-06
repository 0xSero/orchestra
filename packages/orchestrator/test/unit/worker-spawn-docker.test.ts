import { describe, expect, test } from "bun:test";
import { spawnOpencodeServeDocker } from "../../src/workers/spawn/spawn-opencode";

const baseOptions = {
  timeout: 1,
  config: {},
  env: {},
  directory: "/tmp",
} as const;

describe("spawnOpencodeServeDocker", () => {
  test("rejects missing port", async () => {
    await expect(
      spawnOpencodeServeDocker({
        ...baseOptions,
        port: 0,
        docker: { image: "ghcr.io/example/opencode:latest" },
      }),
    ).rejects.toThrow("fixed, non-zero port");
  });

  test("rejects missing image", async () => {
    await expect(
      spawnOpencodeServeDocker({
        ...baseOptions,
        port: 14096,
        docker: { image: "" },
      }),
    ).rejects.toThrow("docker.image");
  });
});
