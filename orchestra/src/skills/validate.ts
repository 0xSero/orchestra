import type {
  SkillFrontmatter,
  SkillInput,
  SkillValidationError,
  SkillValidationResult,
  ToolPermissions,
} from "../types";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((v) => typeof v === "boolean");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function validatePermissions(permissions: unknown, errors: SkillValidationError[]): ToolPermissions | undefined {
  if (!permissions) return undefined;
  if (!isPlainObject(permissions)) {
    errors.push({ field: "permissions", message: "Permissions must be an object." });
    return undefined;
  }

  const out: ToolPermissions = {};

  if (isPlainObject(permissions.categories)) {
    out.categories = {};
    const categories = permissions.categories as Record<string, unknown>;
    if (categories.filesystem === "full" || categories.filesystem === "read" || categories.filesystem === "none") {
      out.categories.filesystem = categories.filesystem;
    } else if (categories.filesystem !== undefined) {
      errors.push({ field: "permissions.categories.filesystem", message: "Invalid filesystem category." });
    }
    if (categories.execution === "full" || categories.execution === "sandboxed" || categories.execution === "none") {
      out.categories.execution = categories.execution;
    } else if (categories.execution !== undefined) {
      errors.push({ field: "permissions.categories.execution", message: "Invalid execution category." });
    }
    if (categories.network === "full" || categories.network === "localhost" || categories.network === "none") {
      out.categories.network = categories.network;
    } else if (categories.network !== undefined) {
      errors.push({ field: "permissions.categories.network", message: "Invalid network category." });
    }
  } else if (permissions.categories !== undefined) {
    errors.push({ field: "permissions.categories", message: "Permissions categories must be an object." });
  }

  if (isPlainObject(permissions.tools)) {
    out.tools = {};
    for (const [toolId, cfg] of Object.entries(permissions.tools as Record<string, unknown>)) {
      if (!isPlainObject(cfg) || typeof cfg.enabled !== "boolean") {
        errors.push({ field: `permissions.tools.${toolId}`, message: "Tool permission must include enabled boolean." });
        continue;
      }
      out.tools[toolId] = {
        enabled: cfg.enabled,
        constraints: isPlainObject(cfg.constraints) ? (cfg.constraints as Record<string, unknown>) : undefined,
      };
    }
  } else if (permissions.tools !== undefined) {
    errors.push({ field: "permissions.tools", message: "Permissions tools must be an object." });
  }

  if (isPlainObject(permissions.paths)) {
    const paths = permissions.paths as Record<string, unknown>;
    const allowed = paths.allowed;
    const denied = paths.denied;
    if ((allowed !== undefined && !isStringArray(allowed)) || (denied !== undefined && !isStringArray(denied))) {
      errors.push({ field: "permissions.paths", message: "Permissions paths must be string arrays." });
    } else if (allowed || denied) {
      out.paths = { allowed: allowed as string[] | undefined, denied: denied as string[] | undefined };
    }
  } else if (permissions.paths !== undefined) {
    errors.push({ field: "permissions.paths", message: "Permissions paths must be an object." });
  }

  return out;
}

export function validateSkillFrontmatter(frontmatter: SkillFrontmatter): SkillValidationResult {
  const errors: SkillValidationError[] = [];

  if (!frontmatter.name || typeof frontmatter.name !== "string") {
    errors.push({ field: "name", message: "Name is required." });
  } else {
    if (!NAME_PATTERN.test(frontmatter.name)) {
      errors.push({ field: "name", message: "Name must be lowercase alphanumeric with single hyphens." });
    }
    if (frontmatter.name.length < 1 || frontmatter.name.length > 64) {
      errors.push({ field: "name", message: "Name must be 1-64 characters." });
    }
  }

  if (!frontmatter.description || typeof frontmatter.description !== "string") {
    errors.push({ field: "description", message: "Description is required." });
  } else if (frontmatter.description.length < 1 || frontmatter.description.length > 1024) {
    errors.push({ field: "description", message: "Description must be 1-1024 characters." });
  }

  if (!frontmatter.model || typeof frontmatter.model !== "string") {
    errors.push({ field: "model", message: "Model is required." });
  }

  if (frontmatter.temperature !== undefined) {
    if (typeof frontmatter.temperature !== "number" || frontmatter.temperature < 0 || frontmatter.temperature > 2) {
      errors.push({ field: "temperature", message: "Temperature must be a number between 0 and 2." });
    }
  }

  if (frontmatter.tools !== undefined && !isBooleanRecord(frontmatter.tools)) {
    errors.push({ field: "tools", message: "Tools must be a record of booleans." });
  }

  if (frontmatter.tags !== undefined && !isStringArray(frontmatter.tags)) {
    errors.push({ field: "tags", message: "Tags must be an array of strings." });
  }

  if (frontmatter.supportsVision !== undefined && typeof frontmatter.supportsVision !== "boolean") {
    errors.push({ field: "supportsVision", message: "supportsVision must be boolean." });
  }

  if (frontmatter.supportsWeb !== undefined && typeof frontmatter.supportsWeb !== "boolean") {
    errors.push({ field: "supportsWeb", message: "supportsWeb must be boolean." });
  }

  if (frontmatter.injectRepoContext !== undefined && typeof frontmatter.injectRepoContext !== "boolean") {
    errors.push({ field: "injectRepoContext", message: "injectRepoContext must be boolean." });
  }

  if (frontmatter.extends !== undefined && typeof frontmatter.extends !== "string") {
    errors.push({ field: "extends", message: "extends must be a string." });
  }

  if (frontmatter.compose !== undefined && !isStringArray(frontmatter.compose)) {
    errors.push({ field: "compose", message: "compose must be an array of strings." });
  }

  validatePermissions(frontmatter.permissions, errors);

  return { valid: errors.length === 0, errors };
}

export function validateSkillInput(input: SkillInput): SkillValidationResult {
  const errors: SkillValidationError[] = [];

  if (!input.id || typeof input.id !== "string") {
    errors.push({ field: "id", message: "ID is required." });
  } else {
    if (!NAME_PATTERN.test(input.id)) {
      errors.push({ field: "id", message: "ID must be lowercase alphanumeric with single hyphens." });
    }
    if (input.id.length < 1 || input.id.length > 64) {
      errors.push({ field: "id", message: "ID must be 1-64 characters." });
    }
  }

  if (typeof input.systemPrompt !== "string") {
    errors.push({ field: "systemPrompt", message: "System prompt must be a string." });
  }

  const frontmatter = {
    ...input.frontmatter,
    name: input.frontmatter.name ?? input.id,
  } as SkillFrontmatter;

  const frontmatterResult = validateSkillFrontmatter(frontmatter);
  errors.push(...frontmatterResult.errors);

  return { valid: errors.length === 0, errors };
}
