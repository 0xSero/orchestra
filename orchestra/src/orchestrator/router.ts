import { findProfile } from "../profiles/discovery";
import type { WorkerProfile } from "../types";
import type { WorkerAttachment } from "../workers/prompt";

export function selectWorkerId(input: {
  task: string;
  profiles: Record<string, WorkerProfile>;
  attachments?: WorkerAttachment[];
}): string | undefined {
  const hasVision = input.attachments?.some((att) => att.type === "image");
  if (hasVision && input.profiles.vision) return "vision";

  const suggested = findProfile(input.task, input.profiles);
  if (suggested) return suggested;

  if (input.profiles.coder) return "coder";
  return Object.keys(input.profiles)[0];
}
