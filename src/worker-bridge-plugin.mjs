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

async function getJson(path) {
  const { url, token } = getBridgeConfig();
  if (!url || !token) throw new Error("Missing orchestrator bridge env (OPENCODE_ORCH_BRIDGE_URL/OPENCODE_ORCH_BRIDGE_TOKEN)");
  const timeoutMs = getBridgeTimeoutMs();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error(`Bridge request timed out after ${timeoutMs}ms`)), timeoutMs);
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
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
  const messageTool = tool({
    description:
      "Send a report or inter-agent message back to the orchestrator. Use this at the END of your turn to provide a detailed report (summary, details, issues).",
    args: {
      kind: tool.schema.enum(["report", "message"]).describe("Whether this is a final report or a message to another agent"),
      jobId: tool.schema.string().optional().describe("Optional orchestrator job ID (if provided by the orchestrator)"),
      to: tool.schema.string().optional().describe("Recipient for kind=message (e.g. 'orchestrator' or another worker id)"),
      topic: tool.schema.string().optional().describe("Optional topic for kind=message"),
      text: tool.schema.string().describe("The full text content (final report or message)"),
      summary: tool.schema.string().optional().describe("Short summary (recommended for kind=report)"),
      details: tool.schema.string().optional().describe("More detailed writeup (recommended for kind=report)"),
      issues: tool.schema.array(tool.schema.string()).optional().describe("Issues encountered (recommended for kind=report)"),
    },
    async execute(args) {
      const { workerId } = getBridgeConfig();
      if (!workerId) return "Missing OPENCODE_ORCH_WORKER_ID; cannot attribute message.";

      if (args.kind === "message") {
        const to = args.to ?? "orchestrator";
        await postJson("/v1/message", { from: workerId, to, topic: args.topic, jobId: args.jobId, text: args.text });
        return `Message delivered to "${to}".`;
      }

      await postJson("/v1/report", {
        workerId,
        jobId: args.jobId,
        final: args.text,
        report: { summary: args.summary, details: args.details, issues: args.issues },
      });
      return "Report delivered to orchestrator.";
    },
  });

  const inboxTool = tool({
    description: "Fetch your inbox messages from the orchestrator message bus (for inter-agent communication).",
    args: {
      after: tool.schema.number().optional().describe("Only return messages after this unix-ms timestamp"),
      limit: tool.schema.number().optional().describe("Max messages to return (default: 20)"),
    },
    async execute(args) {
      const { workerId } = getBridgeConfig();
      if (!workerId) return "Missing OPENCODE_ORCH_WORKER_ID; cannot fetch inbox.";
      const after = typeof args.after === "number" ? args.after : 0;
      const limit = typeof args.limit === "number" ? args.limit : 20;
      const res = await getJson(`/v1/inbox?to=${encodeURIComponent(workerId)}&after=${encodeURIComponent(String(after))}&limit=${encodeURIComponent(String(limit))}`);
      return JSON.stringify(res.messages ?? [], null, 2);
    },
  });

  const wakeupTool = tool({
    description: `Wake up the orchestrator to notify it that this worker needs attention or has results ready.
Use this when:
- You have completed an async task and want to notify the orchestrator
- You need input or clarification from the orchestrator
- You encountered an error that requires orchestrator attention
- You want to report progress on a long-running task`,
    args: {
      reason: tool.schema
        .enum(["result_ready", "needs_attention", "error", "progress", "custom"])
        .describe("Why you're waking up the orchestrator"),
      jobId: tool.schema.string().optional().describe("Optional job ID if this is related to an async job"),
      summary: tool.schema.string().optional().describe("Brief summary of why you're waking up the orchestrator"),
      data: tool.schema.object({}).optional().describe("Optional structured data to include"),
    },
    async execute(args) {
      const { workerId } = getBridgeConfig();
      if (!workerId) return "Missing OPENCODE_ORCH_WORKER_ID; cannot send wakeup.";

      const res = await postJson("/v1/wakeup", {
        workerId,
        reason: args.reason,
        jobId: args.jobId,
        summary: args.summary,
        data: args.data,
      });

      return `Wakeup sent to orchestrator (id: ${res.id ?? "unknown"}, timestamp: ${res.timestamp ?? Date.now()})`;
    },
  });

  return {
    tool: {
      message_tool: messageTool,
      worker_inbox: inboxTool,
      wakeup_orchestrator: wakeupTool,
    },
  };
};

export default WorkerBridgePlugin;
