import { tool } from "@opencode-ai/plugin";
import { workerPool } from "../core/worker-pool";
import { formatBytes, listOpencodeServeProcesses } from "../core/process-metrics";
import { renderMarkdownTable } from "./markdown";
import { getDefaultListFormat } from "./state";
import { getLogBuffer } from "../core/logger";

export const orchestratorDiagnostics = tool({
  description:
    "Show process/session counts and memory usage for orchestrator + workers (detects recursive spawns, MCP duplication, and runaway resource usage).",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    const opencode = await listOpencodeServeProcesses().catch(() => []);

    const workers = [...workerPool.workers.values()].sort((a, b) => a.profile.id.localeCompare(b.profile.id));
    const workerRows = workers.map((w) => {
      const pid = typeof w.pid === "number" ? w.pid : undefined;
      const rss = pid ? opencode.find((p) => p.pid === pid)?.rssBytes : undefined;
      return [
        w.profile.id,
        w.status,
        String(pid ?? ""),
        rss ? formatBytes(rss) : "",
        String(w.port ?? ""),
        String(w.sessionId ?? ""),
      ];
    });

    const summary = {
      hostPid: process.pid,
      workersInMemoryRegistry: workers.length,
      opencodeServeProcesses: opencode.length,
      opencodeServeRssBytesTotal: opencode.reduce((sum, p) => sum + (p.rssBytes ?? 0), 0),
    };

    const logs = getLogBuffer(100);
    if (format === "json") {
      return JSON.stringify({ summary, workers, opencodeServe: opencode, logs }, null, 2);
    }

    const opencodeRows = opencode
      .sort((a, b) => (b.rssBytes ?? 0) - (a.rssBytes ?? 0))
      .slice(0, 20)
      .map((p) => [String(p.pid), p.rssBytes ? formatBytes(p.rssBytes) : "", p.args.slice(0, 140)]);

    const logRows = logs
      .slice()
      .reverse()
      .slice(0, 50)
      .reverse()
      .map((l) => [new Date(l.at).toISOString(), l.level, l.message.slice(0, 200)]);

    return [
      "# Orchestrator Diagnostics",
      "",
      `- Host PID: ${summary.hostPid}`,
      `- In-memory workers: ${summary.workersInMemoryRegistry}`,
      `- opencode serve processes: ${summary.opencodeServeProcesses} (RSS total: ${formatBytes(summary.opencodeServeRssBytesTotal)})`,
      "",
      "## Workers (in-memory registry)",
      workerRows.length ? renderMarkdownTable(["Worker", "Status", "PID", "RSS", "Port", "Session"], workerRows) : "(none)",
      "",
      "## Recent logs",
      logRows.length ? renderMarkdownTable(["Time", "Level", "Message"], logRows) : "(none)",
      "",
      "## opencode serve (top 20 by RSS)",
      opencodeRows.length ? renderMarkdownTable(["PID", "RSS", "Args"], opencodeRows) : "(none)",
    ]
      .filter((s) => s !== "")
      .join("\n");
  },
});
