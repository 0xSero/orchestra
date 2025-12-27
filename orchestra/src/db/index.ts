import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Factory, ServiceLifecycle } from "../types";
import {
  CREATE_TABLES_SQL,
  type Preference,
  rowToUser,
  rowToWorkerConfig,
  SCHEMA_VERSION,
  type User,
  type UserRow,
  type WorkerConfig,
  type WorkerConfigRow,
} from "./schema";

export type DatabaseConfig = {
  directory: string;
  filename?: string;
};

export type DatabaseService = ServiceLifecycle & {
  // User operations
  getUser(): User | null;
  createUser(): User;
  markOnboarded(): User;

  // Preference operations
  getPreference(key: string): string | null;
  setPreference(key: string, value: string | null): void;
  getAllPreferences(): Record<string, string | null>;
  deletePreference(key: string): void;

  // Worker config operations
  getWorkerConfig(workerId: string): WorkerConfig | null;
  setWorkerConfig(
    workerId: string,
    config: Partial<Omit<WorkerConfig, "id" | "userId" | "workerId" | "updatedAt">>,
  ): void;
  getAllWorkerConfigs(): WorkerConfig[];
  clearWorkerConfig(workerId: string): void;

  // Utility
  isOnboarded(): boolean;
  getDbPath(): string;
};

export const createDatabase: Factory<DatabaseConfig, Record<string, never>, DatabaseService> = ({ config }) => {
  const dbPath = join(config.directory, ".opencode", config.filename ?? "user.db");
  let db: Database | null = null;

  const ensureUser = (): string => {
    if (!db) throw new Error("Database not initialized");

    const existing = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined;
    if (existing) return existing.id;

    const id = crypto.randomUUID().replace(/-/g, "");
    db.prepare("INSERT INTO users (id) VALUES (?)").run(id);
    return id;
  };

  const getUserId = (): string => {
    if (!db) throw new Error("Database not initialized");
    const row = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined;
    if (!row) throw new Error("No user found");
    return row.id;
  };

  const getUser = (): User | null => {
    if (!db) return null;
    const row = db.prepare("SELECT * FROM users LIMIT 1").get() as UserRow | undefined;
    return row ? rowToUser(row) : null;
  };

  const createUser = (): User => {
    if (!db) throw new Error("Database not initialized");
    const id = ensureUser();
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
    return rowToUser(row);
  };

  const markOnboarded = (): User => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare(`
      UPDATE users
      SET onboarded = 1, onboarded_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(userId);
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow;
    return rowToUser(row);
  };

  const getPreference = (key: string): string | null => {
    if (!db) return null;
    const userId = getUserId();
    const row = db.prepare("SELECT value FROM preferences WHERE user_id = ? AND key = ?").get(userId, key) as
      | { value: string | null }
      | undefined;
    return row?.value ?? null;
  };

  const setPreference = (key: string, value: string | null): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare(`
      INSERT INTO preferences (id, user_id, key, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(crypto.randomUUID().replace(/-/g, ""), userId, key, value);
  };

  const getAllPreferences = (): Record<string, string | null> => {
    if (!db) return {};
    const userId = getUserId();
    const rows = db.prepare("SELECT key, value FROM preferences WHERE user_id = ?").all(userId) as Array<{
      key: string;
      value: string | null;
    }>;
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  };

  const deletePreference = (key: string): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare("DELETE FROM preferences WHERE user_id = ? AND key = ?").run(userId, key);
  };

  const getWorkerConfig = (workerId: string): WorkerConfig | null => {
    if (!db) return null;
    const userId = getUserId();
    const row = db.prepare("SELECT * FROM worker_config WHERE user_id = ? AND worker_id = ?").get(userId, workerId) as
      | WorkerConfigRow
      | undefined;
    return row ? rowToWorkerConfig(row) : null;
  };

  const setWorkerConfig = (
    workerId: string,
    cfg: Partial<Omit<WorkerConfig, "id" | "userId" | "workerId" | "updatedAt">>,
  ): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();

    const existing = db
      .prepare("SELECT id FROM worker_config WHERE user_id = ? AND worker_id = ?")
      .get(userId, workerId) as { id: string } | undefined;

    if (existing) {
      const updates: string[] = [];
      const values: Array<string | number | null> = [];

      if (cfg.model !== undefined) {
        updates.push("model = ?");
        values.push(cfg.model);
      }
      if (cfg.temperature !== undefined) {
        updates.push("temperature = ?");
        values.push(cfg.temperature);
      }
      if (cfg.maxTokens !== undefined) {
        updates.push("max_tokens = ?");
        values.push(cfg.maxTokens);
      }
      if (cfg.enabled !== undefined) {
        updates.push("enabled = ?");
        values.push(cfg.enabled ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        db.prepare(`UPDATE worker_config SET ${updates.join(", ")} WHERE id = ?`).run(...values, existing.id);
      }
    } else {
      db.prepare(`
        INSERT INTO worker_config (id, user_id, worker_id, model, temperature, max_tokens, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID().replace(/-/g, ""),
        userId,
        workerId,
        cfg.model ?? null,
        cfg.temperature ?? null,
        cfg.maxTokens ?? null,
        cfg.enabled !== false ? 1 : 0,
      );
    }
  };

  const getAllWorkerConfigs = (): WorkerConfig[] => {
    if (!db) return [];
    const userId = getUserId();
    const rows = db.prepare("SELECT * FROM worker_config WHERE user_id = ?").all(userId) as WorkerConfigRow[];
    return rows.map(rowToWorkerConfig);
  };

  const clearWorkerConfig = (workerId: string): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare("DELETE FROM worker_config WHERE user_id = ? AND worker_id = ?").run(userId, workerId);
  };

  const isOnboarded = (): boolean => {
    const user = getUser();
    return user?.onboarded ?? false;
  };

  const start = async () => {
    const dbDir = join(config.directory, ".opencode");
    if (!existsSync(dbDir)) {
      await mkdir(dbDir, { recursive: true });
    }

    db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    // Run schema creation
    db.exec(CREATE_TABLES_SQL);

    // Check/update schema version
    const versionRow = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as
      | { version: number }
      | undefined;
    const currentVersion = versionRow?.version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      // Run migrations if needed (for now, just record the version)
      db.prepare("INSERT OR REPLACE INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
    }

    // Ensure a user exists
    ensureUser();
  };

  const stop = async () => {
    if (db) {
      db.close();
      db = null;
    }
  };

  return {
    start,
    stop,
    health: async () => ({ ok: db !== null }),
    getUser,
    createUser,
    markOnboarded,
    getPreference,
    setPreference,
    getAllPreferences,
    deletePreference,
    getWorkerConfig,
    setWorkerConfig,
    getAllWorkerConfigs,
    clearWorkerConfig,
    isOnboarded,
    getDbPath: () => dbPath,
  };
};

export type { User, Preference, WorkerConfig };
