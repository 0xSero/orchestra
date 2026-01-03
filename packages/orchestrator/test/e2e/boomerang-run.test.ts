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

const parseQueueIndex = (name: string) => {
  const match = name.match(/^task-(\d+)\.md$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1] ?? 0);
};

const profiles: Record<string, WorkerProfile> = {
  coder: {
    id: "coder",
    name: "Coder",
    model: MODEL,
    purpose: "Executes boomerang queue tasks",
    whenToUse: "Planning and implementation tasks",
  },
};

describe("e2e (boomerang run)", () => {
  let env: E2eEnv;
  let workDir = "";
  let server: Awaited<ReturnType<typeof createOpencode>>["server"] | undefined;
  let planBundle: ReturnType<typeof withRunBundle> | undefined;
  let runBundle: ReturnType<typeof withRunBundle> | undefined;
  let planFinalized = false;
  let runFinalized = false;
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
  }, 180_000);

  afterAll(async () => {
    try {
      if (planBundle && !planFinalized) await planBundle.finalize();
      if (runBundle && !runFinalized) await runBundle.finalize();
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

  test("plans and drains the queue to build the fixture", async () => {
    const ctx = { agent: "test", sessionID: "session", messageID: "msg" };

    planBundle = withRunBundle({
      workflowId: "boomerang-plan",
      testName: "e2e (boomerang run) - plan",
      directory: workDir,
      model: MODEL,
    });
    await planBundle.start();

    const planStarted = await taskStart.execute(
      {
        kind: "workflow",
        workflowId: "boomerang-plan",
        task:
          "Target directory: .\n" +
          "Goal: Generate scope.md, rules.md, and a full task queue that updates this fixture and runs bun run build to produce dist/ output.",
        autoSpawn: true,
      } as any,
      ctx as any,
    );
    const { taskId: planTaskId } = JSON.parse(String(planStarted));
    const planJobJson = await taskAwait.execute(
      { taskId: planTaskId, timeoutMs: 300_000 } as any,
      ctx as any,
    );
    const planJob = JSON.parse(String(planJobJson));
    expect(planJob.status).toBe("succeeded");

    await planBundle.finalize();
    planFinalized = true;

    const tasksDir = join(workDir, "tasks");
    const taskFiles = (await readdir(tasksDir))
      .filter((name) => /^task-\d+\.md$/.test(name))
      .sort((a, b) => parseQueueIndex(a) - parseQueueIndex(b));
    expect(taskFiles.length).toBeGreaterThanOrEqual(3);

    const planRecorder = planBundle.getRecorder();
    if (planRecorder) {
      const planSummary = JSON.parse(
        await readFile(join(planRecorder.runDir, "summary.json"), "utf8"),
      );
      expect(planSummary.workflowId).toBe("boomerang-plan");
      expect(planSummary.events.total).toBeGreaterThan(0);
      expect(planSummary.workers.total).toBeGreaterThan(0);
      const workerSummaries = Object.values(planSummary.workers.byId ?? {});
      const hasToolParts = workerSummaries.some(
        (worker: any) => (worker?.parts?.byType?.tool ?? 0) > 0,
      );
      expect(hasToolParts).toBe(true);
    }

    runBundle = withRunBundle({
      workflowId: "boomerang-run",
      testName: "e2e (boomerang run) - run",
      directory: workDir,
      model: MODEL,
    });
    await runBundle.start();

    const runStarted = await taskStart.execute(
      {
        kind: "workflow",
        workflowId: "boomerang-run",
        task: "Execute tasks/ in order until the queue is drained.",
        autoSpawn: true,
      } as any,
      ctx as any,
    );
    const { taskId: runTaskId } = JSON.parse(String(runStarted));
    const runJobJson = await taskAwait.execute(
      { taskId: runTaskId, timeoutMs: 420_000 } as any,
      ctx as any,
    );
    const runJob = JSON.parse(String(runJobJson));
    expect(runJob.status).toBe("succeeded");
    expect(typeof runJob.report?.details).toBe("string");

    const details = JSON.parse(String(runJob.report?.details));
    const steps = Array.isArray(details.steps) ? details.steps : [];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.map((step: any) => step.id)).toEqual(
      taskFiles.map((name) => name.replace(/\.md$/, "")),
    );

    const distDir = join(workDir, "dist");
    expect(existsSync(join(distDir, "index.html"))).toBe(true);
    expect(existsSync(join(distDir, "styles.css"))).toBe(true);
    expect(existsSync(join(distDir, "app.js"))).toBe(true);

    await runBundle.finalize();
    runFinalized = true;

    const runRecorder = runBundle.getRecorder();
    if (runRecorder) {
      const runSummary = JSON.parse(
        await readFile(join(runRecorder.runDir, "summary.json"), "utf8"),
      );
      expect(runSummary.workflowId).toBe("boomerang-run");
      expect(runSummary.events.total).toBeGreaterThan(0);
      expect(runSummary.workers.total).toBeGreaterThan(0);
      const workerSummaries = Object.values(runSummary.workers.byId ?? {});
      const hasToolParts = workerSummaries.some(
        (worker: any) => (worker?.parts?.byType?.tool ?? 0) > 0,
      );
      expect(hasToolParts).toBe(true);
    }

    if (!process.env.OPENCODE_ORCH_E2E_MODEL) {
      const planRecorder = planBundle.getRecorder();
      if (planRecorder) {
        const planMeta = JSON.parse(
          await readFile(join(planRecorder.runDir, "meta.json"), "utf8"),
        );
        expect(planMeta.model).toBe("opencode/gpt-5-nano");
      }
      const runRecorder = runBundle.getRecorder();
      if (runRecorder) {
        const runMeta = JSON.parse(
          await readFile(join(runRecorder.runDir, "meta.json"), "utf8"),
        );
        expect(runMeta.model).toBe("opencode/gpt-5-nano");
      }
    }
  }, 600_000);
});
