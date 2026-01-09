#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

function fail(message: string) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, unknown> = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      (out._ as string[]).push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      const key = arg.slice(2, eq);
      const value = arg.slice(eq + 1);
      out[key] = value;
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function getUserConfigDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

async function readJsonIfExists(path: string | undefined) {
  if (!path || !existsSync(path)) return { ok: false as const };
  try {
    const raw = await readFile(path, "utf8");
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch (err) {
    return {
      ok: true as const,
      value: undefined,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function formatBool(value: unknown) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "(unset)";
}

function usage() {
  return [
    "Usage:",
    "  bun run opencode:doctor [doctor] [--apply] [--safe-global] [--link-plugin] [--repo <path>]",
    "",
    "Flags:",
    "  --apply        Write changes (default: dry-run)",
    "  --safe-global  Set global orchestrator.json autoSpawn=false",
    "  --link-plugin  Ensure ~/.config/opencode/plugin/orchestrator.js points to this repo dist",
    "  --repo         Repo root to link (default: cwd)",
  ].join("\n");
}

function detectOrchestratorPluginEntries(plugins: unknown) {
  const list = asStringArray(plugins);
  return list.filter((p) => p.includes("orchestrator"));
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function backupFile(path: string) {
  const dir = dirname(path);
  const base = basename(path);
  const backupPath = join(dir, `${base}.bak-${timestamp()}`);
  await writeFile(backupPath, await readFile(path, "utf8"), "utf8");
  return backupPath;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensurePluginLink(
  pluginPath: string,
  repoRoot: string,
  apply: boolean,
) {
  const distPath = resolve(
    repoRoot,
    "packages",
    "orchestrator",
    "dist",
    "index.js",
  );
  const content = `export { OrchestratorPlugin as default } from "${distPath}";\n`;

  const existing = existsSync(pluginPath)
    ? await readFile(pluginPath, "utf8").catch(() => "")
    : undefined;
  if (existing !== undefined && existing === content) {
    return { changed: false, path: pluginPath, content };
  }

  if (!apply) return { changed: true, path: pluginPath, content };

  await mkdir(dirname(pluginPath), { recursive: true });
  if (existsSync(pluginPath)) await backupFile(pluginPath);
  await writeFile(pluginPath, content, "utf8");
  return { changed: true, path: pluginPath, content };
}

async function ensureGlobalPluginEntry(
  openCodePath: string,
  openCodeConfig: unknown,
  apply: boolean,
) {
  const current =
    openCodeConfig && typeof openCodeConfig === "object" ? openCodeConfig : {};
  const plugins = asStringArray((current as any).plugin);
  const entry = "./plugin/orchestrator.js";
  if (plugins.includes(entry)) return { changed: false as const };
  const next = {
    ...(current as Record<string, unknown>),
    plugin: [...plugins, entry],
  };
  if (!apply) return { changed: true as const, next };
  if (existsSync(openCodePath)) await backupFile(openCodePath);
  await writeJson(openCodePath, next);
  return { changed: true as const };
}

async function applySafeGlobalOrchestrator(
  orchestratorPath: string,
  orchestratorConfig: unknown,
  apply: boolean,
) {
  if (!orchestratorConfig || typeof orchestratorConfig !== "object") {
    return {
      changed: false as const,
      reason: "global orchestrator config not readable",
    };
  }
  if ((orchestratorConfig as any).autoSpawn === false)
    return { changed: false as const };
  const next = {
    ...(orchestratorConfig as Record<string, unknown>),
    autoSpawn: false,
  };
  if (!apply) return { changed: true as const, next };
  await backupFile(orchestratorPath);
  await writeJson(orchestratorPath, next);
  return { changed: true as const };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command] = args._ as string[];
  if (command && command !== "doctor") {
    fail(`Unknown command "${command}"\n\n${usage()}`);
  }

  const apply = args.apply === true;
  const linkPlugin = args.linkPlugin === true || args["link-plugin"] === true;
  const safeGlobal = args.safeGlobal === true || args["safe-global"] === true;
  const repoRoot = resolve(args.repo ? String(args.repo) : process.cwd());
  const userConfigDir = getUserConfigDir();
  const opencodeDir = join(userConfigDir, "opencode");
  const globalOpenCodePath = join(opencodeDir, "opencode.json");
  const globalOrchestratorPath = join(opencodeDir, "orchestrator.json");
  const pluginPath = join(opencodeDir, "plugin", "orchestrator.js");

  const globalOpenCode = await readJsonIfExists(globalOpenCodePath);
  const globalOrchestrator = await readJsonIfExists(globalOrchestratorPath);

  process.stdout.write(`# OpenCode doctor\n\n`);
  process.stdout.write(`- repo: ${repoRoot}\n`);
  process.stdout.write(`- configDir: ${opencodeDir}\n\n`);

  if (globalOpenCode.ok) {
    if (globalOpenCode.error) {
      process.stdout.write(
        `Global OpenCode config: ${globalOpenCodePath} (parse error)\n`,
      );
      process.stdout.write(`- error: ${globalOpenCode.error}\n\n`);
    } else {
      const plugins = detectOrchestratorPluginEntries(
        (globalOpenCode.value as any)?.plugin,
      );
      process.stdout.write(`Global OpenCode config: ${globalOpenCodePath}\n`);
      process.stdout.write(
        `- orchestrator plugin entries: ${plugins.length > 0 ? plugins.join(", ") : "(none)"}\n`,
      );
      process.stdout.write("\n");
    }
  } else {
    process.stdout.write(
      `Global OpenCode config: ${globalOpenCodePath} (missing)\n\n`,
    );
  }

  if (globalOrchestrator.ok) {
    if (globalOrchestrator.error) {
      process.stdout.write(
        `Global Orchestrator config: ${globalOrchestratorPath} (parse error)\n`,
      );
      process.stdout.write(`- error: ${globalOrchestrator.error}\n\n`);
    } else {
      process.stdout.write(
        `Global Orchestrator config: ${globalOrchestratorPath}\n`,
      );
      process.stdout.write(
        `- autoSpawn: ${formatBool((globalOrchestrator.value as any)?.autoSpawn)}\n\n`,
      );
    }
  } else {
    process.stdout.write(
      `Global Orchestrator config: ${globalOrchestratorPath} (missing)\n\n`,
    );
  }

  if (safeGlobal) {
    if (!globalOrchestrator.ok || globalOrchestrator.error) {
      process.stdout.write(
        `Safe-global: skipped (cannot read ${globalOrchestratorPath})\n\n`,
      );
    } else {
      const res = await applySafeGlobalOrchestrator(
        globalOrchestratorPath,
        globalOrchestrator.value,
        apply,
      );
      if (res.changed) {
        process.stdout.write(
          apply
            ? `Safe-global: wrote ${globalOrchestratorPath}\n\n`
            : `Safe-global: would write ${globalOrchestratorPath}\n\n`,
        );
      } else {
        process.stdout.write(`Safe-global: no changes\n\n`);
      }
    }
  }

  if (linkPlugin) {
    const res = await ensurePluginLink(pluginPath, repoRoot, apply);
    process.stdout.write(
      res.changed
        ? apply
          ? `Plugin link: wrote ${res.path}\n`
          : `Plugin link: would write ${res.path}\n`
        : `Plugin link: ok (${res.path})\n`,
    );
    process.stdout.write("\n");

    if (apply && res.changed) {
      const globalEntry = await ensureGlobalPluginEntry(
        globalOpenCodePath,
        globalOpenCode.ok ? globalOpenCode.value : undefined,
        apply,
      );
      process.stdout.write(
        globalEntry.changed
          ? `OpenCode config: updated ${globalOpenCodePath}\n\n`
          : `OpenCode config: ok (${globalOpenCodePath})\n\n`,
      );
    } else if (!apply && res.changed) {
      const globalEntry = await ensureGlobalPluginEntry(
        globalOpenCodePath,
        globalOpenCode.ok ? globalOpenCode.value : undefined,
        false,
      );
      process.stdout.write(
        globalEntry.changed
          ? `OpenCode config: would update ${globalOpenCodePath}\n\n`
          : `OpenCode config: ok (${globalOpenCodePath})\n\n`,
      );
    }
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
