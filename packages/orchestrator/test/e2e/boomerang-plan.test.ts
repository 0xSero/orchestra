import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mergeOpenCodeConfig } from "../../src/config/opencode";
import { taskAwait, taskStart } from "../../src/command/tasks";
import {
  getClient,
  getDirectory,
  getProfiles,
  getSecurityConfig,
  getSpawnDefaults,
  getWorkflowsConfig,
  setClient,
  setDirectory,
  setProfiles,
  setSecurityConfig,
  setSpawnDefaults,
  setWorkflowConfig,
} from "../../src/command/state";
import { shutdownAllWorkers } from "../../src/core/runtime";
import type { WorkerProfile } from "../../src/types";
import { loadWorkflows } from "../../src/workflows";
import { createE2eEnv, type E2eEnv } from "../helpers/e2e-env";
import { withRunBundle } from "../helpers/run-bundle";

const MODEL = process.env.OPENCODE_ORCH_E2E_MODEL ?? "opencode/gpt-5-nano";

const fixtureDir = join(process.cwd(), "test/fixtures/boomerang-site");

const copyDir = async (source: string, target: string) => {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const srcPath = join(source, entry.name);
    const dstPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, dstPath);
    }
  }
};

const profiles: Record<string, WorkerProfile> = {
  coder: {
    id: "coder",
    name: "Coder",
    model: MODEL,
    purpose: "Runs boomerang plan tasks",
    whenToUse: "Planning tasks and file generation",
  },
};

describe("e2e (boomerang plan)", () => {
  let env: E2eEnv;
  let workDir = "";
  let server: Awaited<ReturnType<typeof createOpencode>>["server"] | undefined;
  let runBundle: ReturnType<typeof withRunBundle> | undefined;
  const originalDirectory = getDirectory();
  const originalProfiles = getProfiles();
  const originalSecurity = getSecurityConfig();
  const originalSpawn = getSpawnDefaults();
  const originalWorkflows = getWorkflowsConfig();
  const originalClient = getClient();

  beforeAll(async () => {
    env = await createE2eEnv();
    workDir = await env.fixtures.createTempDir();
    await copyDir(fixtureDir, workDir);

    const config = await mergeOpenCodeConfig(
      { model: MODEL },
      { dropOrchestratorPlugin: true },
    );
    const opencode = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config: config as any,
    });
    server = opencode.server;

    setDirectory(workDir);
    setSpawnDefaults({ basePort: 0, timeout: 60_000 });
    setProfiles(profiles);
    setWorkflowConfig({
      enabled: true,
      boomerang: { plannerModel: MODEL, implementerModel: MODEL },
    });
    setSecurityConfig({
      ...(originalSecurity ?? {}),
      workflows: {
        ...(originalSecurity?.workflows ?? {}),
        perStepTimeoutMs: 240_000,
      },
    });
    loadWorkflows({
      basePort: 0,
      profiles,
      spawn: [],
      autoSpawn: false,
      startupTimeout: 0,
      healthCheckInterval: 0,
      workflows: {
        enabled: true,
        boomerang: { plannerModel: MODEL, implementerModel: MODEL },
      },
    });
    setClient(opencode.client as any);

    runBundle = withRunBundle({
      workflowId: "boomerang-plan",
      testName: "e2e (boomerang plan)",
      directory: workDir,
      model: MODEL,
    });
    await runBundle.start();
  }, 180_000);

  afterAll(async () => {
    try {
      if (runBundle) {
        await runBundle.finalize();
        const recorder = runBundle.getRecorder();
        if (recorder) {
          const summary = JSON.parse(
            await readFile(join(recorder.runDir, "summary.json"), "utf8"),
          );
          expect(summary.workflowId).toBe("boomerang-plan");
          expect(summary.workers.total).toBeGreaterThan(0);
          const workerSummaries = Object.values(summary.workers.byId ?? {});
          const hasToolParts = workerSummaries.some(
            (worker: any) => (worker?.parts?.byType?.tool ?? 0) > 0,
          );
          expect(hasToolParts).toBe(true);
        }
      }
    } finally {
      await shutdownAllWorkers().catch(() => {});
      await server?.close?.();
      await env.restore();
      setDirectory(originalDirectory);
      setProfiles(originalProfiles);
      setSpawnDefaults(originalSpawn);
      setSecurityConfig(originalSecurity);
      setWorkflowConfig(originalWorkflows);
      if (originalClient) {
        setClient(originalClient);
      } else {
        setClient(undefined as any);
      }
    }
  }, 180_000);

  test("runs boomerang-plan and writes planning artifacts", async () => {
    const ctx = { agent: "test", sessionID: "session", messageID: "msg" };
    const started = await taskStart.execute(
      {
        kind: "workflow",
        workflowId: "boomerang-plan",
        task:
          "Target directory: .\n" +
          "Goal: Generate scope.md, rules.md, and a full task queue for this fixture.",
        autoSpawn: true,
      } as any,
      ctx as any,
    );
    const { taskId } = JSON.parse(String(started));
    expect(typeof taskId).toBe("string");

    const jobJson = await taskAwait.execute(
      { taskId, timeoutMs: 240_000 } as any,
      ctx as any,
    );
    const job = JSON.parse(String(jobJson));
    expect(job.id).toBe(taskId);
    expect(job.status).toBe("succeeded");

    const scopePath = join(workDir, "scope.md");
    const rulesPath = join(workDir, "rules.md");
    const tasksDir = join(workDir, "tasks");
    expect(existsSync(scopePath)).toBe(true);
    expect(existsSync(rulesPath)).toBe(true);
    expect(existsSync(tasksDir)).toBe(true);

    const [scopeContent, rulesContent] = await Promise.all([
      readFile(scopePath, "utf8"),
      readFile(rulesPath, "utf8"),
    ]);
    expect(scopeContent.trim().length).toBeGreaterThan(0);
    expect(rulesContent.trim().length).toBeGreaterThan(0);

    const taskFiles = (await readdir(tasksDir)).filter((name) =>
      /^task-\d+\.md$/.test(name),
    );
    expect(taskFiles).toContain("task-00.md");
    expect(taskFiles.length).toBeGreaterThan(1);
  }, 300_000);
});
