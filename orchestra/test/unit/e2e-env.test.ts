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

    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = source;

    const env = await setupE2eEnv();
    const copied = await readFile(join(env.root, "config", "opencode", "opencode.json"), "utf8");
    const parsed = JSON.parse(copied) as { plugin?: string[] };
    expect(parsed.plugin).toEqual(["keep-me"]);

    env.restore();
    if (original === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = original;

    await rm(source, { recursive: true, force: true });
    await rm(env.root, { recursive: true, force: true });
  });

  test("falls back to copy when opencode config is invalid", async () => {
    const source = await mkdtemp(join(tmpdir(), "orch-e2e-src-bad-"));
    const opencodeDir = join(source, "opencode");
    await mkdir(opencodeDir, { recursive: true });
    const badPayload = "{ invalid";
    await writeFile(join(opencodeDir, "opencode.json"), badPayload, "utf8");

    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = source;

    const env = await setupE2eEnv();
    const copied = await readFile(join(env.root, "config", "opencode", "opencode.json"), "utf8");
    expect(copied).toBe(badPayload);

    env.restore();
    if (original === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = original;

    await rm(source, { recursive: true, force: true });
    await rm(env.root, { recursive: true, force: true });
  });
});
