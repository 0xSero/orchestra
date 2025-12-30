import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const desktopArg = process.argv.includes("--desktop");
const shouldStartDesktop =
  desktopArg || ["1", "true", "yes"].includes(String(process.env.DESKTOP || "").toLowerCase());

const processes = [];
let shuttingDown = false;

const run = (label, command, args, cwd) => {
  const child = spawn(command, args, {
    cwd: path.resolve(root, cwd),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      console.error(`[dev] ${label} exited with code ${code}`);
      shutdown(code);
    }
  });

  processes.push(child);
};

const shutdown = (code = 0) => {
  shuttingDown = true;
  for (const child of processes) {
    child.kill("SIGINT");
  }
  process.exit(code);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("orchestrator", "bun", ["run", "build:watch"], "packages/orchestrator");
run("control-panel", "bun", ["run", "dev"], "apps/control-panel");

if (shouldStartDesktop) {
  run("desktop", "bun", ["run", "tauri", "dev"], "apps/desktop");
} else {
  console.log("[dev] Desktop not started. Run with DESKTOP=1 or --desktop to launch Tauri.");
}
