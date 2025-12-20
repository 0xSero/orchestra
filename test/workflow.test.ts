import { workflowEngine } from "../src/core/workflow";
import { registerDefaultWorkflows } from "../src/workflows/index";
import { describe, it, expect, mock } from "bun:test";

// Mock sendToWorker
mock.module("../src/workers/spawner", () => {
    return {
        sendToWorker: async (workerId: string, message: string) => {
            return {
                success: true,
                response: `[${workerId}] Processed: ${message}`
            };
        }
    };
});

describe("Workflow Engine", () => {
    it("should run boomerang workflow", async () => {
        registerDefaultWorkflows();
        
        const instance = await workflowEngine.startWorkflow("roocode-boomerang", "Initial Input");
        
        // Wait for completion
        await new Promise<void>((resolve) => {
            workflowEngine.on("workflow:completed", (data) => {
                if (data.workflow.id === instance.id) resolve();
            });
        });

        expect(instance.status).toBe("completed");
        // Check if the result contains processing from all workers in the chain (architect -> coder -> reviewer)
        expect(instance.result).toContain("[reviewer] Processed: [coder] Processed: [architect] Processed: Initial Input");
    });
});
