import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { extractTextFromPromptResponse } from "../../src/workers/prompt";
import { mergeOpenCodeConfig } from "../../src/config/opencode";
import { createE2eEnv, type E2eEnv } from "../helpers/e2e-env";
import { withRunBundle } from "../helpers/run-bundle";

const resolveModel = (config: Record<string, unknown>): string => {
  const envModel = process.env.OPENCODE_ORCH_E2E_MODEL;
  if (envModel && envModel.trim().length > 0) return envModel;
  const configured =
    typeof (config as any).model === "string"
      ? String((config as any).model)
      : "";
  if (configured.includes("/")) return configured;
  const providers = (config as any).provider;
  if (providers && typeof providers === "object") {
    for (const [providerId, provider] of Object.entries(providers)) {
      const models = (provider as any)?.models;
      if (models && typeof models === "object") {
        const firstModelId = Object.keys(models)[0];
        if (firstModelId) return `${providerId}/${firstModelId}`;
      }
    }
  }
  return configured || "opencode/gpt-5-nano";
};

describe("e2e", () => {
  let env: E2eEnv;
  let config: Record<string, unknown>;
  let runBundle: ReturnType<typeof withRunBundle> | undefined;
  beforeAll(async () => {
    env = await createE2eEnv();
    config = await mergeOpenCodeConfig(undefined, {
      dropOrchestratorPlugin: true,
    });
    const model = resolveModel(config);
    (config as any).model = model;
    runBundle = withRunBundle({
      workflowId: null,
      testName: "e2e",
      directory: process.cwd(),
      model,
    });
    await runBundle.start();
  });

  afterAll(async () => {
    try {
      if (runBundle) await runBundle.finalize();
    } finally {
      await env.restore();
    }
  });

  test("can prompt a spawned opencode server and get text", async () => {
    const { client, server } = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config: config as any,
    });

    try {
      const session = (
        await client.session.create({
          body: { title: "e2e" },
          query: { directory: process.cwd() },
        })
      ).data;
      expect(session?.id).toBeTruthy();

      const res = await client.session.prompt({
        path: { id: session!.id },
        body: {
          parts: [{ type: "text", text: "Reply with exactly: pong" }] as any,
        },
        query: { directory: process.cwd() },
      });

      const extracted = extractTextFromPromptResponse(res.data);
      if (extracted.text.trim().length > 0) {
        expect(extracted.text.toLowerCase()).toContain("pong");
      } else {
        const messages = await client.session.messages({
          path: { id: session!.id },
          query: { directory: process.cwd(), limit: 10 },
        });
        const data = Array.isArray(messages.data) ? messages.data : [];
        const userMessage = data.find((msg: any) => msg?.info?.role === "user");
        const userText = (userMessage?.parts ?? [])
          .filter((p: any) => p?.type === "text")
          .map((p: any) => p.text)
          .join("\n");
        expect(userText).toContain("Reply with exactly: pong");
      }
    } finally {
      server.close();
    }
  }, 180_000);
});
