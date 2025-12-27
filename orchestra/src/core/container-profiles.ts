import type { createDatabase } from "../db";
import { applyWorkerConfigOverrides } from "../db/overrides";
import type { WorkerProfile } from "../types";
import { getAllProfiles } from "../workers/profiles";

type ProfileMap = Record<string, WorkerProfile>;

interface ProfileSyncInput {
  projectDir: string;
  baseProfiles: ProfileMap;
  profiles: ProfileMap;
  database: ReturnType<typeof createDatabase>;
}

/** Create a profile refresh helper that merges SKILL.md profiles with config overrides. */
export const createProfileSync = (input: ProfileSyncInput) => {
  const syncProfiles = (next: ProfileMap) => {
    for (const key of Object.keys(input.profiles)) {
      delete input.profiles[key];
    }
    for (const [key, profile] of Object.entries(next)) {
      input.profiles[key] = profile;
    }
  };

  const refreshProfiles = async () => {
    const configProfilesArray = Object.values(input.baseProfiles).map((profile) => ({ ...profile }));
    const merged = await getAllProfiles(input.projectDir, configProfilesArray);
    const workerConfigs = input.database.getAllWorkerConfigs();
    syncProfiles(applyWorkerConfigOverrides(merged, workerConfigs));
  };

  return { refreshProfiles };
};
