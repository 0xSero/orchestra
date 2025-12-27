import type { ApiService } from "../api";
import type { MemoryService } from "../memory";
import type { OrchestratorService } from "../orchestrator";
import type { OrchestratorConfig } from "../types";
import type { WorkerManager } from "../workers";
import { createMemoryCommands } from "./memory";
import { createOrchestratorCommands } from "./orchestrator";
import { createVisionCommands } from "./vision";

export type CommandDeps = {
  api: ApiService;
  orchestrator: OrchestratorService;
  workers: WorkerManager;
  memory: MemoryService;
  config: OrchestratorConfig;
  projectDir: string;
};

export type CommandInput = {
  command: string;
  args?: unknown;
  text?: string;
  raw?: string;
  sessionID?: string;
  agent?: string;
};

export type ParsedCommandInput = {
  raw: string;
  tokens: string[];
  positional: string[];
  named: Record<string, string | string[]>;
};

export type CommandContext = {
  deps: CommandDeps;
  input: CommandInput;
  parsed: ParsedCommandInput;
};

export type CommandDefinition = {
  description: string;
  usage?: string;
  execute: (ctx: CommandContext) => Promise<string>;
};

export type CommandRouter = {
  execute: (input: CommandInput) => Promise<string | undefined>;
  list: () => Array<{ name: string; description: string; usage?: string }>;
  commandConfig: () => Record<string, { template: string; description?: string }>;
};

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const matcher = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match = matcher.exec(input);
  while (match !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
    match = matcher.exec(input);
  }
  return tokens;
}

function addNamedValue(named: Record<string, string | string[]>, key: string, value: string) {
  if (!key) return;
  const existing = named[key];
  if (!existing) {
    named[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  named[key] = [existing, value];
}

export function normalizeCommandName(raw: string): string {
  return raw.trim().replace(/^\/+/, "");
}

export function parseCommandInput(input: CommandInput): ParsedCommandInput {
  const named: Record<string, string | string[]> = {};
  let raw = "";
  let tokens: string[] = [];

  if (typeof input.args === "string") {
    raw = input.args;
    tokens = tokenize(raw);
  } else if (Array.isArray(input.args)) {
    tokens = input.args.map((value) => String(value));
    raw = tokens.join(" ");
  } else if (typeof input.text === "string") {
    raw = input.text;
    tokens = tokenize(raw);
  } else if (typeof input.raw === "string") {
    raw = input.raw;
    tokens = tokenize(raw);
  }

  if (input.args && typeof input.args === "object" && !Array.isArray(input.args)) {
    for (const [key, value] of Object.entries(input.args as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        named[key] = value.map((item) => String(item));
        continue;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        named[key] = String(value);
      }
    }
    const extras = (input.args as Record<string, unknown>)._;
    if (Array.isArray(extras) && tokens.length === 0) {
      tokens = extras.map((value) => String(value));
      raw = tokens.join(" ");
    }
  }

  if (!raw && tokens.length > 0) raw = tokens.join(" ");

  const positional: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex !== -1) {
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      if (!(key in named)) addNamedValue(named, key, value);
      continue;
    }

    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      if (!(trimmed in named)) addNamedValue(named, trimmed, next);
      i += 1;
      continue;
    }

    if (!(trimmed in named)) named[trimmed] = "true";
  }

  return { raw, tokens, positional, named };
}

export function createCommandRouter(deps: CommandDeps): CommandRouter {
  const enabled = deps.config.commands?.enabled !== false;
  const rawPrefix = (deps.config.commands?.prefix ?? "orchestrator.").trim();
  const prefix = rawPrefix && !rawPrefix.endsWith(".") ? `${rawPrefix}.` : rawPrefix;

  const commands: Record<string, CommandDefinition> = {
    ...createOrchestratorCommands({ prefix }),
    ...createVisionCommands(),
    ...createMemoryCommands(),
  };

  return {
    execute: async (input: CommandInput) => {
      if (!enabled) return undefined;
      const commandName = normalizeCommandName(String(input.command ?? ""));
      const command = commands[commandName];
      if (!command) return undefined;
      const parsed = parseCommandInput(input);
      return await command.execute({ deps, input, parsed });
    },
    list: () =>
      Object.entries(commands).map(([name, def]) => ({
        name,
        description: def.description,
        usage: def.usage,
      })),
    commandConfig: () => {
      if (!enabled) return {};
      const config: Record<string, { template: string; description?: string }> = {};
      for (const [name, def] of Object.entries(commands)) {
        config[name] = {
          template: `Command ${name} handled by orchestrator plugin.`,
          description: def.description,
        };
      }
      return config;
    },
  };
}
