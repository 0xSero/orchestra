import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupE2eEnv } from "../helpers/e2e-env";

describe("e2e env helper", () => {
  test("copies and filters opencode config", async () => {
    const source = await mkdtemp(join(tmpdir(), "orch-e2e-src-"));
    const opencodeDir = join(source, "opencode");
    await mkdir(opencodeDir, { recursive: true });
    await writeFile(
      join(opencodeDir, "opencode.json"),
      JSON.stringify({ plugin: ["orchestrator.local", "keep-me"] }, null, 2),
      "utf8",
    );

    const env = await setupE2eEnv({ sourceConfigHome: source });
    const copied = await readFile(join(env.root, "config", "opencode", "opencode.json"), "utf8");
    const parsed = JSON.parse(copied) as { plugin?: string[] };
    expect(parsed.plugin).toEqual(["keep-me"]);

    env.restore();

    await rm(source, { recursive: true, force: true });
    await rm(env.root, { recursive: true, force: true });
  });

  test("falls back to copy when opencode config is invalid", async () => {
    const source = await mkdtemp(join(tmpdir(), "orch-e2e-src-bad-"));
    const opencodeDir = join(source, "opencode");
    await mkdir(opencodeDir, { recursive: true });
    const badPayload = "{ invalid";
    await writeFile(join(opencodeDir, "opencode.json"), badPayload, "utf8");

    const env = await setupE2eEnv({ sourceConfigHome: source });
    const copied = await readFile(join(env.root, "config", "opencode", "opencode.json"), "utf8");
    expect(copied).toBe(badPayload);

    env.restore();

    await rm(source, { recursive: true, force: true });
    await rm(env.root, { recursive: true, force: true });
  });

  test("handles missing source config directory", async () => {
    const source = await mkdtemp(join(tmpdir(), "orch-e2e-src-empty-"));
    const env = await setupE2eEnv({ sourceConfigHome: source });
    expect(env.root).toContain("opencode-e2e-");
    env.restore();
    await rm(source, { recursive: true, force: true });
    await rm(env.root, { recursive: true, force: true });
  });

  test("restores preexisting env values", async () => {
    const originalState = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = "/tmp/state-home";

    const env = await setupE2eEnv();
    env.restore();

    expect(process.env.XDG_STATE_HOME).toBe("/tmp/state-home");

    if (originalState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalState;

    await rm(env.root, { recursive: true, force: true });
  });
});
