export type HealthResult = {
  ok: boolean;
  info?: unknown;
};

export type ServiceLifecycle = {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<HealthResult>;
};

export type Factory<TConfig, TDeps, TService> = (input: { config: TConfig; deps: TDeps }) => TService;
