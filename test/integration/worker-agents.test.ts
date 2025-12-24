import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeOpenCodeConfig } from "../../src/config/opencode";
import { enableWorkerAgent, disableWorkerAgent, listWorkerAgents } from "../../src/tools/tools-agents";
import { setClient, setDirectory, setProfiles, setModelAliases, setModelSelection } from "../../src/tools/state";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";
import { extractTextFromPromptResponse } from "../../src/workers/prompt";

describe("worker agent integration", () => {
  let restoreEnv: (() => void) | undefined;
  let server: { close: () => void } | undefined;
  let client: any;
  let directory: string;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    directory = await mkdtemp(join(tmpdir(), "orch-agent-"));
    const config = await mergeOpenCodeConfig({ model: "opencode/gpt-5-nano" }, { dropOrchestratorPlugin: true });
    const opencode = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config,
    });
    client = opencode.client;
    server = opencode.server;

    setClient(client);
    setDirectory(directory);
    setModelSelection(undefined);
    setModelAliases(undefined);

    const profile: WorkerProfile = {
      id: "reviewer",
      name: "Reviewer",
      model: "opencode/gpt-5-nano",
      purpose: "Review",
      whenToUse: "tests",
    };
    setProfiles({ reviewer: profile });
  }, 120_000);

  afterAll(() => {
    server?.close();
    restoreEnv?.();
  });

  test("enable/disable worker agent updates config", async () => {
    const agentId = "worker-reviewer";
    const enableRes = await enableWorkerAgent.execute({ workerId: "reviewer", agentId } as any, {} as any);
    expect(String(enableRes)).toContain(agentId);

    const agentFile = join(directory, ".opencode", "agent", `${agentId}.md`);
    expect(existsSync(agentFile)).toBe(true);

    const listAfterEnable = await listWorkerAgents.execute({ format: "json" } as any, {} as any);
    expect(String(listAfterEnable)).toContain(agentId);

    const session = await client.session.create({ body: { title: "agent" }, query: { directory } });
    const sessionId = session.data?.id;
    expect(sessionId).toBeTruthy();

    const promptRes = await client.session.prompt({
      path: { id: sessionId },
      query: { directory },
      body: { agent: agentId, parts: [{ type: "text", text: "Reply with exactly: pong" }] },
    });
    const extracted = extractTextFromPromptResponse(promptRes.data);
    expect(extracted.text.toLowerCase()).toContain("pong");

    const disableRes = await disableWorkerAgent.execute({ agentId } as any, {} as any);
    expect(String(disableRes)).toContain(agentId);

    expect(existsSync(agentFile)).toBe(false);
    const listAfterDisable = await listWorkerAgents.execute({ format: "json" } as any, {} as any);
    expect(String(listAfterDisable)).not.toContain(agentId);
  }, 120_000);
});
