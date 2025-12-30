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

export interface AgentFrontmatter {
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

export type AgentSource = { type: "builtin" } | { type: "global"; path: string } | { type: "project"; path: string };

export interface AgentProfile {
  id: string;
  source: AgentSource;
  frontmatter: AgentFrontmatter;
  systemPrompt: string;
  filePath: string;
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentInput {
  id: string;
  frontmatter: Omit<AgentFrontmatter, "name"> & { name?: string };
  systemPrompt: string;
}

export type AgentScope = "project" | "global";

export type AgentEvent =
  | { type: "agent.created"; agent: AgentProfile }
  | { type: "agent.updated"; agent: AgentProfile }
  | { type: "agent.deleted"; id: string; scope: AgentScope };
