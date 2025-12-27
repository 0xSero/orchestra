import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { mergeOpenCodeConfig } from "../src/config/opencode";
import { extractTextFromPromptResponse } from "../src/workers/prompt";
import { setupE2eEnv } from "./helpers/e2e-env";

describe("e2e", () => {
  let restoreEnv: (() => void) | undefined;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
  });

  afterAll(() => {
    restoreEnv?.();
  });

  test("can prompt a spawned opencode server and get text", async () => {
    const model = "opencode/gpt-5-nano";

    const config = await mergeOpenCodeConfig({ model }, { dropOrchestratorPlugin: true });
    const { client, server } = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config,
    });

    try {
      const session = (await client.session.create({ body: { title: "e2e" }, query: { directory: process.cwd() } }))
        .data;
      expect(session?.id).toBeTruthy();

      const res = await client.session.prompt({
        path: { id: session!.id },
        body: { parts: [{ type: "text", text: "Reply with exactly: pong" }] as any },
        query: { directory: process.cwd() },
      });

      const extracted = extractTextFromPromptResponse(res.data);
      expect(extracted.text.toLowerCase()).toContain("pong");
    } finally {
      server.close();
    }
  }, 180_000);
});
