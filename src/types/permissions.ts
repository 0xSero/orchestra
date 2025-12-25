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
