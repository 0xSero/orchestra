import type { WorkerProfile } from "../../types";
import { loadPromptFile } from "../../prompts/load";
import { getRepoContextForWorker } from "../../ux/repo-context";

async function resolveProfilePrompt(
  profile: WorkerProfile,
): Promise<string | undefined> {
  if (profile.systemPrompt?.trim()) return profile.systemPrompt;
  if (!profile.promptFile) return undefined;
  try {
    return await loadPromptFile(profile.promptFile);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load prompt for worker "${profile.id}": ${detail}`,
    );
  }
}

export async function buildWorkerBootstrapPrompt(input: {
  profile: WorkerProfile;
  directory?: string;
}): Promise<string> {
  const { profile, directory } = input;
  const resolvedKind =
    profile.kind ?? (profile.backend === "server" ? "server" : "agent");
  const allowStreaming = resolvedKind === "server";

  let repoContextSection = "";
  if (profile.injectRepoContext && directory) {
    const repoContext = await getRepoContextForWorker(directory).catch(
      () => undefined,
    );
    if (repoContext) {
      repoContextSection = `\n\n${repoContext}\n`;
    }
  }

  const profilePrompt = await resolveProfilePrompt(profile);
  const outputContract = await loadPromptFile(
    "snippets/worker-output-contract.md",
  );
  const streamingContract = allowStreaming
    ? await loadPromptFile("snippets/worker-streaming-contract.md")
    : "";

  const capabilitiesJson = JSON.stringify({
    vision: !!profile.supportsVision,
    web: !!profile.supportsWeb,
  });

  const toolsSection = allowStreaming
    ? `## Communication Tools Available\n\n` +
      `You have these tools for communicating with the orchestrator:\n\n` +
      `1. **stream_chunk** - Real-time streaming (RECOMMENDED for long responses)\n` +
      `   - Call multiple times during your response to stream output progressively\n` +
      `   - Each chunk is immediately shown to the user as you work\n` +
      `   - Set final=true on the last chunk to indicate completion\n` +
      `   - Include jobId if one was provided\n` +
      `   - Example: stream_chunk({ chunk: "Analyzing the image...", jobId: "abc123" })\n`
    : `## Communication Tools Available\n\n` +
      `No streaming tools are available in this worker backend.\n`;

  const behaviorSection =
    `## Required Behavior\n\n` +
    `${outputContract}` +
    (allowStreaming ? `\n\n${streamingContract}` : "");

  return (
    (profilePrompt
      ? `<system-context>\n${profilePrompt}\n</system-context>\n\n`
      : "") +
    repoContextSection +
    `<worker-identity>\n` +
    `You are worker "${profile.id}" (${profile.name}).\n` +
    `Your capabilities: ${capabilitiesJson}\n` +
    `</worker-identity>\n\n` +
    `<orchestrator-instructions>\n` +
    `${toolsSection}\n\n` +
    `${behaviorSection}\n` +
    `</orchestrator-instructions>`
  );
}
