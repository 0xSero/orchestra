import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

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
const promptsRoot = resolve(packageRoot, "prompts");
const cache = new Map<string, string>();

function resolvePromptPath(input: string): string {
  const cleaned = input.trim().replace(/\\/g, "/");
  if (!cleaned) throw new Error("Prompt file path is required.");

  const base = cleaned.startsWith("prompts/") ? packageRoot : promptsRoot;
  const resolved = resolve(base, cleaned);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error(`Prompt file path must stay within ${base}.`);
  }

  return resolved;
}

export async function loadPromptFile(relativePath: string): Promise<string> {
  const key = relativePath;
  const cached = cache.get(key);
  if (cached) return cached;

  const path = resolvePromptPath(relativePath);
  const content = await readFile(path, "utf8");
  cache.set(key, content);
  return content;
}
