import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Skill, SkillInput, SkillScope } from "../types";
import { loadSkill, loadSkillOverrides } from "./loader";
import { serializeSkillFile } from "./parse";
import { getSkillDir, getSkillFilePath } from "./paths";
import { validateSkillInput } from "./validate";

function toValidationMessage(result: ReturnType<typeof validateSkillInput>): string {
  return result.errors.map((err) => `${err.field}: ${err.message}`).join("; ");
}

async function writeSkillFile(filePath: string, input: SkillInput): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const frontmatter = {
    ...input.frontmatter,
    name: input.frontmatter.name ?? input.id,
  };
  const content = serializeSkillFile(frontmatter, input.systemPrompt ?? "");
  await writeFile(filePath, content, "utf8");
}

export async function createSkill(input: SkillInput, scope: SkillScope, projectDir?: string): Promise<Skill> {
  const validation = validateSkillInput(input);
  if (!validation.valid) throw new Error(`Invalid skill input: ${toValidationMessage(validation)}`);

  const filePath = getSkillFilePath(input.id, scope, projectDir);
  if (existsSync(filePath)) {
    throw new Error(`Skill "${input.id}" already exists in ${scope} scope.`);
  }

  await writeSkillFile(filePath, input);
  const skill = await loadSkill(input.id, projectDir);
  if (!skill) throw new Error(`Skill "${input.id}" could not be loaded after creation.`);
  return skill;
}

export async function updateSkill(
  id: string,
  updates: Partial<SkillInput>,
  scope: SkillScope,
  projectDir?: string,
): Promise<Skill> {
  const filePath = getSkillFilePath(id, scope, projectDir);

  let base: Skill | undefined;
  if (existsSync(filePath)) {
    base = await loadSkill(id, scope === "project" ? projectDir : undefined);
  } else {
    const lookupDir = scope === "project" ? projectDir : undefined;
    base = await loadSkill(id, lookupDir);
  }

  const merged: SkillInput = {
    id,
    frontmatter: {
      ...(base?.frontmatter ?? {}),
      ...(updates.frontmatter ?? {}),
      name: updates.frontmatter?.name ?? base?.frontmatter.name ?? id,
      description: updates.frontmatter?.description ?? base?.frontmatter.description ?? "",
      model: updates.frontmatter?.model ?? base?.frontmatter.model ?? "",
    },
    systemPrompt: updates.systemPrompt ?? base?.systemPrompt ?? "",
  };

  const validation = validateSkillInput(merged);
  if (!validation.valid) throw new Error(`Invalid skill input: ${toValidationMessage(validation)}`);

  await writeSkillFile(filePath, merged);
  const skill = await loadSkill(id, projectDir);
  if (!skill) throw new Error(`Skill "${id}" could not be loaded after update.`);
  return skill;
}

export async function deleteSkill(id: string, scope: SkillScope, projectDir?: string): Promise<boolean> {
  const dir = getSkillDir(id, scope, projectDir);
  if (!existsSync(dir)) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}

export async function duplicateSkill(
  sourceId: string,
  newId: string,
  scope: SkillScope,
  projectDir?: string,
): Promise<Skill> {
  const source = await loadSkill(sourceId, projectDir);
  if (!source) throw new Error(`Source skill "${sourceId}" not found.`);

  const input: SkillInput = {
    id: newId,
    frontmatter: {
      ...source.frontmatter,
      name: newId,
    },
    systemPrompt: source.systemPrompt,
  };

  return await createSkill(input, scope, projectDir);
}

export async function listSkillOverrides(projectDir?: string): Promise<Skill[]> {
  const map = await loadSkillOverrides(projectDir);
  return Array.from(map.values());
}
