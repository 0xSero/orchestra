export type TelemetryConfig = {
  enabled?: boolean;
  /** PostHog API key (or set POSTHOG_API_KEY env var) */
  apiKey?: string;
  /** PostHog host (default: https://us.i.posthog.com) */
  host?: string;
};

export type LinearIntegrationConfig = {
  enabled?: boolean;
  apiKey?: string;
  teamId?: string;
  apiUrl?: string;
  projectPrefix?: string;
};

export type Neo4jIntegrationConfig = {
  enabled?: boolean;
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
};

export type MonitoringIntegrationConfig = {
  enabled?: boolean;
  port?: number;
  metricsPath?: string;
};

export type IntegrationsConfig = {
  linear?: LinearIntegrationConfig;
  neo4j?: Neo4jIntegrationConfig;
  monitoring?: MonitoringIntegrationConfig;
};
