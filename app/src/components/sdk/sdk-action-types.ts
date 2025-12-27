import type { OpencodeClient } from "@opencode-ai/sdk/client";

export type SdkAction = {
  id: string;
  group: string;
  label: string;
  description?: string;
  template?: Record<string, unknown>;
  run: (client: OpencodeClient, input?: unknown) => Promise<unknown>;
};

export const templateForSessionId = (id = "<session-id>") => ({ path: { id } });
