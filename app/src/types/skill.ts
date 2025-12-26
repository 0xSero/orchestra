export type ToolPermissions = {
  categories?: {
    filesystem?: "full" | "read" | "none";
    execution?: "full" | "sandboxed" | "none";
    network?: "full" | "localhost" | "none";
  };
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      constraints?: Record<string, unknown>;
    };
  };
  paths?: {
    allowed?: string[];
    denied?: string[];
  };
};

export interface SkillFrontmatter {
  name: string;
  description: string;
  model: string;
  providerID?: string;
  temperature?: number;
  tools?: Record<string, boolean>;
  permissions?: ToolPermissions;
  tags?: string[];
  supportsVision?: boolean;
  supportsWeb?: boolean;
  injectRepoContext?: boolean;
  extends?: string;
  compose?: string[];
  license?: string;
  metadata?: Record<string, unknown>;
}

export type SkillSource =
  | { type: "builtin" }
  | { type: "global"; path: string }
  | { type: "project"; path: string };

export interface Skill {
  id: string;
  source: SkillSource;
  frontmatter: SkillFrontmatter;
  systemPrompt: string;
  filePath: string;
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillInput {
  id: string;
  frontmatter: Omit<SkillFrontmatter, "name"> & { name?: string };
  systemPrompt: string;
}

export type SkillScope = "project" | "global";

export type SkillEvent =
  | { type: "skill.created"; skill: Skill }
  | { type: "skill.updated"; skill: Skill }
  | { type: "skill.deleted"; id: string; scope: SkillScope };
