import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { mergeOpenCodeConfig } from "../../config/opencode";
import { getUserConfigDir } from "../../helpers/format";

const findPackageRoot = (startDir: string): string => {
  let current = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(current, "package.json"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return startDir;
};

const moduleDir = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = findPackageRoot(moduleDir);

export function resolveWorkerBridgePluginSpecifier(): string | undefined {
  const configPluginPath = join(
    getUserConfigDir(),
    "opencode",
    "plugin",
    "worker-bridge-plugin.mjs",
  );
  // OpenCode treats `file://...` as a local plugin. A plain absolute path can be misinterpreted
  // as a package specifier and trigger a Bun install attempt.
  if (existsSync(configPluginPath)) return pathToFileURL(configPluginPath).href;

  const candidates = [
    resolve(packageRoot, "bin", "worker-bridge-plugin.mjs"),
    resolve(packageRoot, "dist", "worker-bridge-plugin.mjs"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return pathToFileURL(path).href;
  }
  return undefined;
}

export async function spawnOpencodeServe(options: {
  hostname: string;
  port: number;
  timeout: number;
  config: Record<string, unknown>;
  env: Record<string, string | undefined>;
}): Promise<{ url: string; proc: ChildProcess; close: () => Promise<void> }> {
  const mergedConfig = await mergeOpenCodeConfig(options.config ?? {}, {
    dropOrchestratorPlugin: true,
    excludeAgentConfigs: true,
  });
  // CRITICAL: Mark this as a worker process to prevent recursive spawning.
  // Workers should NOT load the orchestrator plugin or spawn more workers.
  const workerEnv = {
    ...process.env,
    ...options.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(
      mergedConfig ?? options.config ?? {},
    ),
    OPENCODE_ORCHESTRATOR_WORKER: "1", // Signal that this is a worker, not the orchestrator
  };

  const proc = spawn(
    "opencode",
    ["serve", `--hostname=${options.hostname}`, `--port=${options.port}`],
    {
      env: workerEnv as any,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for server to start after ${options.timeout}ms`,
          ),
        ),
      options.timeout,
    );
    let output = "";

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.startsWith("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (!match) continue;
          clearTimeout(id);
          cleanup();
          resolve(match[1]);
          return;
        }
      }
    };

    const onExit = (code: number | null) => {
      clearTimeout(id);
      cleanup();
      let msg = `Server exited with code ${code}`;
      if (output.trim()) msg += `\nServer output: ${output}`;
      reject(new Error(msg));
    };

    const onError = (err: Error) => {
      clearTimeout(id);
      cleanup();
      reject(err);
    };

    // Discard handler to consume but ignore output after startup
    const discard = () => {};

    const cleanup = () => {
      proc.stdout.off("data", onData);
      proc.stderr.off("data", onData);
      proc.off("exit", onExit);
      proc.off("error", onError);
      // Keep consuming output to prevent it from leaking to parent stdout/stderr
      proc.stdout.on("data", discard);
      proc.stderr.on("data", discard);
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", onExit);
    proc.on("error", onError);
  });

  const close = async () => {
    if (proc.killed) return;
    try {
      // If detached, kill the whole process group (covers grand-children).
      if (process.platform !== "win32" && typeof proc.pid === "number") {
        process.kill(-proc.pid, "SIGTERM");
      } else {
        proc.kill("SIGTERM");
      }
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          if (process.platform !== "win32" && typeof proc.pid === "number") {
            process.kill(-proc.pid, "SIGKILL");
          } else {
            proc.kill("SIGKILL");
          }
        } catch {
          // ignore
        }
        resolve();
      }, 2000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  return { url, proc, close };
}
