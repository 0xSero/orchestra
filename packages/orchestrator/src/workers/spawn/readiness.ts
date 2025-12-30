import { createOpencodeClient } from "@opencode-ai/sdk";

const workerBridgeToolIds = ["stream_chunk"] as const;

export async function checkWorkerBridgeTools(
  client: ReturnType<typeof createOpencodeClient>,
  directory: string | undefined
): Promise<{ ok: boolean; missing: string[]; toolIds: string[] }> {
  const result = await client.tool.ids({ query: { directory } } as any);
  const sdkError: any = (result as any)?.error;
  if (sdkError) {
    const msg =
      sdkError?.data?.message ??
      sdkError?.message ??
      (typeof sdkError === "string" ? sdkError : JSON.stringify(sdkError));
    throw new Error(msg);
  }
  const toolIds = Array.isArray(result.data) ? (result.data as string[]) : [];
  const missing = workerBridgeToolIds.filter((id) => !toolIds.includes(id));
  return { ok: missing.length === 0, missing, toolIds };
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
