import type { Skill, SkillFrontmatter, SkillSource, WorkerProfile } from "../types";

function combineDescription(purpose?: string, whenToUse?: string): string {
  const parts = [purpose?.trim(), whenToUse?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return "General-purpose skill.";
  if (parts.length === 1) return parts[0];
  const combined = `${parts[0]} When to use: ${parts[1]}`;
  return combined.length > 1024 ? `${combined.slice(0, 1021).trimEnd()}...` : combined;
}

export function profileToSkill(profile: WorkerProfile, source: SkillSource): Skill {
  const frontmatter: SkillFrontmatter = {
    name: profile.id,
    description: combineDescription(profile.purpose, profile.whenToUse),
    model: profile.model,
    providerID: profile.providerID,
    temperature: profile.temperature,
    tools: profile.tools,
    permissions: profile.permissions,
    tags: profile.tags,
    supportsVision: profile.supportsVision,
    supportsWeb: profile.supportsWeb,
    injectRepoContext: profile.injectRepoContext,
    extends: profile.extends,
    compose: profile.compose,
    // Session mode configuration
    sessionMode: profile.sessionMode,
    forwardEvents: profile.forwardEvents,
    mcp: profile.mcp,
    integrations: profile.integrations,
    env: profile.env,
    envPrefixes: profile.envPrefixes,
    skillPermissions: profile.skillPermissions,
  };

  return {
    id: profile.id,
    source,
    frontmatter,
    systemPrompt: profile.systemPrompt ?? "",
    filePath: source.type === "project" || source.type === "global" ? source.path : "",
    hasScripts: false,
    hasReferences: false,
    hasAssets: false,
  };
}

export function skillToProfile(skill: Skill): WorkerProfile {
  return {
    id: skill.frontmatter.name ?? skill.id,
    name: skill.frontmatter.name ?? skill.id,
    model: skill.frontmatter.model ?? "auto",
    providerID: skill.frontmatter.providerID,
    purpose: skill.frontmatter.description ?? "General-purpose skill.",
    whenToUse: skill.frontmatter.description ?? "General-purpose skill.",
    systemPrompt: skill.systemPrompt,
    supportsVision: skill.frontmatter.supportsVision,
    supportsWeb: skill.frontmatter.supportsWeb,
    tools: skill.frontmatter.tools,
    temperature: skill.frontmatter.temperature,
    tags: skill.frontmatter.tags,
    injectRepoContext: skill.frontmatter.injectRepoContext,
    permissions: skill.frontmatter.permissions,
    extends: skill.frontmatter.extends,
    compose: skill.frontmatter.compose,
    // Session mode configuration
    sessionMode: skill.frontmatter.sessionMode,
    forwardEvents: skill.frontmatter.forwardEvents,
    mcp: skill.frontmatter.mcp,
    integrations: skill.frontmatter.integrations,
    env: skill.frontmatter.env,
    envPrefixes: skill.frontmatter.envPrefixes,
    skillPermissions: skill.frontmatter.skillPermissions,
    source: skill.source,
  };
}
