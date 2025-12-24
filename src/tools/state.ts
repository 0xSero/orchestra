import type { PluginInput } from "@opencode-ai/plugin";
import type { OrchestratorConfig, WorkerProfile } from "../types";
import { builtInProfiles } from "../config/profiles";

export type ToolContext = {
  agent?: string;
  sessionID?: string;
  messageID?: string;
};

let directory = process.cwd();
let worktree: string | undefined;
let projectId: string | undefined;
let client: PluginInput["client"] | undefined;
let spawnDefaults = { basePort: 14096, timeout: 30000 };
let profiles: Record<string, WorkerProfile> = builtInProfiles;
let defaultListFormat: "markdown" | "json" = "markdown";
let workflowsConfig: OrchestratorConfig["workflows"] | undefined;
let securityConfig: OrchestratorConfig["security"] | undefined;
let modelSelection: OrchestratorConfig["modelSelection"] | undefined;
let modelAliases: OrchestratorConfig["modelAliases"] | undefined;
let spawnPolicy: OrchestratorConfig["spawnPolicy"] | undefined;

export function getDirectory(): string {
  return directory;
}

export function getWorktree(): string | undefined {
  return worktree;
}

export function getProjectId(): string | undefined {
  return projectId;
}

export function getClient(): PluginInput["client"] | undefined {
  return client;
}

export function getSpawnDefaults(): { basePort: number; timeout: number } {
  return spawnDefaults;
}

export function getProfiles(): Record<string, WorkerProfile> {
  return profiles;
}

export function getDefaultListFormat(): "markdown" | "json" {
  return defaultListFormat;
}

export function getWorkflowsConfig(): OrchestratorConfig["workflows"] | undefined {
  return workflowsConfig;
}

export function getSecurityConfig(): OrchestratorConfig["security"] | undefined {
  return securityConfig;
}

export function getModelSelection(): OrchestratorConfig["modelSelection"] | undefined {
  return modelSelection;
}

export function getModelAliases(): OrchestratorConfig["modelAliases"] | undefined {
  return modelAliases;
}

export function getSpawnPolicy(): OrchestratorConfig["spawnPolicy"] | undefined {
  return spawnPolicy;
}

export function setDirectory(dir: string) {
  directory = dir;
}

export function setWorktree(next: string | undefined) {
  worktree = next;
}

export function setProjectId(next: string) {
  projectId = next;
}

export function setClient(next: PluginInput["client"]) {
  client = next;
}

export function setSpawnDefaults(input: { basePort: number; timeout: number }) {
  spawnDefaults = input;
}

export function setProfiles(next: Record<string, WorkerProfile>) {
  profiles = next;
}

export function setUiDefaults(input: { defaultListFormat?: "markdown" | "json" }) {
  if (input.defaultListFormat) defaultListFormat = input.defaultListFormat;
}

export function setWorkflowConfig(next: OrchestratorConfig["workflows"] | undefined) {
  workflowsConfig = next;
}

export function setSecurityConfig(next: OrchestratorConfig["security"] | undefined) {
  securityConfig = next;
}

export function setModelSelection(next: OrchestratorConfig["modelSelection"] | undefined) {
  modelSelection = next;
}

export function setModelAliases(next: OrchestratorConfig["modelAliases"] | undefined) {
  modelAliases = next;
}

export function setSpawnPolicy(next: OrchestratorConfig["spawnPolicy"] | undefined) {
  spawnPolicy = next;
}
