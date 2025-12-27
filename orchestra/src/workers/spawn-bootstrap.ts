import type { ApiService } from "../api";
import type { WorkerProfile } from "../types";

type WorkerClient = ApiService["client"];
type SessionPromptArgs = Parameters<WorkerClient["session"]["prompt"]>[0] & { throwOnError?: false };

/** Build the initial bootstrap prompt for a newly created worker session. */
export const buildBootstrapPromptArgs = (input: {
  sessionId: string;
  directory: string;
  profile: WorkerProfile;
  permissionSummary?: string;
  repoContext?: string;
}): SessionPromptArgs => {
  const capabilitiesJson = JSON.stringify({
    vision: Boolean(input.profile.supportsVision),
    web: Boolean(input.profile.supportsWeb),
  });

  const repoContextSection = input.repoContext ? `\n\n${input.repoContext}\n` : "";
  const permissionsSection = input.permissionSummary
    ? `<worker-permissions>\n${input.permissionSummary}\n</worker-permissions>\n\n`
    : "";

  return {
    path: { id: input.sessionId },
    body: {
      noReply: true,
      parts: [
        {
          type: "text",
          text:
            (input.profile.systemPrompt
              ? `<system-context>\n${input.profile.systemPrompt}\n</system-context>\n\n`
              : "") +
            repoContextSection +
            `<worker-identity>\n` +
            `You are worker "${input.profile.id}" (${input.profile.name}).\n` +
            `Your capabilities: ${capabilitiesJson}\n` +
            `</worker-identity>\n\n` +
            permissionsSection +
            `<orchestrator-instructions>\n` +
            `- Always reply with a direct plain-text answer.\n` +
            `- If a jobId is provided, include it in your response if relevant.\n` +
            `</orchestrator-instructions>`,
        },
      ],
    },
    query: { directory: input.directory },
    throwOnError: false,
  };
};
