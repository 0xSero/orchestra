/**
 * Task Args Builder - Safe argument construction for task_start/await/peek/cancel commands
 *
 * This module provides type-safe builders for constructing orchestrator task command arguments.
 * All values are properly escaped to prevent injection attacks.
 */

export type TaskKind = "auto" | "worker" | "workflow" | "op";
export type OpKind =
  | "memory.put"
  | "memory.link"
  | "memory.done"
  | "worker.model.set"
  | "worker.model.reset";
export type ModelPolicy = "dynamic" | "sticky";
export type MemoryScope = "project" | "global";

export type MemoryOpPayload = {
  taskId?: string;
  scope?: MemoryScope;
  key?: string;
  value?: string;
  tags?: string[];
  fromKey?: string;
  toKey?: string;
  relation?: string;
  summary?: string;
  storedKeys?: string[];
  linkedKeys?: Array<{ from: string; to: string; relation: string }>;
  notes?: string;
};

export type WorkerOpPayload = {
  workerId?: string;
  model?: string;
  modelPolicy?: ModelPolicy;
  respawn?: boolean;
};

export type TaskStartArgs = {
  kind: TaskKind;
  task: string;
  // Worker-specific
  workerId?: string;
  model?: string;
  modelPolicy?: ModelPolicy;
  // Workflow-specific
  workflowId?: string;
  continueRunId?: string;
  // Op-specific
  op?: OpKind;
  memory?: MemoryOpPayload;
  worker?: WorkerOpPayload;
  // Common options
  autoSpawn?: boolean;
  timeoutMs?: number;
  from?: string;
};

export type TaskAwaitArgs = {
  taskId?: string;
  taskIds?: string[];
  timeoutMs?: number;
};

export type TaskPeekArgs = {
  taskId?: string;
  taskIds?: string[];
};

export type TaskCancelArgs = {
  taskId?: string;
  taskIds?: string[];
  reason?: string;
};

/**
 * Escape a string value for safe inclusion in command arguments.
 * - Escapes backslashes before quotes
 * - Escapes double quotes
 * - Replaces newlines with spaces
 */
export function escapeArgValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, '\\"') // Then escape quotes
    .replace(/\n/g, " "); // Replace newlines with spaces
}

/**
 * Build arguments for task_start command.
 */
export function buildTaskStartArgs(args: TaskStartArgs): string {
  const parts: string[] = [];

  // Kind is always first
  parts.push(`--kind ${args.kind}`);

  // Kind-specific options
  switch (args.kind) {
    case "worker":
      if (args.workerId) {
        parts.push(`--workerId ${args.workerId}`);
      }
      if (args.model) {
        parts.push(`--model "${escapeArgValue(args.model)}"`);
      }
      if (args.modelPolicy) {
        parts.push(`--modelPolicy ${args.modelPolicy}`);
      }
      break;

    case "workflow":
      if (args.workflowId) {
        parts.push(`--workflowId ${args.workflowId}`);
      }
      if (args.continueRunId) {
        parts.push(`--continueRunId ${args.continueRunId}`);
      }
      break;

    case "op":
      if (args.op) {
        parts.push(`--op ${args.op}`);
      }
      if (args.memory) {
        // Serialize memory payload as JSON
        const memoryJson = JSON.stringify(args.memory);
        parts.push(`--memory '${memoryJson}'`);
      }
      if (args.worker) {
        // Serialize worker payload as JSON
        const workerJson = JSON.stringify(args.worker);
        parts.push(`--worker '${workerJson}'`);
      }
      break;

    case "auto":
    default:
      // No additional options for auto
      break;
  }

  // Common options
  if (args.autoSpawn === false) {
    parts.push(`--autoSpawn false`);
  }
  if (args.timeoutMs !== undefined) {
    parts.push(`--timeoutMs ${args.timeoutMs}`);
  }
  if (args.from) {
    parts.push(`--from ${args.from}`);
  }

  // Task is always last for readability
  parts.push(`--task "${escapeArgValue(args.task)}"`);

  return parts.join(" ");
}

/**
 * Build arguments for task_await command.
 */
export function buildTaskAwaitArgs(args: TaskAwaitArgs): string {
  const parts: string[] = [];

  if (args.taskId) {
    parts.push(`--taskId ${args.taskId}`);
  } else if (args.taskIds && args.taskIds.length > 0) {
    for (const id of args.taskIds) {
      parts.push(`--taskIds ${id}`);
    }
  }

  if (args.timeoutMs !== undefined) {
    parts.push(`--timeoutMs ${args.timeoutMs}`);
  }

  return parts.join(" ");
}

/**
 * Build arguments for task_peek command.
 */
export function buildTaskPeekArgs(args: TaskPeekArgs): string {
  const parts: string[] = [];

  if (args.taskId) {
    parts.push(`--taskId ${args.taskId}`);
  } else if (args.taskIds && args.taskIds.length > 0) {
    for (const id of args.taskIds) {
      parts.push(`--taskIds ${id}`);
    }
  }

  return parts.join(" ");
}

/**
 * Build arguments for task_cancel command.
 */
export function buildTaskCancelArgs(args: TaskCancelArgs): string {
  const parts: string[] = [];

  if (args.taskId) {
    parts.push(`--taskId ${args.taskId}`);
  } else if (args.taskIds && args.taskIds.length > 0) {
    for (const id of args.taskIds) {
      parts.push(`--taskIds ${id}`);
    }
  }

  if (args.reason) {
    parts.push(`--reason "${escapeArgValue(args.reason)}"`);
  }

  return parts.join(" ");
}
