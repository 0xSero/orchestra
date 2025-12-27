import type { OrchestratorConfig } from "../types";
import { buildBuiltinWorkflows } from "./builtins";
import { registerWorkflow } from "./engine";
import { buildRooCodeBoomerangWorkflow } from "./roocode-boomerang";

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
