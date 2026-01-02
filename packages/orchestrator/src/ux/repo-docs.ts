import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type RepoDocsBundle = {
  root: string;
  files: string[];
  markdown: string;
  truncated: boolean;
};

function findPluginRoot(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [];
  let cursor = here;
  for (let i = 0; i < 6; i += 1) {
    candidates.push(cursor);
    cursor = join(cursor, "..");
  }
  const docMarkers = [
    ["README.md"],
    ["HEADLESS_TESTING.md"],
    ["docs", "guide.md"],
    ["docs", "reference.md"],
    ["docs", "architecture.md"],
  ];
  for (const dir of candidates) {
    if (docMarkers.some((parts) => existsSync(join(dir, ...parts)))) {
      return dir;
    }
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, "package.json"))) return dir;
  }
  return undefined;
}

function clampText(
  input: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (input.length <= maxChars) return { text: input, truncated: false };
  return {
    text: input.slice(0, Math.max(0, maxChars)) + "\n\n…(truncated)\n",
    truncated: true,
  };
}

export async function getRepoDocsBundle(options?: {
  maxTotalChars?: number;
  maxFileChars?: number;
}): Promise<RepoDocsBundle | undefined> {
  const root = findPluginRoot();
  if (!root) return undefined;

  const maxTotalChars = options?.maxTotalChars ?? 45_000;
  const maxFileChars = options?.maxFileChars ?? 14_000;

  const files = [
    "README.md",
    "docs/guide.md",
    "docs/reference.md",
    "docs/architecture.md",
    "HEADLESS_TESTING.md",
  ]
    .map((p) => join(root, p))
    .filter((p) => existsSync(p));

  if (files.length === 0) return undefined;

  const sections: string[] = [];
  let total = 0;
  let truncated = false;

  sections.push("# opencode-orchestrator (local docs)");
  sections.push("");
  sections.push(
    "These are the bundled docs for the orchestrator plugin you’re running.",
  );
  sections.push(
    "Prefer answering questions using this content first, then the user’s project files.",
  );
  sections.push("");

  for (const abs of files) {
    const rel = abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
    const raw = await readFile(abs, "utf8").catch(() => "");
    if (!raw.trim()) continue;

    const capped = clampText(raw, maxFileChars);
    const next = `\n\n---\n\n## File: ${rel}\n\n${capped.text}`;

    if (total + next.length > maxTotalChars) {
      truncated = true;
      break;
    }
    sections.push(next);
    total += next.length;
    if (capped.truncated) truncated = true;
  }

  return {
    root,
    files: files.map((p) =>
      p.startsWith(root) ? p.slice(root.length + 1) : p,
    ),
    markdown: sections.join("\n").trim() + "\n",
    truncated,
  };
}
