#!/usr/bin/env node
/**
 * Open Orchestra - Install Script
 *
 * Usage:
 *   npx open-orchestra             # Zero-config setup (defaults, no prompts)
 *   npx open-orchestra --interactive # Guided setup
 *   npx open-orchestra --full      # Zero-config + example skills
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";

const VERSION = "0.2.4";
const PACKAGE_NAME = "open-orchestra";

// ANSI colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const log = {
  info: (msg) => console.log(`${c.blue}ℹ${c.reset} ${msg}`),
  success: (msg) => console.log(`${c.green}✓${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
  step: (msg) => console.log(`${c.cyan}→${c.reset} ${msg}`),
  header: (msg) => console.log(`\n${c.bold}${c.magenta}${msg}${c.reset}\n`),
};

const args = process.argv.slice(2);
const flags = {
  yes: args.includes("--yes") || args.includes("-y"),
  minimal: args.includes("--minimal") || args.includes("-m"),
  full: args.includes("--full"),
  help: args.includes("--help") || args.includes("-h"),
  interactive: args.includes("--interactive"),
  project: args.includes("--project"),
  global: args.includes("--global"),
};

const useInteractive = flags.interactive;
const useDefaults = flags.yes || !useInteractive;
const useMinimal = flags.minimal || (!useInteractive && !flags.full);

if (flags.help) {
  console.log(`
${c.bold}Open Orchestra${c.reset} - Multi-agent orchestration for OpenCode

${c.bold}Usage:${c.reset}
  bun x ${PACKAGE_NAME}            Zero-config setup (defaults, no prompts)
  npx ${PACKAGE_NAME}              Zero-config setup (defaults, no prompts)
  bun x ${PACKAGE_NAME} --interactive  Guided setup with prompts
  npx ${PACKAGE_NAME} --interactive  Guided setup with prompts
  bun x ${PACKAGE_NAME} --full     Zero-config + example skills
  npx ${PACKAGE_NAME} --full       Zero-config + example skills
  npx ${PACKAGE_NAME} --yes        Accept all defaults
  npx ${PACKAGE_NAME} --minimal    Create minimal config only

${c.bold}Options:${c.reset}
  -y, --yes       Skip prompts, use defaults
  -m, --minimal   Minimal configuration
  --full          Include example skills with defaults
  --interactive   Prompt for model and optional files
  --project       Write configs to the current project (default)
  --global        Write configs to the global OpenCode config
  -h, --help      Show this help

${c.bold}What this does:${c.reset}
  1. Adds ${PACKAGE_NAME}@${VERSION} to your OpenCode plugin list
  2. Creates orchestrator.json with worker profiles
  3. Optionally creates example skill files

${c.bold}Learn more:${c.reset}
  https://npmjs.com/package/${PACKAGE_NAME}
`);
  process.exit(0);
}

async function prompt(question, defaultValue) {
  if (useDefaults) return defaultValue;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const defaultStr = defaultValue ? ` ${c.dim}(${defaultValue})${c.reset}` : "";
    rl.question(`${question}${defaultStr}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function confirm(question, defaultYes = true) {
  if (useDefaults) return defaultYes;

  const answer = await prompt(
    `${question} ${c.dim}[${defaultYes ? "Y/n" : "y/N"}]${c.reset}`,
    defaultYes ? "y" : "n"
  );
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getUserConfigDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function getGlobalOpenCodeConfigPath() {
  return join(getUserConfigDir(), "opencode", "opencode.json");
}

function getGlobalOrchestratorConfigPath() {
  return join(getUserConfigDir(), "opencode", "orchestrator.json");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function resolveConfigPaths() {
  const projectLocations = ["opencode.json", ".opencode/opencode.json"];
  const projectPath = projectLocations.find((loc) => existsSync(loc));
  const globalPath = getGlobalOpenCodeConfigPath();

  const useProject = flags.project || !flags.global;
  const opencodeConfigPath = useProject ? (projectPath ?? "opencode.json") : globalPath;
  const orchestratorPath = useProject ? ".opencode/orchestrator.json" : getGlobalOrchestratorConfigPath();

  return { opencodeConfigPath, orchestratorPath, scope: useProject ? "project" : "global" };
}

async function main() {
  log.header(`Open Orchestra v${VERSION}`);
  log.info("Multi-agent orchestration plugin for OpenCode\n");

  // Step 1: Update opencode.json
  log.step("Configuring OpenCode plugin...");

  const { opencodeConfigPath, orchestratorPath } = resolveConfigPaths();
  ensureDir(dirname(opencodeConfigPath));
  let opencodeConfig = readJson(opencodeConfigPath) || {};

  const pluginEntry = `${PACKAGE_NAME}@${VERSION}`;
  const plugins = Array.isArray(opencodeConfig.plugin) ? opencodeConfig.plugin : [];

  // Check if already installed
  const existingPlugin = plugins.find(p =>
    p === PACKAGE_NAME ||
    p.startsWith(`${PACKAGE_NAME}@`) ||
    p === pluginEntry
  );

  if (existingPlugin) {
    if (existingPlugin === pluginEntry) {
      log.success(`Plugin already configured: ${pluginEntry}`);
    } else {
      // Update to new version
      const idx = plugins.indexOf(existingPlugin);
      plugins[idx] = pluginEntry;
      opencodeConfig.plugin = plugins;
      writeJson(opencodeConfigPath, opencodeConfig);
      log.success(`Updated plugin: ${existingPlugin} → ${pluginEntry}`);
    }
  } else {
    plugins.push(pluginEntry);
    opencodeConfig.plugin = plugins;
    writeJson(opencodeConfigPath, opencodeConfig);
    log.success(`Added plugin to ${opencodeConfigPath}`);
  }

  // Step 2: Create orchestrator config
  log.step("Creating orchestrator configuration...");

  ensureDir(dirname(orchestratorPath));

  if (existsSync(orchestratorPath)) {
    const overwrite = await confirm("Orchestrator config exists. Overwrite?", false);
    if (!overwrite) {
      log.info("Keeping existing orchestrator.json");
    } else {
      await createOrchestratorConfig(orchestratorPath);
    }
  } else {
    await createOrchestratorConfig(orchestratorPath);
  }

  // Step 3: Create example skills (optional)
  if (!useMinimal) {
    if (useInteractive) {
      const createSkills = await confirm("Create example skill files?", true);
      if (createSkills) {
        await createExampleSkills();
      }
    } else {
      await createExampleSkills();
    }
  }

  // Done!
  log.header("Setup Complete!");

  console.log(`${c.dim}Files created:${c.reset}`);
  console.log(`  ${c.green}✓${c.reset} ${opencodeConfigPath}`);
  console.log(`  ${c.green}✓${c.reset} ${orchestratorPath}`);
  if (!useMinimal) {
    console.log(`  ${c.green}✓${c.reset} .opencode/skill/coder/SKILL.md`);
    console.log(`  ${c.green}✓${c.reset} .opencode/skill/docs/SKILL.md`);
  }

  console.log(`
${c.bold}Next steps:${c.reset}
  1. Run ${c.cyan}opencode${c.reset} to start
  2. The orchestrator will automatically delegate tasks to workers
  3. Edit ${c.dim}${orchestratorPath}${c.reset} to customize

${c.bold}Documentation:${c.reset}
  ${c.blue}https://npmjs.com/package/${PACKAGE_NAME}${c.reset}
`);
}

async function createOrchestratorConfig(path) {
  // Ask for preferred model
  let model = "anthropic/claude-sonnet-4-20250514";

  if (useInteractive && !useMinimal) {
    console.log(`
${c.dim}Available model providers:${c.reset}
  1. anthropic/claude-sonnet-4-20250514 ${c.dim}(recommended)${c.reset}
  2. anthropic/claude-opus-4-5-20251101
  3. openai/gpt-4o
  4. Other (enter custom)
`);
    const choice = await prompt("Select model [1-4]", "1");

    switch (choice) {
      case "1": model = "anthropic/claude-sonnet-4-20250514"; break;
      case "2": model = "anthropic/claude-opus-4-5-20251101"; break;
      case "3": model = "openai/gpt-4o"; break;
      default:
        if (choice.includes("/")) model = choice;
        break;
    }
  }

  const config = {
    $schema: `https://unpkg.com/${PACKAGE_NAME}@${VERSION}/schema/orchestrator.schema.json`,
    autoSpawn: true,
    profiles: [
      {
        id: "coder",
        name: "Code Implementer",
        model: model,
        purpose: "Write, edit, and refactor code with full tool access",
        whenToUse: "When you need to actually write or modify code, create files, or implement features",
        sessionMode: "linked",
      },
      {
        id: "docs",
        name: "Documentation Librarian",
        model: model,
        purpose: "Research documentation, find examples, explain APIs",
        whenToUse: "When you need to look up docs, find code examples, or understand library APIs",
        supportsWeb: true,
        tools: { write: false, edit: false },
        sessionMode: "linked",
      },
      {
        id: "architect",
        name: "System Architect",
        model: model,
        purpose: "Design systems, plan implementations, review architecture",
        whenToUse: "When you need to plan a complex feature or make high-level technical decisions",
        tools: { write: false, edit: false, bash: false },
        sessionMode: "linked",
      },
    ],
    workers: ["coder", "docs"],
  };

  writeJson(path, config);
  log.success(`Created ${path}`);
}

async function createExampleSkills() {
  log.step("Creating example skills...");

  ensureDir(".opencode/skill/coder");
  ensureDir(".opencode/skill/docs");

  // Coder skill
  const coderSkill = `---
name: coder
description: Code implementation specialist with full tool access
model: anthropic/claude-sonnet-4-20250514
sessionMode: linked
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

You are a code implementation specialist. Your role is to:

1. Write clean, well-structured code
2. Follow existing patterns in the codebase
3. Add appropriate error handling
4. Keep changes focused and minimal

When implementing:
- Read existing code first to understand patterns
- Make incremental changes
- Test your changes when possible
- Explain what you changed and why
`;

  // Docs skill
  const docsSkill = `---
name: docs
description: Documentation researcher and API expert
model: anthropic/claude-sonnet-4-20250514
supportsWeb: true
sessionMode: linked
tools:
  read: true
  write: false
  edit: false
  glob: true
  grep: true
---

You are a documentation specialist. Your role is to:

1. Research official documentation
2. Find relevant code examples
3. Explain APIs and library usage
4. Identify best practices

When researching:
- Prefer official documentation sources
- Provide working code examples
- Note version compatibility
- Summarize key points clearly
`;

  writeFileSync(".opencode/skill/coder/SKILL.md", coderSkill);
  writeFileSync(".opencode/skill/docs/SKILL.md", docsSkill);

  log.success("Created example skills");
}

main().catch((err) => {
  console.error(`${c.yellow}Error:${c.reset} ${err.message}`);
  process.exit(1);
});
