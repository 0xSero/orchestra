import type { WorkerProfile } from "../../types";

import { profile as vision } from "./vision/profile";
import { profile as docs } from "./docs/profile";
import { profile as coder } from "./coder/profile";
import { profile as architect } from "./architect/profile";
import { profile as explorer } from "./explorer/profile";
import { profile as memory } from "./memory/profile";
import { profile as reviewer } from "./reviewer/profile";
import { profile as qa } from "./qa/profile";
import { profile as security } from "./security/profile";
import { profile as product } from "./product/profile";
import { profile as analyst } from "./analyst/profile";

export const builtInProfiles: Record<string, WorkerProfile> = {
  vision,
  docs,
  coder,
  architect,
  explorer,
  memory,
  reviewer,
  qa,
  security,
  product,
  analyst,
};

export function getProfile(id: string, customProfiles?: Record<string, WorkerProfile>): WorkerProfile | undefined {
  return customProfiles?.[id] ?? builtInProfiles[id];
}

export function mergeProfile(baseId: string, overrides: Partial<WorkerProfile>): WorkerProfile {
  const base = builtInProfiles[baseId];
  if (!base) throw new Error(`Unknown base profile: ${baseId}`);
  return {
    ...base,
    ...overrides,
    id: overrides.id ?? base.id,
  };
}
