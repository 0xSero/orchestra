import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { WorkflowConfig, WorkflowInstance } from "../types";
import { sendToWorker } from "../workers/spawner";

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowConfig> = new Map();
  private instances: Map<string, WorkflowInstance> = new Map();

  constructor() {
    super();
  }

  registerWorkflow(config: WorkflowConfig) {
    this.workflows.set(config.id, config);
  }

  getWorkflow(id: string) {
    return this.workflows.get(id);
  }

  async startWorkflow(configId: string, initialInput: string, overrides?: { workerChain?: string[] }): Promise<WorkflowInstance> {
    const config = this.workflows.get(configId);
    if (!config) throw new Error(`Workflow config "${configId}" not found`);

    const instance: WorkflowInstance = {
      id: randomUUID(),
      configId,
      status: "running",
      history: [],
      startedAt: new Date(),
    };
    this.instances.set(instance.id, instance);
    this.emit("workflow:started", { workflow: instance });

    // Start execution in background
    this.executeWorkflow(instance, config, initialInput, overrides).catch(err => {
        instance.status = "failed";
        instance.error = err.message;
        this.emit("workflow:failed", { workflow: instance, error: err.message });
    });

    return instance;
  }

  private async executeWorkflow(instance: WorkflowInstance, config: WorkflowConfig, input: string, overrides?: { workerChain?: string[] }) {
    try {
        if (config.type === "boomerang") {
             await this.executeBoomerang(instance, config, input, overrides);
        } else {
            throw new Error(`Workflow type "${config.type}" not implemented`);
        }
    } catch (error) {
        instance.status = "failed";
        instance.error = error instanceof Error ? error.message : String(error);
        this.emit("workflow:failed", { workflow: instance, error: instance.error });
    }
  }

  private async executeBoomerang(instance: WorkflowInstance, config: WorkflowConfig, input: string, overrides?: { workerChain?: string[] }) {
      let currentInput = input;
      const chain = overrides?.workerChain || config.workerChain || [];

      if (chain.length === 0) {
          throw new Error("No worker chain defined for boomerang workflow");
      }

      for (const workerId of chain) {
          const stepId = `${workerId}-${Date.now()}`;
          instance.currentStepId = stepId;
          this.emit("workflow:step", { workflow: instance, stepId });

          // Send to worker
          // We assume sendToWorker handles the complexity of timeouts and connection
          const result = await sendToWorker(workerId, currentInput);
          if (!result.success) {
              throw new Error(`Worker "${workerId}" failed: ${result.error}`);
          }

          const output = result.response || "";
          instance.history.push({ stepId, output, timestamp: new Date() });
          currentInput = output; // Output becomes input for next
      }

      instance.status = "completed";
      instance.result = currentInput;
      instance.completedAt = new Date();
      this.emit("workflow:completed", { workflow: instance, result: currentInput });
  }
}

export const workflowEngine = new WorkflowEngine();
