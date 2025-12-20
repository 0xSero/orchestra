import { boomerangWorkflow } from "./boomerang";
import { workflowEngine } from "../core/workflow";

export function registerDefaultWorkflows() {
    workflowEngine.registerWorkflow(boomerangWorkflow);
}

export { boomerangWorkflow };
