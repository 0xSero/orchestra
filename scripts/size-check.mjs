import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MAX_LINES = 600;
const includeExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function countNonEmptyLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function runGit(args, options) {
  const result = spawnSync("git", args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new Error(
      stderr.length > 0 ? stderr : `git ${args.join(" ")} failed`,
    );
  }
  return result.stdout ?? "";
}

const baseRef = process.env.GITHUB_BASE_REF;
if (!baseRef || baseRef.trim().length === 0) {
  console.log("size:check: base ref not detected (not a PR), skipping.");
  process.exit(0);
}

try {
  runGit(["fetch", "--depth=1", "origin", baseRef], { stdio: "ignore" });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`size:check: could not fetch origin/${baseRef}: ${message}`);
  process.exit(0);
}

const base = `origin/${baseRef}`;
const changedRaw = runGit(["diff", "--name-only", `${base}...HEAD`]);
const changedFiles = changedRaw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (changedFiles.length === 0) {
  console.log("size:check: no changed files.");
  process.exit(0);
}

const violations = [];
for (const file of changedFiles) {
  const ext = path.extname(file).toLowerCase();
  if (!includeExt.has(ext)) continue;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;

  const currentText = fs.readFileSync(file, "utf8");
  const currentLines = countNonEmptyLines(currentText);

  let baseExists = true;
  let baseLines = 0;
  try {
    const baseText = runGit(["show", `${base}:${file}`], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    baseLines = countNonEmptyLines(baseText);
  } catch {
    baseExists = false;
  }

  if (!baseExists) {
    if (currentLines > MAX_LINES) {
      violations.push({ file, kind: "new", currentLines, baseLines: 0 });
    }
    continue;
  }

  if (baseLines <= MAX_LINES) {
    if (currentLines > MAX_LINES) {
      violations.push({ file, kind: "cap", currentLines, baseLines });
    }
    continue;
  }

  if (currentLines > baseLines) {
    violations.push({ file, kind: "grow", currentLines, baseLines });
  }
}

if (violations.length > 0) {
  console.log(`size:check: ${violations.length} file(s) violate limits:`);
  for (const v of violations) {
    if (v.kind === "new") {
      console.log(
        `- ${v.file}: new file is ${v.currentLines} LOC (max ${MAX_LINES})`,
      );
    } else if (v.kind === "cap") {
      console.log(
        `- ${v.file}: ${v.currentLines} LOC (was ${v.baseLines}, max ${MAX_LINES})`,
      );
    } else {
      console.log(
        `- ${v.file}: grew to ${v.currentLines} LOC (was ${v.baseLines})`,
      );
    }
  }
  process.exit(1);
}

console.log(
  `size:check: ok (${changedFiles.length} changed file(s), capped at ${MAX_LINES} LOC per file).`,
);
