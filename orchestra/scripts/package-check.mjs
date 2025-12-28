import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pkgPath = join(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const requirePath = (relPath, label) => {
  const fullPath = join(process.cwd(), relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`${label} missing at ${relPath}`);
  }
};

const requireField = (field) => {
  if (!pkg[field]) throw new Error(`package.json missing "${field}"`);
};

const requireExport = (key) => {
  if (!pkg.exports || !pkg.exports[key]) {
    throw new Error(`package.json exports missing "${key}"`);
  }
};

requireField("name");
requireField("version");
requireField("main");
requireField("types");

requirePath("dist/index.js", "Entry");
requirePath("dist/index.d.ts", "Types");
requirePath("schema/orchestrator.schema.json", "Schema");

if (existsSync(join(process.cwd(), "scripts", "worker-bridge-plugin.mjs"))) {
  requirePath("dist/worker-bridge-plugin.mjs", "Worker bridge plugin");
}

requireExport(".");
requireExport("./schema/orchestrator.schema.json");

const files = Array.isArray(pkg.files) ? pkg.files : [];
const requiredFiles = ["dist", "schema", "README.md"];
for (const entry of requiredFiles) {
  if (!files.includes(entry)) {
    throw new Error(`package.json files missing "${entry}"`);
  }
}

console.log("Package check passed.");
