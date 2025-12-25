import type { OrchestratorConfig, OrchestratorConfigFile } from "../../types";
import { isPlainObject } from "../../helpers/format";

export function parseMemorySection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.memory)) return;
  const memory: Record<string, unknown> = {};
  if (typeof raw.memory.enabled === "boolean") memory.enabled = raw.memory.enabled;
  if (typeof raw.memory.autoSpawn === "boolean") memory.autoSpawn = raw.memory.autoSpawn;
  if (typeof raw.memory.autoRecord === "boolean") memory.autoRecord = raw.memory.autoRecord;
  if (typeof raw.memory.autoInject === "boolean") memory.autoInject = raw.memory.autoInject;
  if (raw.memory.scope === "project" || raw.memory.scope === "global") memory.scope = raw.memory.scope;
  if (typeof raw.memory.maxChars === "number") memory.maxChars = raw.memory.maxChars;

  if (isPlainObject(raw.memory.summaries)) {
    const summaries: Record<string, unknown> = {};
    if (typeof raw.memory.summaries.enabled === "boolean") summaries.enabled = raw.memory.summaries.enabled;
    if (typeof raw.memory.summaries.sessionMaxChars === "number") summaries.sessionMaxChars = raw.memory.summaries.sessionMaxChars;
    if (typeof raw.memory.summaries.projectMaxChars === "number") summaries.projectMaxChars = raw.memory.summaries.projectMaxChars;
    memory.summaries = summaries;
  }

  if (isPlainObject(raw.memory.trim)) {
    const trim: Record<string, unknown> = {};
    if (typeof raw.memory.trim.maxMessagesPerSession === "number") trim.maxMessagesPerSession = raw.memory.trim.maxMessagesPerSession;
    if (typeof raw.memory.trim.maxMessagesPerProject === "number") trim.maxMessagesPerProject = raw.memory.trim.maxMessagesPerProject;
    if (typeof raw.memory.trim.maxMessagesGlobal === "number") trim.maxMessagesGlobal = raw.memory.trim.maxMessagesGlobal;
    if (typeof raw.memory.trim.maxProjectsGlobal === "number") trim.maxProjectsGlobal = raw.memory.trim.maxProjectsGlobal;
    memory.trim = trim;
  }

  if (isPlainObject(raw.memory.inject)) {
    const inject: Record<string, unknown> = {};
    if (typeof raw.memory.inject.maxChars === "number") inject.maxChars = raw.memory.inject.maxChars;
    if (typeof raw.memory.inject.maxEntries === "number") inject.maxEntries = raw.memory.inject.maxEntries;
    if (typeof raw.memory.inject.includeMessages === "boolean") inject.includeMessages = raw.memory.inject.includeMessages;
    if (typeof raw.memory.inject.includeSessionSummary === "boolean") inject.includeSessionSummary = raw.memory.inject.includeSessionSummary;
    if (typeof raw.memory.inject.includeProjectSummary === "boolean") inject.includeProjectSummary = raw.memory.inject.includeProjectSummary;
    if (typeof raw.memory.inject.includeGlobal === "boolean") inject.includeGlobal = raw.memory.inject.includeGlobal;
    if (typeof raw.memory.inject.maxGlobalEntries === "number") inject.maxGlobalEntries = raw.memory.inject.maxGlobalEntries;
    memory.inject = inject;
  }

  partial.memory = memory as OrchestratorConfig["memory"];
}

export function parseIntegrationsSection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.integrations)) return;
  const integrations: Record<string, unknown> = {};
  if (isPlainObject(raw.integrations.linear)) {
    const linear: Record<string, unknown> = {};
    if (typeof raw.integrations.linear.enabled === "boolean") linear.enabled = raw.integrations.linear.enabled;
    if (typeof raw.integrations.linear.apiKey === "string") linear.apiKey = raw.integrations.linear.apiKey;
    if (typeof raw.integrations.linear.teamId === "string") linear.teamId = raw.integrations.linear.teamId;
    if (typeof raw.integrations.linear.apiUrl === "string") linear.apiUrl = raw.integrations.linear.apiUrl;
    if (typeof raw.integrations.linear.projectPrefix === "string") {
      linear.projectPrefix = raw.integrations.linear.projectPrefix;
    }
    integrations.linear = linear;
  }
  if (isPlainObject(raw.integrations.neo4j)) {
    const neo4j: Record<string, unknown> = {};
    if (typeof raw.integrations.neo4j.enabled === "boolean") neo4j.enabled = raw.integrations.neo4j.enabled;
    if (typeof raw.integrations.neo4j.uri === "string") neo4j.uri = raw.integrations.neo4j.uri;
    if (typeof raw.integrations.neo4j.username === "string") neo4j.username = raw.integrations.neo4j.username;
    if (typeof raw.integrations.neo4j.password === "string") neo4j.password = raw.integrations.neo4j.password;
    if (typeof raw.integrations.neo4j.database === "string") neo4j.database = raw.integrations.neo4j.database;
    integrations.neo4j = neo4j;
  }
  if (isPlainObject(raw.integrations.monitoring)) {
    const monitoring: Record<string, unknown> = {};
    if (typeof raw.integrations.monitoring.enabled === "boolean") monitoring.enabled = raw.integrations.monitoring.enabled;
    if (typeof raw.integrations.monitoring.port === "number") monitoring.port = raw.integrations.monitoring.port;
    if (typeof raw.integrations.monitoring.metricsPath === "string") {
      monitoring.metricsPath = raw.integrations.monitoring.metricsPath;
    }
    integrations.monitoring = monitoring;
  }
  partial.integrations = integrations as OrchestratorConfig["integrations"];
}

export function parseTelemetrySection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.telemetry)) return;
  const telemetry: Record<string, unknown> = {};
  if (typeof raw.telemetry.enabled === "boolean") telemetry.enabled = raw.telemetry.enabled;
  if (typeof raw.telemetry.apiKey === "string") telemetry.apiKey = raw.telemetry.apiKey;
  if (typeof raw.telemetry.host === "string") telemetry.host = raw.telemetry.host;
  partial.telemetry = telemetry as OrchestratorConfig["telemetry"];
}
