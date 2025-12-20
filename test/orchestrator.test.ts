import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrchestratorConfig } from "../src/config/orchestrator";
import { buildPromptParts, extractTextFromPromptResponse } from "../src/workers/prompt";

describe("config loader", () => {
  test("does not turn arrays into objects when merging", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-orch-"));
    const cfgRoot = await mkdtemp(join(tmpdir(), "opencode-config-"));

    const prev = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = cfgRoot;

    try {
      await mkdir(join(cfgRoot, "opencode"), { recursive: true });
      await writeFile(
        join(cfgRoot, "opencode", "orchestrator.json"),
        JSON.stringify({ autoSpawn: true, workers: ["coder"], profiles: [] }, null, 2)
      );

      await mkdir(join(dir, ".opencode"), { recursive: true });
      await writeFile(join(dir, ".opencode", "orchestrator.json"), JSON.stringify({ workers: [] }, null, 2));

      const { config } = await loadOrchestratorConfig({ directory: dir });
      expect(Array.isArray(config.spawn)).toBe(true);
      expect(config.spawn.length).toBe(0);
    } finally {
      process.env.XDG_CONFIG_HOME = prev;
    }
  });
});

describe("prompt helpers", () => {
  test("buildPromptParts attaches images from file path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-orch-attach-"));
    const imgPath = join(dir, "x.png");
    await writeFile(imgPath, Buffer.from([0, 1, 2, 3, 4]));

    const parts = await buildPromptParts({
      message: "hello",
      attachments: [{ type: "image", path: imgPath }],
      security: { allowedRoots: [dir] },
    });

    expect(parts[0]).toEqual({ type: "text", text: "hello" });
    expect(parts[1]?.type).toBe("file");
    expect((parts[1] as any).mime).toBe("image/png");
    expect(typeof (parts[1] as any).url).toBe("string");
  });

  test("extractTextFromPromptResponse reads nested text parts", () => {
    const { text } = extractTextFromPromptResponse({
      info: { id: "msg" },
      parts: [{ type: "text", text: "a" }, { type: "text", text: "b" }],
    });
    expect(text).toBe("ab");
  });

  test("extractTextFromPromptResponse returns debug for empty responses", () => {
    const out = extractTextFromPromptResponse({});
    expect(out.text).toBe("");
    expect(out.debug).toBe("no_parts");
  });
});
