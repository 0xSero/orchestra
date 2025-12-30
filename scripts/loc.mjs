import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const includeExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs", ".css"]);
const excludeDirs = new Set([
  "node_modules",
  "dist",
  "target",
  ".git",
  "coverage",
  "build",
  "out",
]);

const targets = [
  {
    name: "packages/orchestrator",
    paths: ["packages/orchestrator/src"],
    budget: 4000,
  },
  {
    name: "apps/control-panel",
    paths: ["apps/control-panel/src"],
    budget: 3000,
  },
  {
    name: "apps/desktop",
    paths: ["apps/desktop/src", "apps/desktop/src-tauri/src"],
    budget: 1500,
  },
];

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) continue;
      files.push(...walk(path.join(dir, entry.name)));
    } else if (entry.isFile()) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
};

const countLines = (file) => {
  const data = fs.readFileSync(file, "utf8");
  return data
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .length;
};

const countTarget = (target) => {
  let total = 0;
  for (const rel of target.paths) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const files = walk(abs).filter((file) => includeExt.has(path.extname(file)));
    for (const file of files) total += countLines(file);
  }
  return total;
};

const printTotals = () => {
  console.log("\nLOC budgets (non-empty lines):");
  for (const target of targets) {
    const total = countTarget(target);
    const delta = total - target.budget;
    const sign = delta > 0 ? "+" : "";
    console.log(
      `- ${target.name}: ${total} LOC (budget ${target.budget}, delta ${sign}${delta})`,
    );
  }
};

const tryPrintDiff = () => {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (!baseRef) {
    console.log("\nLOC deltas: base ref not detected (not a PR).");
    return;
  }

  try {
    execSync(`git fetch --depth=1 origin ${baseRef}`, { stdio: "ignore" });
  } catch {
    console.log(`\nLOC deltas: could not fetch origin/${baseRef}.`);
    return;
  }

  const base = `origin/${baseRef}`;
  console.log(`\nLOC deltas vs ${base}:`);
  for (const target of targets) {
    const diffArgs = target.paths.map((p) => `"${p}"`).join(" ");
    try {
      const output = execSync(`git diff --numstat ${base}...HEAD -- ${diffArgs}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      let added = 0;
      let removed = 0;
      for (const line of output.trim().split("\n")) {
        if (!line) continue;
        const [a, r] = line.split("\t");
        added += Number(a) || 0;
        removed += Number(r) || 0;
      }
      console.log(`- ${target.name}: +${added} / -${removed} lines`);
    } catch {
      console.log(`- ${target.name}: diff unavailable`);
    }
  }
};

printTotals();
tryPrintDiff();
