import type { ToolPermissions } from "../types";

export type { ToolPermissions };

export type PermissionCategory = "full" | "read" | "none";
export type ExecutionPermission = "full" | "sandboxed" | "none";
export type NetworkPermission = "full" | "localhost" | "none";

export const defaultToolPermissions: ToolPermissions = {};
