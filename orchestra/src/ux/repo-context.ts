/**
 * Repo Context - Gathers context about the repository for worker injection
 *
 * Used primarily for the docs worker to understand the project it's helping with.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type RepoContext = {
  /** Root directory of the repo */
  root: string;
  /** Project name (from package.json or directory name) */
  name: string;
  /** Project description (from package.json) */
  description?: string;
  /** Package.json contents (parsed) */
  packageJson?: Record<string, unknown>;
  /** README content (truncated) */
  readme?: string;
  /** Directory structure (top-level) */
  structure: string[];
  /** Git branch info */
  git?: {
    branch?: string;
    remoteUrl?: string;
    hasUncommittedChanges?: boolean;
  };
  /** Whether content was truncated */
  truncated: boolean;
  /** Formatted markdown for injection */
  markdown: string;
};

type RepoContextDeps = {
  existsSync?: typeof existsSync;
  readdirSync?: typeof readdirSync;
  statSync?: typeof statSync;
  readFile?: typeof readFile;
  execSync?: typeof execSync;
};

function clampText(input: string, maxChars: number): { text: string; truncated: boolean } {
  if (input.length <= maxChars) return { text: input, truncated: false };
  return { text: `${input.slice(0, Math.max(0, maxChars))}\n\n...(truncated)\n`, truncated: true };
}

/**
 * Check if a directory is a git repository by looking for .git directory.
 * This is faster and safer than running git commands.
 */
function isGitRepository(directory: string, deps: RepoContextDeps): boolean {
  const existsSyncFn = deps.existsSync ?? existsSync;
  try {
    return existsSyncFn(join(directory, ".git"));
  } catch {
    return false;
  }
}

function getGitInfo(directory: string, deps: RepoContextDeps): RepoContext["git"] | undefined {
  // Check for .git directory first to avoid unnecessary process spawning
  if (!isGitRepository(directory, deps)) {
    return undefined;
  }

  try {
    const execSyncFn = deps.execSync ?? execSync;
    const branch = execSyncFn("git rev-parse --abbrev-ref HEAD", {
      cwd: directory,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000, // 5 second timeout to prevent hanging
    }).trim();

    let remoteUrl: string | undefined;
    try {
      remoteUrl = execSyncFn("git remote get-url origin", {
        cwd: directory,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      }).trim();
    } catch {
      // No remote configured
    }

    let hasUncommittedChanges = false;
    try {
      const status = execSyncFn("git status --porcelain", {
        cwd: directory,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000, // Longer timeout for status as it can be slower
      }).trim();
      hasUncommittedChanges = status.length > 0;
    } catch {
      // Git status failed
    }

    return { branch, remoteUrl, hasUncommittedChanges };
  } catch {
    return undefined;
  }
}

