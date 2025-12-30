import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

const require = createRequire(import.meta.url);

const candidatesByPlatform = {
  darwin: {
    arm64: ["@biomejs/cli-darwin-arm64"],
    x64: ["@biomejs/cli-darwin-x64"],
  },
  linux: {
    arm64: ["@biomejs/cli-linux-arm64", "@biomejs/cli-linux-arm64-musl"],
    x64: ["@biomejs/cli-linux-x64", "@biomejs/cli-linux-x64-musl"],
  },
  win32: {
    arm64: ["@biomejs/cli-win32-arm64"],
    x64: ["@biomejs/cli-win32-x64"],
  },
};

function findBunStoreRoot(startDir) {
  let current = startDir;
  while (true) {
    const candidate = join(current, "node_modules", ".bun");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function resolveFromBunStore(candidates) {
  const storeRoot = findBunStoreRoot(process.cwd());
  if (!storeRoot) return undefined;
  const entries = readdirSync(storeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const pkg of candidates) {
    const prefix = `${pkg.replace("/", "+")}@`;
    const match = entries
      .filter((name) => name.startsWith(prefix))
      .sort()
      .pop();
    if (!match) continue;
    const bin = join(
      storeRoot,
      match,
      "node_modules",
      "@biomejs",
      pkg.split("/")[1],
      process.platform === "win32" ? "biome.exe" : "biome"
    );
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

function resolveBiomeBinary() {
  const platform = process.platform;
  const arch = process.arch;
  const candidates = candidatesByPlatform[platform]?.[arch];

  if (!candidates || candidates.length === 0) {
    throw new Error(`Unsupported platform for Biome: ${platform} ${arch}`);
  }

  for (const pkg of candidates) {
    try {
      const pkgJson = require.resolve(`${pkg}/package.json`);
      const bin = join(dirname(pkgJson), platform === "win32" ? "biome.exe" : "biome");
      return bin;
    } catch {
      // try next candidate
    }
  }

  const bunBin = resolveFromBunStore(candidates);
  if (bunBin) return bunBin;

  throw new Error(
    `Biome CLI not found. Install @biomejs/biome (with optional deps) or one of: ${candidates.join(", ")}`
  );
}

const args = process.argv.slice(2);
const biomeBin = resolveBiomeBinary();

const child = spawn(biomeBin, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(`Failed to run Biome: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
