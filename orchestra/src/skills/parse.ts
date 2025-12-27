import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type ParsedSkillFile = {
  frontmatter: Record<string, unknown>;
  body: string;
};

export function parseSkillFile(contents: string): ParsedSkillFile {
  const normalized = contents.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== "---") {
    throw new Error("Skill file must start with YAML frontmatter (---).");
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error("Skill frontmatter must be closed with ---.");
  }

  const yamlText = lines.slice(1, endIndex).join("\n");
  const parsed = parseYaml(yamlText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Skill frontmatter must be a YAML object.");
  }

  const body = lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();

  return {
    frontmatter: parsed as Record<string, unknown>,
    body,
  };
}

export function serializeSkillFile(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(frontmatter).trimEnd();
  const trimmedBody = body.trim();
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`;
}
