import { isPlainObject } from "../../helpers/format";
import type { OrchestratorConfig, OrchestratorConfigFile } from "../../types";

/**
 * Schema field definition for validation.
 * Each field specifies its expected type and optional allowed values for enums.
 */
type FieldSchema =
  | { type: "boolean" }
  | { type: "string" }
  | { type: "number" }
  | { type: "enum"; values: readonly string[] };

/**
 * Schema definition for an object with optional nested objects.
 */
type ObjectSchema = {
  fields?: Record<string, FieldSchema>;
  nested?: Record<string, ObjectSchema>;
};

/**
 * Validates and extracts fields from a source object based on a schema definition.
 * Only copies values that match the expected type.
 *
 * @param source - The source object to extract values from
 * @param schema - The schema defining expected fields and nested objects
 * @returns A validated object with only the fields that passed type checks
 */
function validateObject(source: Record<string, unknown>, schema: ObjectSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Validate simple fields
  if (schema.fields) {
    for (const [key, fieldSchema] of Object.entries(schema.fields)) {
      const value = source[key];

      if (fieldSchema.type === "boolean" && typeof value === "boolean") {
        result[key] = value;
      } else if (fieldSchema.type === "string" && typeof value === "string") {
        result[key] = value;
      } else if (fieldSchema.type === "number" && typeof value === "number") {
        result[key] = value;
      } else if (fieldSchema.type === "enum" && fieldSchema.values.includes(value as string)) {
        result[key] = value;
      }
    }
  }

  // Validate nested objects
  if (schema.nested) {
    for (const [key, nestedSchema] of Object.entries(schema.nested)) {
      if (isPlainObject(source[key])) {
        const nestedResult = validateObject(source[key], nestedSchema);
        if (Object.keys(nestedResult).length > 0) {
          result[key] = nestedResult;
        }
      }
    }
  }

  return result;
}

// Schema definitions for each section

const memorySchema: ObjectSchema = {
  fields: {
    enabled: { type: "boolean" },
    autoSpawn: { type: "boolean" },
    autoRecord: { type: "boolean" },
    autoInject: { type: "boolean" },
    scope: { type: "enum", values: ["project", "global"] as const },
    maxChars: { type: "number" },
  },
  nested: {
    summaries: {
      fields: {
        enabled: { type: "boolean" },
        sessionMaxChars: { type: "number" },
        projectMaxChars: { type: "number" },
      },
    },
    trim: {
      fields: {
        maxMessagesPerSession: { type: "number" },
        maxMessagesPerProject: { type: "number" },
        maxMessagesGlobal: { type: "number" },
        maxProjectsGlobal: { type: "number" },
      },
    },
    inject: {
      fields: {
        maxChars: { type: "number" },
        maxEntries: { type: "number" },
        includeMessages: { type: "boolean" },
        includeSessionSummary: { type: "boolean" },
        includeProjectSummary: { type: "boolean" },
        includeGlobal: { type: "boolean" },
        maxGlobalEntries: { type: "number" },
      },
    },
  },
};

const integrationsSchema: ObjectSchema = {
  nested: {
    linear: {
      fields: {
        enabled: { type: "boolean" },
        apiKey: { type: "string" },
        teamId: { type: "string" },
        apiUrl: { type: "string" },
        projectPrefix: { type: "string" },
      },
    },
    neo4j: {
      fields: {
        enabled: { type: "boolean" },
        uri: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
        database: { type: "string" },
      },
    },
    monitoring: {
      fields: {
        enabled: { type: "boolean" },
        port: { type: "number" },
        metricsPath: { type: "string" },
      },
    },
  },
};

const telemetrySchema: ObjectSchema = {
  fields: {
    enabled: { type: "boolean" },
    apiKey: { type: "string" },
    host: { type: "string" },
  },
};

// Exported functions using the generic validation helpers

export function parseMemorySection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.memory)) return;
  partial.memory = validateObject(raw.memory, memorySchema) as OrchestratorConfig["memory"];
}

export function parseIntegrationsSection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.integrations)) return;
  const validated = validateObject(raw.integrations, integrationsSchema) as Record<string, unknown>;
  const passthrough = raw.integrations as Record<string, unknown>;
  const knownKeys = new Set(Object.keys(integrationsSchema.nested ?? {}));
  for (const [key, value] of Object.entries(passthrough)) {
    if (!knownKeys.has(key)) {
      validated[key] = value;
    }
  }
  partial.integrations = validated as OrchestratorConfig["integrations"];
}

export function parseTelemetrySection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.telemetry)) return;
  partial.telemetry = validateObject(raw.telemetry, telemetrySchema) as OrchestratorConfig["telemetry"];
}
