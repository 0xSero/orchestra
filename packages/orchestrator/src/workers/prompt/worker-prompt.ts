import type { WorkerProfile } from "../../types";
import { loadPromptFile } from "../../prompts/load";
import { getRepoContextForWorker } from "../../ux/repo-context";

async function resolveProfilePrompt(profile: WorkerProfile): Promise<string | undefined> {
  if (profile.systemPrompt?.trim()) return profile.systemPrompt;
  if (!profile.promptFile) return undefined;
  try {
    return await loadPromptFile(profile.promptFile);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load prompt for worker "${profile.id}": ${detail}`);
  }
}

export async function buildWorkerBootstrapPrompt(input: {
  profile: WorkerProfile;
  directory?: string;
}): Promise<string> {
  const { profile, directory } = input;

  let repoContextSection = "";
  if (profile.injectRepoContext && directory) {
    const repoContext = await getRepoContextForWorker(directory).catch(() => undefined);
    if (repoContext) {
      repoContextSection = `\n\n${repoContext}\n`;
    }
  }

  const profilePrompt = await resolveProfilePrompt(profile);

  const capabilitiesJson = JSON.stringify({
    vision: !!profile.supportsVision,
    web: !!profile.supportsWeb,
  });

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
    `## Communication Tools Available\n\n` +
    `You have these tools for communicating with the orchestrator:\n\n` +
    `1. **stream_chunk** - Real-time streaming (RECOMMENDED for long responses)\n` +
    `   - Call multiple times during your response to stream output progressively\n` +
    `   - Each chunk is immediately shown to the user as you work\n` +
    `   - Set final=true on the last chunk to indicate completion\n` +
    `   - Include jobId if one was provided\n` +
    `   - Example: stream_chunk({ chunk: "Analyzing the image...", jobId: "abc123" })\n\n` +
    `## Required Behavior\n\n` +
    `1. Always return a direct plain-text answer to the prompt.\n` +
    `2. For long tasks, use stream_chunk to show progress (the user can see output in real-time).\n` +
    `3. If you received a jobId in <orchestrator-job>, include it when streaming chunks.\n` +
    `4. If bridge tools fail/unavailable, still return your answer in plain text.\n` +
    `</orchestrator-instructions>`
  );
}