function getDirectoryStructure(directory: string, maxItems = 30, deps: RepoContextDeps = {}): string[] {
  const readdirSyncFn = deps.readdirSync ?? readdirSync;
  const statSyncFn = deps.statSync ?? statSync;
  try {
    const entries = readdirSyncFn(directory);
    const result: string[] = [];

    // Prioritize important files/dirs
    const priority = [
      "package.json",
      "tsconfig.json",
      "README.md",
      "src",
      "lib",
      "app",
      "pages",
      "components",
      "test",
      "tests",
      "__tests__",
    ];

    const sorted = entries.sort((a, b) => {
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const entry of sorted) {
      if (result.length >= maxItems) break;
      if (entry.startsWith(".") && entry !== ".github") continue;
      if (entry === "node_modules" || entry === "dist" || entry === "build") continue;

      try {
        const stat = statSyncFn(join(directory, entry));
        const suffix = stat.isDirectory() ? "/" : "";
        result.push(entry + suffix);
      } catch {
        result.push(entry);
      }
    }

    return result;
  } catch {
    return [];
  }
}

export async function getRepoContext(options: {
  directory: string;
  maxReadmeChars?: number;
  maxTotalChars?: number;
  deps?: RepoContextDeps;
}): Promise<RepoContext | undefined> {
  const { directory } = options;
  const maxReadmeChars = options.maxReadmeChars ?? 8000;
  const maxTotalChars = options.maxTotalChars ?? 16000;
  const deps = options.deps ?? {};
  const existsSyncFn = deps.existsSync ?? existsSync;
  const readFileFn = deps.readFile ?? readFile;

  if (!existsSyncFn(directory)) return undefined;

  let name = basename(directory);
  let description: string | undefined;
  let packageJson: Record<string, unknown> | undefined;

  // Try to read package.json
  const pkgPath = join(directory, "package.json");
  if (existsSyncFn(pkgPath)) {
    try {
      const raw = await readFileFn(pkgPath, "utf8");
      packageJson = JSON.parse(raw);
      if (packageJson && typeof packageJson.name === "string") name = packageJson.name;
      if (packageJson && typeof packageJson.description === "string") description = packageJson.description;
    } catch {
      // Ignore parse errors
    }
  }

  // Try to read README
  let readme: string | undefined;
  let readmeTruncated = false;
  const readmeNames = ["README.md", "readme.md", "README", "README.txt"];
  for (const readmeName of readmeNames) {
    const readmePath = join(directory, readmeName);
    if (existsSyncFn(readmePath)) {
      try {
        const raw = await readFileFn(readmePath, "utf8");
        const clamped = clampText(raw, maxReadmeChars);
        readme = clamped.text;
        readmeTruncated = clamped.truncated;
      } catch {
        // Ignore read errors
      }
      break;
    }
  }

  // Get directory structure
  const structure = getDirectoryStructure(directory, 30, deps);

  // Get git info
  const git = getGitInfo(directory, deps);

  // Build markdown
  const sections: string[] = [];
  sections.push(`# Project Context: ${name}`);
  sections.push("");

  if (description) {
    sections.push(`> ${description}`);
    sections.push("");
  }

  if (git) {
    sections.push("## Git Info");
    if (git.branch) sections.push(`- Branch: \`${git.branch}\``);
    if (git.remoteUrl) sections.push(`- Remote: \`${git.remoteUrl}\``);
    if (git.hasUncommittedChanges) sections.push(`- Has uncommitted changes`);
    sections.push("");
  }

  sections.push("## Directory Structure");
  sections.push("```");
  sections.push(structure.join("\n"));
  sections.push("```");
  sections.push("");

  if (packageJson) {
    sections.push("## package.json (summary)");
    const deps = Object.keys((packageJson.dependencies as Record<string, string>) ?? {});
    const devDeps = Object.keys((packageJson.devDependencies as Record<string, string>) ?? {});
    const scripts = Object.keys((packageJson.scripts as Record<string, string>) ?? {});

    if (scripts.length > 0) {
      sections.push(`- Scripts: ${scripts.slice(0, 10).join(", ")}${scripts.length > 10 ? "..." : ""}`);
    }
    if (deps.length > 0) {
      sections.push(`- Dependencies: ${deps.slice(0, 10).join(", ")}${deps.length > 10 ? "..." : ""}`);
    }
    if (devDeps.length > 0) {
      sections.push(`- Dev dependencies: ${devDeps.slice(0, 10).join(", ")}${devDeps.length > 10 ? "..." : ""}`);
    }
    sections.push("");
  }

  if (readme) {
    sections.push("## README");
    sections.push(readme);
    sections.push("");
  }

  let markdown = sections.join("\n");
  let truncated = readmeTruncated;

  // Final clamp
  if (markdown.length > maxTotalChars) {
    const clamped = clampText(markdown, maxTotalChars);
    markdown = clamped.text;
    truncated = true;
  }

  return {
    root: directory,
    name,
    description,
    packageJson,
    readme,
    structure,
    git,
    truncated,
    markdown,
  };
}

/**
 * Get repo context formatted for worker prompt injection.
 * Returns undefined if no context can be gathered.
 */
export async function getRepoContextForWorker(
  directory: string,
  deps?: RepoContextDeps,
): Promise<string | undefined> {
  const context = await getRepoContext({
    directory,
    maxReadmeChars: 6000,
    maxTotalChars: 12000,
    deps,
  });

  if (!context) return undefined;

  return `<repo-context>\n${context.markdown}\n</repo-context>`;
}
