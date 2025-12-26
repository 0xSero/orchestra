export type WorkflowSecurityConfig = {
  /** Maximum steps allowed in a workflow */
  maxSteps?: number;
  /** Maximum characters allowed in the initial task */
  maxTaskChars?: number;
  /** Maximum characters allowed to carry between steps */
  maxCarryChars?: number;
  /** Timeout per step (ms) */
  perStepTimeoutMs?: number;
};

export type WorkflowStepConfig = {
  id: string;
  title?: string;
  workerId?: string;
  prompt?: string;
  carry?: boolean;
};

export type WorkflowsConfig = {
  enabled?: boolean;
  roocodeBoomerang?: {
    enabled?: boolean;
    steps?: WorkflowStepConfig[];
    maxSteps?: number;
    maxTaskChars?: number;
    maxCarryChars?: number;
    perStepTimeoutMs?: number;
  };
};

export type SecurityConfig = {
  workflows?: WorkflowSecurityConfig;
};
