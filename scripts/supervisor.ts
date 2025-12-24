#!/usr/bin/env bun
import { startSupervisor } from "../src/supervisor/server";

const port = (() => {
  const raw = process.env.OPENCODE_ORCH_SUPERVISOR_PORT;
  const n = raw ? Number(raw) : undefined;
  return Number.isFinite(n) && n > 0 ? n : 43145;
})();

void startSupervisor({ port }).catch((err) => {
  console.error("[supervisor] failed to start:", err);
  process.exit(1);
});
