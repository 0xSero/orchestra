export type DbUser = {
  id: string;
  onboarded: boolean;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkerConfig = {
  id: string;
  userId: string;
  workerId: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  updatedAt: string;
};

export type DbSnapshot = {
  dbPath: string;
  user: DbUser | null;
  preferences: Record<string, string | null>;
  workerConfigs: WorkerConfig[];
};
