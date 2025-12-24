import { afterAll, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const helperScript = join(__dirname, "..", "helpers", "orchestrator-parent.ts");

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("orphan watchdog", () => {
  const children: ChildProcess[] = [];

  afterAll(() => {
    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }
  });

  test(
    "workers exit when the orchestrator process disappears",
    async () => {
      const child = spawn("bun", [helperScript], { stdio: ["ignore", "pipe", "pipe"] });
      children.push(child);

      const workerPid = await new Promise<number>((resolve, reject) => {
        let buffer = "";
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for worker PID")), 30_000);

        child.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const match = buffer.match(/WORKER_PID:(\d+)/);
          if (match) {
            clearTimeout(timeout);
            resolve(Number(match[1]));
          }
        });

        child.once("exit", (code, signal) => {
          clearTimeout(timeout);
          reject(new Error(`Helper exited early (code=${code}, signal=${signal})`));
        });
        child.once("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(Number.isFinite(workerPid)).toBe(true);
      expect(isProcessAlive(workerPid)).toBe(true);

      // Simulate a hard orchestrator stop (no graceful shutdown handlers).
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && isProcessAlive(workerPid)) {
        await sleep(500);
      }

      expect(isProcessAlive(workerPid)).toBe(false);
    },
    120_000
  );
});
