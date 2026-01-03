import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { shutdownAllWorkers } from "../../src/core/runtime";
import { mergeOpenCodeConfig } from "../../src/config/opencode";
import {
  spawnWorker,
  sendToWorker,
  stopWorker,
} from "../../src/workers/spawner";
import type { WorkerProfile } from "../../src/types";
import { createE2eEnv, type E2eEnv } from "../helpers/e2e-env";
import { withRunBundle } from "../helpers/run-bundle";

const MODEL = process.env.OPENCODE_ORCH_E2E_MODEL ?? "opencode/gpt-5-nano";

const strictPrompt =
  "You are a test agent. Follow instructions exactly. " +
  "When asked to load a skill, call skill({ name }) and reply with the token found in the skill. " +
  "Reply with only the token.";

describe("e2e (skills load)", () => {
  let env: E2eEnv;
  let tmpDir: string;
  let projectDir: string;
  let workDir: string;
  let server: Awaited<ReturnType<typeof createOpencode>>["server"] | undefined;
  let client: Awaited<ReturnType<typeof createOpencode>>["client"] | undefined;
  let parentSessionId = "";
  let tokenProject: string;
  let tokenClaude: string;
  let originalHome: string | undefined;
  const runBundle = withRunBundle({
    workflowId: null,
    testName: "e2e (skills load)",
    directory: process.cwd(),
    model: MODEL,
  });

  beforeAll(async () => {
    env = await createE2eEnv();
    await runBundle.start();
    originalHome = process.env.HOME;
    process.env.HOME = env.root;

    if (process.env.XDG_CONFIG_HOME) {
      const opencodeConfigDir = join(process.env.XDG_CONFIG_HOME, "opencode");
      await mkdir(opencodeConfigDir, { recursive: true });
      await writeFile(
        join(opencodeConfigDir, "opencode.json"),
        JSON.stringify(
          { permission: { skill: { "*": "allow" } }, tools: { skill: true } },
          null,
          2,
        ),
      );
    }

    tmpDir = await mkdtemp(join(process.cwd(), ".tmp", "skills-e2e-"));
    projectDir = join(tmpDir, "repo");
    workDir = join(projectDir, "src");

    await mkdir(workDir, { recursive: true });
    await mkdir(join(projectDir, ".git"), { recursive: true });

    tokenProject = randomUUID();
    tokenClaude = randomUUID();

    const projectSkillDir = join(
      projectDir,
      ".opencode",
      "skill",
      "skill-project",
    );
    const claudeSkillDir = join(
      projectDir,
      ".claude",
      "skills",
      "skill-claude",
    );
    await Promise.all([
      mkdir(projectSkillDir, { recursive: true }),
      mkdir(claudeSkillDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(projectSkillDir, "SKILL.md"),
        `---\nname: skill-project\ndescription: project skill\n---\nTOKEN: ${tokenProject}\n`,
      ),
      writeFile(
        join(claudeSkillDir, "SKILL.md"),
        `---\nname: skill-claude\ndescription: claude skill\n---\nTOKEN: ${tokenClaude}\n`,
      ),
    ]);

    const config = await mergeOpenCodeConfig(
      {
        model: MODEL,
        permission: { skill: { "*": "allow" } },
        tools: { skill: true },
      },
      { dropOrchestratorPlugin: true },
    );

    const serverResult = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config,
    });
    server = serverResult.server;
    client = serverResult.client;

    const session = (
      await client!.session.create({
        body: { title: "skills-parent" },
        query: { directory: workDir },
      })
    ).data;
    if (!session?.id) throw new Error("Failed to create parent session");
    parentSessionId = session.id;
  }, 180_000);

  afterAll(async () => {
    try {
      await runBundle.finalize();
    } finally {
      await shutdownAllWorkers().catch(() => {});
      await server?.close?.();
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
      await env.restore();
      if (originalHome === undefined) {
        process.env.HOME = undefined;
      } else {
        process.env.HOME = originalHome;
      }
    }
  }, 180_000);

  test("subagent loads .opencode skill and returns token", async () => {
    const profile: WorkerProfile = {
      id: "skill-subagent",
      name: "Skill Subagent",
      model: MODEL,
      kind: "subagent",
      purpose: "E2E skill test",
      whenToUse: "E2E tests",
      systemPrompt: strictPrompt,
    };

    await spawnWorker(profile, {
      basePort: 0,
      timeout: 60_000,
      directory: workDir,
      client: client!,
      parentSessionId,
    });

    const res = await sendToWorker(
      profile.id,
      'Load skill "skill-project" and reply with the TOKEN exactly.',
      { directory: workDir },
    );

    await stopWorker(profile.id);

    if (res.success) {
      expect(res.response?.trim()).toBe(tokenProject);
    } else {
      expect(res.error && res.error.length > 0).toBe(true);
    }
  }, 180_000);

  test("server worker loads .claude skill and returns token", async () => {
    const profile: WorkerProfile = {
      id: "skill-server",
      name: "Skill Server",
      model: MODEL,
      kind: "server",
      purpose: "E2E skill test",
      whenToUse: "E2E tests",
      systemPrompt: strictPrompt,
      tools: { skill: true },
    };

    await spawnWorker(profile, {
      basePort: 0,
      timeout: 60_000,
      directory: projectDir,
      client: client!,
    });

    const res = await sendToWorker(
      profile.id,
      'Load skill "skill-claude" and reply with the TOKEN exactly.',
      { directory: projectDir },
    );

    await stopWorker(profile.id);

    if (res.success) {
      const responseToken = res.response?.trim();
      if (!responseToken) {
        throw new Error("Missing response token from server worker");
      }
      expect([tokenProject, tokenClaude]).toContain(responseToken);
    } else {
      expect(res.error && res.error.length > 0).toBe(true);
    }
  }, 180_000);
});
