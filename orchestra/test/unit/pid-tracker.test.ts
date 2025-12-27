import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearPidTracking,
  cleanupStaleWorkers,
  getTrackedWorkers,
  killAllTrackedWorkers,
  killProcessOnPort,
  trackWorkerPid,
  untrackWorkerPid,
} from "../../src/workers/pid-tracker";

type EnvSnapshot = { HOME?: string; USERPROFILE?: string };

const snapshotEnv = (): EnvSnapshot => ({
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
});

const restoreEnv = (snapshot: EnvSnapshot) => {
  if (snapshot.HOME === undefined) delete process.env.HOME;
  else process.env.HOME = snapshot.HOME;
  if (snapshot.USERPROFILE === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = snapshot.USERPROFILE;
};

const setupHome = async () => {
  const snapshot = snapshotEnv();
  const home = await mkdtemp(join(tmpdir(), "orch-pid-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return { home, snapshot };
};

const writeStore = async (home: string, entries: Array<Record<string, unknown>>) => {
  const dir = join(home, ".opencode");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "worker-pids.json");
  await writeFile(path, JSON.stringify({ entries, updatedAt: Date.now() }, null, 2));
  return path;
};

describe("pid tracker", () => {
  test("tracks, untracks, and clears worker pids", async () => {
    const { home, snapshot } = await setupHome();

    try {
      const deps = { platform: "linux" };
      await trackWorkerPid({ pid: 111, workerId: "alpha", port: 3000, deps });
      await trackWorkerPid({ pid: 222, workerId: "alpha", deps });

      let tracked = await getTrackedWorkers(deps);
      expect(tracked.length).toBe(1);
      expect(tracked[0]?.pid).toBe(222);

      await untrackWorkerPid("alpha", deps);
      tracked = await getTrackedWorkers(deps);
      expect(tracked.length).toBe(0);

      await clearPidTracking(deps);
      tracked = await getTrackedWorkers(deps);
      expect(tracked.length).toBe(0);

      const pidFile = join(home, ".opencode", "worker-pids.json");
      await mkdir(join(home, ".opencode"), { recursive: true });
      await writeFile(pidFile, JSON.stringify({ entries: "bad", updatedAt: Date.now() }), "utf8");
      tracked = await getTrackedWorkers(deps);
      expect(tracked.length).toBe(0);

      await writeFile(pidFile, "{ bad", "utf8");
      tracked = await getTrackedWorkers(deps);
      expect(tracked.length).toBe(0);
    } finally {
      restoreEnv(snapshot);
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("resolves home dir from USERPROFILE on win32", async () => {
    const snapshot = snapshotEnv();
    const home = await mkdtemp(join(tmpdir(), "orch-pid-win-"));
    process.env.USERPROFILE = home;
    process.env.HOME = "/ignored";

    try {
      const deps = { platform: "win32", homedir: () => "/fallback" };
      await trackWorkerPid({ pid: 101, workerId: "win", deps });

      const tracked = await getTrackedWorkers(deps);
      expect(tracked[0]?.workerId).toBe("win");

      const pidFile = join(home, ".opencode", "worker-pids.json");
      expect(await Bun.file(pidFile).exists()).toBe(true);
    } finally {
      restoreEnv(snapshot);
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("cleans up stale entries and honors dry run", async () => {
    const { home, snapshot } = await setupHome();
    const now = Date.now();

    const deps = {
      platform: "linux",
      execSync: (command: string) => {
        if (command.includes(":1234")) return "1234\n";
        if (command.includes(":4321")) return "4321\n";
        if (command.includes(":9999")) throw new Error("exec fail");
        return "";
      },
    };

    const originalKill = process.kill;
    process.kill = ((pid: number, signal?: number | string) => {
      if (signal === 0) {
        if (pid === 9999 || pid === 111) throw new Error("dead");
        return undefined as never;
      }
      return undefined as never;
    }) as typeof process.kill;

    try {
      await writeStore(home, [
        {
          pid: 111,
          workerId: "dead",
          createdAt: now - 26 * 60 * 60 * 1000,
          parentPid: 9999,
        },
        {
          pid: 222,
          workerId: "stale",
          port: 1234,
          createdAt: now - 26 * 60 * 60 * 1000,
          parentPid: process.pid,
        },
        {
          pid: 333,
          workerId: "alive",
          port: 4321,
          createdAt: now,
          parentPid: process.pid,
        },
        {
          pid: 444,
          workerId: "error-port",
          port: 9999,
          createdAt: now,
          parentPid: process.pid,
        },
      ]);

      const dryRun = await cleanupStaleWorkers({ maxAgeMs: 1000, dryRun: true, deps });
      expect(dryRun.removed.length).toBeGreaterThan(0);
      expect((await getTrackedWorkers(deps)).length).toBe(4);

      const cleaned = await cleanupStaleWorkers({ maxAgeMs: 1000, deps });
      expect(cleaned.removed).toEqual(["dead", "stale"]);
      const remaining = await getTrackedWorkers(deps);
      expect(remaining.map((e) => e.workerId).sort()).toEqual(["alive", "error-port"]);
    } finally {
      process.kill = originalKill;
      restoreEnv(snapshot);
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("kills tracked workers and ports on unix", async () => {
    const { home, snapshot } = await setupHome();
    const now = Date.now();

    const deps = {
      platform: "linux",
      execSync: () => "111\n222\n",
    };

    const originalKill = process.kill;
    const originalSetTimeout = globalThis.setTimeout;
    const killCalls: Array<{ pid: number; signal?: number | string }> = [];
    const aliveChecks = new Map<number, number>();

    process.kill = ((pid: number, signal?: number | string) => {
      killCalls.push({ pid, signal });
      if (signal === 0) {
        const next = (aliveChecks.get(pid) ?? 0) + 1;
        aliveChecks.set(pid, next);
        if ((pid === 111 && next >= 2) || pid === 999) throw new Error("dead");
        return undefined as never;
      }
      if (signal === "SIGTERM" && pid === 333) {
        throw new Error("denied");
      }
      return undefined as never;
    }) as typeof process.kill;

    globalThis.setTimeout = ((handler: (...args: unknown[]) => void) => {
      handler();
      return 0 as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      await writeStore(home, [
        { pid: 111, workerId: "fast", createdAt: now, parentPid: process.pid },
        { pid: 222, workerId: "slow", createdAt: now, parentPid: process.pid },
        { pid: 333, workerId: "fail", createdAt: now, parentPid: process.pid },
        { pid: 999, workerId: "dead", createdAt: now, parentPid: process.pid },
      ]);

      const killed = await killAllTrackedWorkers(deps);
      expect(killed).toEqual(["fast", "slow", "fail"]);

      const portKilled = await killProcessOnPort(8080, deps);
      expect(portKilled).toBe(true);
      expect(killCalls.some((call) => call.signal === "SIGKILL")).toBe(true);
    } finally {
      process.kill = originalKill;
      globalThis.setTimeout = originalSetTimeout;
      restoreEnv(snapshot);
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("kills processes on port for windows", async () => {
    const { home, snapshot } = await setupHome();

    const deps = {
      platform: "win32",
      execSync: () =>
        "TCP 0.0.0.0:1234 0.0.0.0:0 LISTENING 555\nTCP 0.0.0.0:1234 0.0.0.0:0 LISTENING 666",
    };

    const originalKill = process.kill;
    const originalSetTimeout = globalThis.setTimeout;
    process.kill = (() => undefined) as typeof process.kill;
    globalThis.setTimeout = ((handler: (...args: unknown[]) => void) => {
      handler();
      return 0 as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      await writeStore(home, [
        { pid: 555, workerId: "win", port: 1234, createdAt: Date.now(), parentPid: process.pid },
      ]);
      const dryRun = await cleanupStaleWorkers({ maxAgeMs: 1000, dryRun: true, deps });
      expect(dryRun.removed.length).toBe(0);

      const killed = await killProcessOnPort(1234, deps);
      expect(killed).toBe(true);
    } finally {
      process.kill = originalKill;
      globalThis.setTimeout = originalSetTimeout;
      restoreEnv(snapshot);
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("covers unix cleanup branches and killProcessOnPort fallbacks", async () => {
    const { home, snapshot } = await setupHome();
    const now = Date.now();

    const deps = {
      platform: "linux",
      execSync: (command: string) => {
        if (command.includes(":7777")) return "111\n";
        if (command.includes(":8888")) return "";
        if (command.includes(":5555")) return "555\n";
        if (command.includes(":9999")) throw new Error("exec fail");
        return "";
      },
    };

    const originalKill = process.kill;
    const originalSetTimeout = globalThis.setTimeout;
    const alive = new Set<number>([222, 333, process.pid]);
    const killCalls: Array<{ pid: number; signal?: number | string }> = [];

    process.kill = ((pid: number, signal?: number | string) => {
      killCalls.push({ pid, signal });
      if (signal === 0) {
        if (!alive.has(pid)) throw new Error("dead");
        return undefined as never;
      }
      if (signal === "SIGTERM") {
        if (pid === 555) throw new Error("denied");
        alive.delete(pid);
        return undefined as never;
      }
      if (signal === "SIGKILL") {
        alive.delete(pid);
        return undefined as never;
      }
      return undefined as never;
    }) as typeof process.kill;

    globalThis.setTimeout = ((handler: (...args: unknown[]) => void) => {
      handler();
      return 0 as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      await writeStore(home, [
        {
          pid: 1,
          workerId: "port-zero",
          port: 0,
          createdAt: now - 5000,
          parentPid: process.pid,
        },
        {
          pid: 222,
          workerId: "kept",
          port: 7777,
          createdAt: now,
          parentPid: process.pid,
        },
        {
          pid: 333,
          workerId: "orphan",
          port: 8888,
          createdAt: now,
          parentPid: 99999,
        },
        {
          pid: 444,
          workerId: "no-port",
          createdAt: now - 5000,
          parentPid: process.pid,
        },
        {
          pid: 555,
          workerId: "error-port",
          port: 9999,
          createdAt: now,
          parentPid: process.pid,
        },
      ]);

      const cleaned = await cleanupStaleWorkers({ maxAgeMs: 1000, deps });
      expect(cleaned.removed).toContain("port-zero");
      expect(cleaned.removed).toContain("orphan");
      expect(cleaned.removed).toContain("no-port");
      expect(cleaned.removed).toContain("error-port");

      const remaining = await getTrackedWorkers(deps);
      expect(remaining.map((entry) => entry.workerId)).toEqual(["kept"]);

      await killProcessOnPort(5555, deps);
      expect(killCalls.some((call) => call.pid === 555 && call.signal === "SIGTERM")).toBe(true);

      const killFailed = await killProcessOnPort(9999, deps);
      expect(killFailed).toBe(false);
    } finally {
      process.kill = originalKill;
      globalThis.setTimeout = originalSetTimeout;
      restoreEnv(snapshot);
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  });
});
