import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute, join, relative, resolve } from "node:path";
import { mergeOpenCodeConfig } from "../../config/opencode";
import { getUserConfigDir } from "../../helpers/format";
import type { WorkerDockerConfig } from "../../types";

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

export function resolveBundledWorkerBridgePluginSpecifier():
  | string
  | undefined {
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
  directory: string;
}): Promise<{ url: string; proc: ChildProcess; close: () => Promise<void> }> {
  const mergedConfig = await mergeOpenCodeConfig(options.config ?? {}, {
    dropOrchestratorPlugin: true,
    excludeAgentConfigs: true,
    directory: options.directory,
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

function sanitizeDockerName(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return sanitized.length > 0 ? sanitized.slice(0, 128) : "opencode-worker";
}

function resolveMountPaths(
  directory: string,
  docker: WorkerDockerConfig,
): { source: string; target: string; directory: string; readOnly: boolean } {
  const source = docker.mount?.source ?? directory;
  const target = docker.mount?.target ?? source;
  const readOnly = docker.mount?.readOnly === true;

  const sourceResolved = resolve(source);
  const directoryResolved = resolve(directory);
  const rel = relative(sourceResolved, directoryResolved);
  const within = rel && !rel.startsWith("..") && !isAbsolute(rel);
  const mappedDirectory = within ? join(target, rel) : target;
  return {
    source: sourceResolved,
    target,
    directory: mappedDirectory,
    readOnly,
  };
}

function rewriteFileUrlToMount(
  fileUrl: string,
  source: string,
  target: string,
): string {
  if (!fileUrl.startsWith("file://")) return fileUrl;
  try {
    const hostPath = fileURLToPath(fileUrl);
    const sourceResolved = resolve(source);
    const hostResolved = resolve(hostPath);
    const rel = relative(sourceResolved, hostResolved);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return fileUrl;
    const containerPath = join(target, rel);
    return pathToFileURL(containerPath).href;
  } catch {
    return fileUrl;
  }
}

export async function spawnOpencodeServeDocker(options: {
  port: number;
  timeout: number;
  config: Record<string, unknown>;
  env: Record<string, string | undefined>;
  directory: string;
  docker: WorkerDockerConfig;
}): Promise<{
  url: string;
  proc: ChildProcess;
  close: () => Promise<void>;
  directory: string;
}> {
  if (!Number.isFinite(options.port) || options.port <= 0) {
    throw new Error("Docker worker spawn requires a fixed, non-zero port.");
  }
  const image = options.docker.image?.trim();
  if (!image) throw new Error("Docker worker spawn requires docker.image.");

  const mounted = resolveMountPaths(options.directory, options.docker);

  const mergedConfig = await mergeOpenCodeConfig(options.config ?? {}, {
    dropOrchestratorPlugin: true,
    excludeAgentConfigs: true,
    directory: options.directory,
  });

  const mergedConfigObj = (mergedConfig ?? options.config ?? {}) as Record<
    string,
    unknown
  >;
  const plugins = Array.isArray(mergedConfigObj.plugin)
    ? (mergedConfigObj.plugin as unknown[]).filter((p) => typeof p === "string")
    : [];
  if (plugins.length > 0 && mounted.source !== mounted.target) {
    mergedConfigObj.plugin = plugins.map((p) =>
      rewriteFileUrlToMount(p as string, mounted.source, mounted.target),
    );
  }

  const configContent = JSON.stringify(mergedConfigObj, null, 0);

  const containerEnv: Record<string, string> = {
    OPENCODE_CONFIG_CONTENT: configContent,
    OPENCODE_ORCHESTRATOR_WORKER: "1",
  };
  for (const [key, value] of Object.entries(options.env)) {
    if (value === undefined) continue;
    if (key === "OPENCODE_CONFIG_CONTENT") continue;
    if (key === "OPENCODE_ORCHESTRATOR_WORKER") continue;
    containerEnv[key] = value;
  }
  if (options.docker.env) {
    for (const [key, value] of Object.entries(options.docker.env)) {
      containerEnv[key] = value;
    }
  }
  if (options.docker.passEnv) {
    for (const key of options.docker.passEnv) {
      const value = process.env[key];
      if (typeof value === "string") containerEnv[key] = value;
    }
  }

  const name = sanitizeDockerName(
    [
      "opencode-orch",
      options.env.OPENCODE_ORCH_INSTANCE_ID,
      options.env.OPENCODE_ORCH_WORKER_ID,
      String(options.port),
    ]
      .filter(Boolean)
      .join("-"),
  );

  const args = [
    "run",
    "--rm",
    "--name",
    name,
    "-p",
    `${options.port}:${options.port}`,
    "-v",
    `${mounted.source}:${mounted.target}${mounted.readOnly ? ":ro" : ""}`,
    "-w",
    options.docker.workdir ?? mounted.directory,
    ...(options.docker.network ? ["--network", options.docker.network] : []),
    ...(options.docker.extraArgs ?? []),
  ];

  for (const [key, value] of Object.entries(containerEnv)) {
    args.push("--env", `${key}=${value}`);
  }

  args.push(
    image,
    "opencode",
    "serve",
    "--hostname=0.0.0.0",
    `--port=${options.port}`,
  );

  const proc = spawn("docker", args, {
    env: process.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout waiting for docker worker server to start after ${options.timeout}ms`,
          ),
        ),
      options.timeout,
    );
    let output = "";

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (!line.startsWith("opencode server listening")) continue;
        clearTimeout(id);
        cleanup();
        resolve(`http://127.0.0.1:${options.port}`);
        return;
      }
    };

    const onExit = (code: number | null) => {
      clearTimeout(id);
      cleanup();
      let msg = `Docker worker server exited with code ${code}`;
      if (output.trim()) msg += `\nServer output: ${output}`;
      reject(new Error(msg));
    };

    const onError = (err: Error) => {
      clearTimeout(id);
      cleanup();
      reject(err);
    };

    const discard = () => {};

    const cleanup = () => {
      proc.stdout.off("data", onData);
      proc.stderr.off("data", onData);
      proc.off("exit", onExit);
      proc.off("error", onError);
      proc.stdout.on("data", discard);
      proc.stderr.on("data", discard);
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", onExit);
    proc.on("error", onError);
  });

  const close = async () => {
    await new Promise<void>((resolve) => {
      const p = spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
      p.on("exit", () => resolve());
      p.on("error", () => resolve());
    });
  };

  return { url, proc, close, directory: mounted.directory };
}
