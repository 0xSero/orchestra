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

function startParentWatchdog() {
  if (process.env.OPENCODE_ORCH_DISABLE_PARENT_WATCHDOG === "1") return;
  const parentPid = Number(process.env.OPENCODE_ORCH_PARENT_PID);
  if (!Number.isFinite(parentPid) || parentPid <= 1) return;

  const intervalMs = (() => {
    const raw = process.env.OPENCODE_ORCH_PARENT_CHECK_INTERVAL_MS;
    const parsed = raw ? Number(raw) : undefined;
    return Number.isFinite(parsed) && parsed >= 250 ? parsed : 1_000;
  })();

  const maxMisses = 3;
  let misses = 0;

  const checkParent = () => {
    const sameParent = process.ppid === parentPid;
    let alive = false;
    if (sameParent) {
      try {
        process.kill(parentPid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }

    if (alive) {
      misses = 0;
      return;
    }

    misses += 1;
    if (misses >= maxMisses) {
      try {
        process.stderr.write(`[worker-bridge] Parent ${parentPid} missing, exiting worker\\n`);
      } catch {
        // ignore
      }
      process.exit(0);
    }
  };

  const timer = setInterval(checkParent, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}

startParentWatchdog();

async function postJson(path, body) {
  const { url, token } = getBridgeConfig();
  if (!url || !token) throw new Error("Missing orchestrator bridge env (OPENCODE_ORCH_BRIDGE_URL/OPENCODE_ORCH_BRIDGE_TOKEN)");
  const timeoutMs = getBridgeTimeoutMs();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error(`Bridge request timed out after ${timeoutMs}ms`)), timeoutMs);
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
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
  const streamChunkTool = tool({
    description: `Stream a chunk of output in real-time to the orchestrator.
Use this to provide incremental output as you work, enabling the user to see your progress.
Call this multiple times during your response to stream output progressively.
Set final=true on the last chunk to indicate completion.`,
    args: {
      chunk: tool.schema.string().describe("The text chunk to stream (partial response)"),
      jobId: tool.schema.string().optional().describe("Optional job ID if this is related to an async job"),
      final: tool.schema.boolean().optional().describe("Set to true for the final chunk"),
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
  };
};

export default WorkerBridgePlugin;
