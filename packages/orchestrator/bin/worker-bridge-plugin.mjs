import { tool } from "@opencode-ai/plugin";

function getBridgeConfig() {
  const url = process.env.OPENCODE_ORCH_BRIDGE_URL;
  const token = process.env.OPENCODE_ORCH_BRIDGE_TOKEN;
  const workerId = process.env.OPENCODE_ORCH_WORKER_ID;
  return { url, token, workerId };
}

function getBridgeTimeoutMs() {
  const raw = process.env.OPENCODE_ORCH_BRIDGE_TIMEOUT_MS;
  const value = raw ? Number(raw) : 10_000;
  return Number.isFinite(value) && value > 0 ? value : 10_000;
}

async function postJson(path, body) {
  const { url, token } = getBridgeConfig();
  if (!url || !token)
    throw new Error(
      "Missing orchestrator bridge env (OPENCODE_ORCH_BRIDGE_URL/OPENCODE_ORCH_BRIDGE_TOKEN)",
    );
  const timeoutMs = getBridgeTimeoutMs();
  const abort = new AbortController();
  const timer = setTimeout(
    () =>
      abort.abort(new Error(`Bridge request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bridge error ${res.status}: ${text || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

export const WorkerBridgePlugin = async () => {
  const skillCalls = new Map();
  const streamChunkTool = tool({
    description: `Stream a chunk of output in real-time to the orchestrator.
Use this to provide incremental output as you work, enabling the user to see your progress.
Call this multiple times during your response to stream output progressively.
Set final=true on the last chunk to indicate completion.`,
    args: {
      chunk: tool.schema
        .string()
        .describe("The text chunk to stream (partial response)"),
      jobId: tool.schema
        .string()
        .optional()
        .describe("Optional job ID if this is related to an async job"),
      final: tool.schema
        .boolean()
        .optional()
        .describe("Set to true for the final chunk"),
    },
    async execute(args) {
      const { workerId } = getBridgeConfig();
      if (!workerId) return "Missing OPENCODE_ORCH_WORKER_ID; cannot stream.";

      const res = await postJson("/v1/stream/chunk", {
        workerId,
        jobId: args.jobId,
        chunk: args.chunk,
        final: args.final,
      });

      return `Chunk streamed (timestamp: ${res.timestamp ?? Date.now()})`;
    },
  });

  return {
    tool: {
      stream_chunk: streamChunkTool,
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "skill") return;
      const { workerId } = getBridgeConfig();
      if (!workerId) return;
      const startedAt = Date.now();
      skillCalls.set(input.callID, { startedAt, args: output.args });
      const skillName = output?.args?.name;
      try {
        await postJson("/v1/events", {
          type: "orchestra.skill.load.started",
          data: {
            sessionId: input.sessionID,
            callId: input.callID,
            skillName,
            workerId,
            source: "server",
            timestamp: startedAt,
          },
        });
      } catch {
        // ignore bridge failures
      }
    },
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "skill") return;
      const { workerId } = getBridgeConfig();
      if (!workerId) return;
      const entry = skillCalls.get(input.callID);
      skillCalls.delete(input.callID);
      const startedAt = entry?.startedAt;
      const durationMs = startedAt ? Date.now() - startedAt : undefined;
      const args = entry?.args ?? output?.args;
      const skillName = args?.name;
      const outputText =
        typeof output?.output === "string" ? output.output : "";
      const outputBytes = outputText
        ? Buffer.byteLength(outputText)
        : undefined;
      const metadata = output?.metadata;
      const isError = metadata?.error || metadata?.status === "error";
      try {
        await postJson("/v1/events", {
          type: isError
            ? "orchestra.skill.load.failed"
            : "orchestra.skill.load.completed",
          data: {
            sessionId: input.sessionID,
            callId: input.callID,
            skillName,
            workerId,
            source: "server",
            timestamp: Date.now(),
            durationMs,
            outputBytes,
            metadata,
          },
        });
      } catch {
        // ignore bridge failures
      }
    },
    "permission.ask": async (input, output) => {
      if (input.type !== "skill") return;
      const { workerId } = getBridgeConfig();
      if (!workerId) return;
      const skillName =
        input.metadata?.name ||
        input.metadata?.skill ||
        input.metadata?.skillName;
      try {
        await postJson("/v1/events", {
          type: "orchestra.skill.permission",
          data: {
            sessionId: input.sessionID,
            permissionId: input.id,
            callId: input.callID,
            status: output.status,
            pattern: input.pattern,
            skillName,
            workerId,
            source: "server",
            timestamp: Date.now(),
          },
        });
      } catch {
        // ignore bridge failures
      }
    },
  };
};

export default WorkerBridgePlugin;
