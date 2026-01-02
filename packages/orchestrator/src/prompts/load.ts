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
const snippetPattern = /\{\{\s*snippet:([a-z0-9._/-]+)\s*\}\}/gi;

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

async function expandSnippets(
  content: string,
  stack: Set<string>,
): Promise<string> {
  const matches = [...content.matchAll(snippetPattern)];
  if (matches.length === 0) return content;

  const replacements = new Map<string, string>();
  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const snippetKey = raw.endsWith(".md") ? raw : `${raw}.md`;
    if (replacements.has(raw)) continue;
    const snippetPath = `snippets/${snippetKey}`;
    const snippetContent = await loadPromptFileInternal(snippetPath, stack);
    replacements.set(raw, snippetContent);
  }

  return content.replace(snippetPattern, (_, name: string) => {
    const key = name?.trim();
    return (key && replacements.get(key)) ?? "";
  });
}

export async function expandPromptSnippets(content: string): Promise<string> {
  return expandSnippets(content, new Set());
}

async function loadPromptFileInternal(
  relativePath: string,
  stack: Set<string>,
): Promise<string> {
  const key = relativePath;
  const cached = cache.get(key);
  if (cached) return cached;

  if (stack.has(key)) {
    throw new Error(
      `Prompt snippet cycle detected: ${[...stack, key].join(" -> ")}`,
    );
  }
  stack.add(key);

  const path = resolvePromptPath(relativePath);
  try {
    const content = await readFile(path, "utf8");
    const expanded = await expandSnippets(content, stack);
    cache.set(key, expanded);
    return expanded;
  } finally {
    stack.delete(key);
  }
}

export async function loadPromptFile(relativePath: string): Promise<string> {
  return loadPromptFileInternal(relativePath, new Set());
}
