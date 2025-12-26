import { join } from "node:path";
import { getUserConfigDir } from "../../helpers/format";

export function getDefaultGlobalOrchestratorConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "orchestrator.json");
}

export function getDefaultGlobalOpenCodeConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "opencode.json");
}

export function getDefaultProjectOrchestratorConfigPath(directory: string): string {
  return join(directory, ".opencode", "orchestrator.json");
}
