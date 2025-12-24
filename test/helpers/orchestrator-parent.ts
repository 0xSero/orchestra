import { ensureRuntime } from "../../src/core/runtime";
import { spawnWorker } from "../../src/workers/spawner";
import type { WorkerProfile } from "../../src/types";

const workerId = process.env.ORPHAN_WORKER_ID || `orphan-watchdog-${process.pid}`;

const profile: WorkerProfile = {
  id: workerId,
  name: "Orphan Watchdog",
  model: "opencode/gpt-5-nano",
  purpose: "Cleanup watchdog integration test",
  whenToUse: "tests",
};

async function main(): Promise<void> {
  await ensureRuntime();
  const instance = await spawnWorker(profile, { basePort: 0, timeout: 60_000, directory: process.cwd() });
  if (typeof instance.pid === "number") {
    console.log(`WORKER_ID:${workerId}`);
    console.log(`WORKER_PID:${instance.pid}`);
  } else {
    console.error("WORKER_PID_MISSING");
  }

  // Keep the process alive until the test terminates it.
  setInterval(() => {}, 1_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
