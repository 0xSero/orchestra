import type { OrchestratorConfig } from "../types";
import { registerWorkflow } from "./engine";
import { buildRooCodeBoomerangWorkflow } from "./roocode-boomerang";
import { buildBuiltinWorkflows } from "./builtins";

let loaded = false;

export function loadWorkflows(config: OrchestratorConfig) {
  if (loaded) return;
  loaded = true;

  if (config.workflows?.enabled === false) return;

  const roocode = config.workflows?.roocodeBoomerang;
  if (roocode?.enabled !== false) {
    registerWorkflow(buildRooCodeBoomerangWorkflow(roocode?.steps));
  }

  for (const workflow of buildBuiltinWorkflows()) {
    registerWorkflow(workflow);
  }
}
