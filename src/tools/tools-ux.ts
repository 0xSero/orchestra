import { tool } from "@opencode-ai/plugin";
import { readFile, writeFile } from "node:fs/promises";
import { getDefaultGlobalOpenCodeConfigPath } from "../config/orchestrator";
import { getProfile } from "../config/profiles";
import { workerPool, listDeviceRegistry } from "../core/worker-pool";
import { workerJobs } from "../core/jobs";
import { clearPassthrough, setPassthrough } from "../core/passthrough";
import { getLogBuffer } from "../core/logger";
import { getHandbookMarkdown } from "../ux/handbook";
import { getRepoDocsBundle } from "../ux/repo-docs";
import { sendToWorker, spawnWorker } from "../workers/spawner";
import { renderMarkdownTable } from "./markdown";
import { autofillProfileModels } from "./tools-profiles";
import { getClient, getDefaultListFormat, getDirectory, getProfiles, getSpawnDefaults, type ToolContext } from "./state";

export const orchestratorHelp = tool({
  description: "Show help for using the orchestrator plugin (workers, profiles, delegation)",
  args: {},
  async execute() {
    return getHandbookMarkdown();
  },
});

export const enableDocsPassthrough = tool({
  description:
    "Enable 'docs passthrough' mode: the orchestrator relays future user messages to the docs worker until you say 'exit passthrough' (or 'exit docs mode').",
  args: {
    workerId: tool.schema.string().optional().describe("Docs worker ID (default: 'docs')"),
    autoSpawn: tool.schema.boolean().optional().describe("Spawn the worker if missing (default: true)"),
    showToast: tool.schema.boolean().optional().describe("Show a toast (default: true)"),
  },
  async execute(args, _ctx: ToolContext) {
    const client = getClient();
    if (!client) return "OpenCode client not available; restart OpenCode.";
    if (!_ctx?.sessionID) return "Missing sessionID; run this inside an active OpenCode session.";

    const workerId = args.workerId ?? "docs";
    const autoSpawn = args.autoSpawn ?? true;
    const showToast = args.showToast ?? true;

    if (autoSpawn && (!workerPool.get(workerId) || workerPool.get(workerId)?.status === "stopped")) {
      const profile = getProfile(workerId, getProfiles());
      if (profile) {
        const { basePort, timeout } = getSpawnDefaults();
        await spawnWorker(profile, { basePort, timeout, directory: getDirectory(), client }).catch(() => {});
      }
    }

    setPassthrough(_ctx.sessionID, workerId);

    if (showToast) {
      void client.tui
        .showToast({ body: { message: `Docs passthrough enabled (worker: ${workerId})`, variant: "success" } })
        .catch(() => {});
    }

    return `Docs passthrough enabled. Ask questions normally; say "exit passthrough" to stop.`;
  },
});

export const setPassthroughMode = tool({
  description:
    "Enable passthrough mode for the current session: relay user messages to a target worker until disabled.",
  args: {
    workerId: tool.schema.string().describe("Worker ID to relay to (e.g. 'docs', 'coder', 'vision')"),
    autoSpawn: tool.schema.boolean().optional().describe("Spawn the worker if missing (default: true)"),
    showToast: tool.schema.boolean().optional().describe("Show a toast (default: true)"),
  },
  async execute(args, ctx: ToolContext) {
    const client = getClient();
    if (!client) return "OpenCode client not available; restart OpenCode.";
    if (!ctx?.sessionID) return "Missing sessionID; run this inside an active OpenCode session.";

    const workerId = args.workerId;
    const autoSpawn = args.autoSpawn ?? true;
    const showToast = args.showToast ?? true;

    if (autoSpawn && (!workerPool.get(workerId) || workerPool.get(workerId)?.status === "stopped")) {
      const profile = getProfile(workerId, getProfiles());
      if (!profile) return `Worker "${workerId}" is not running and no profile "${workerId}" exists to spawn.`;
      const { basePort, timeout } = getSpawnDefaults();
      await spawnWorker(profile, { basePort, timeout, directory: getDirectory(), client });
    }

    setPassthrough(ctx.sessionID, workerId);

    if (showToast) {
      void client.tui
        .showToast({ body: { message: `Passthrough enabled (worker: ${workerId})`, variant: "success" } })
        .catch(() => {});
    }

    return `Passthrough enabled (worker: ${workerId}). Say "exit passthrough" to stop.`;
  },
});

export const clearPassthroughMode = tool({
  description: "Disable passthrough mode for the current session (if enabled).",
  args: {
    showToast: tool.schema.boolean().optional().describe("Show a toast (default: true)"),
  },
  async execute(args, ctx: ToolContext) {
    const client = getClient();
    if (!client) return "OpenCode client not available; restart OpenCode.";
    if (!ctx?.sessionID) return "Missing sessionID; run this inside an active OpenCode session.";
    const showToast = args.showToast ?? true;

    const prev = clearPassthrough(ctx.sessionID);

    if (showToast) {
      void client.tui
        .showToast({ body: { message: prev ? "Passthrough disabled" : "Passthrough already disabled", variant: "info" } })
        .catch(() => {});
    }

    return prev ? "Passthrough disabled." : "Passthrough was not enabled.";
  },
});

export const orchestratorStart = tool({
  description:
    "Start the orchestrator UX: ensure docs worker is running and responsive, seed it with local plugin docs, and enable docs passthrough.",
  args: {
    scope: tool.schema.enum(["global", "project"]).optional().describe("Where to persist models if needed (default: global)"),
    showToast: tool.schema.boolean().optional().describe("Show toasts (default: true)"),
    enablePassthrough: tool.schema.boolean().optional().describe("Enable docs passthrough mode (default: true)"),
    seedDocs: tool.schema.boolean().optional().describe("Seed docs worker with this repo's docs (default: true)"),
    smokeTest: tool.schema.boolean().optional().describe("Send a quick ping to verify it responds (default: true)"),
  },
  async execute(args, ctx: ToolContext) {
    const client = getClient();
    if (!client) return "OpenCode client not available; restart OpenCode.";

    const showToast = args.showToast ?? true;
    const enablePassthrough = args.enablePassthrough ?? true;
    const seedDocs = args.seedDocs ?? true;
    const smokeTest = args.smokeTest ?? true;

    const base = getProfile("docs", getProfiles());
    if (!base) return 'No "docs" profile found.';

    if (showToast) {
      void client.tui.showToast({ body: { message: "Starting docs worker…", variant: "info" } }).catch(() => {});
    }

    let instance = workerPool.get("docs");
    if (instance?.status !== "ready" || !instance.client || !instance.sessionId) instance = undefined;

    let chosenPersistModel: string | undefined;
    let lastError: string | undefined;
    let spawned = false;

    if (!instance) {
      try {
        const { basePort, timeout } = getSpawnDefaults();
        instance = await spawnWorker(base, { basePort, timeout, directory: getDirectory(), client });
        chosenPersistModel = instance.profile.model;
        spawned = true;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    if (!instance) {
      const hint =
        lastError && lastError.toLowerCase().includes("invalid api key")
          ? "Fix API keys in `~/.config/opencode/opencode.json` or switch models, then retry `orchestrator.start`."
          : "Run `orchestrator.models` to pick a working model, then `orchestrator.spawn.docs`.";
      return [`Failed to start docs worker.`, `Error: ${lastError ?? "unknown"}`, hint].join("\n");
    }

    if (smokeTest) {
      let ping: { success: boolean; response?: string; error?: string } = { success: false };
      try {
        ping = await sendToWorker("docs", "Reply with exactly: pong", { timeout: 120_000 });
      } catch (e) {
        ping = { success: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (!ping.success || !ping.response?.toLowerCase().includes("pong")) {
        const msg = ping.error ?? "docs worker did not respond to ping";
        instance.warning = `Startup ping failed: ${msg}`;
        if (showToast) {
          void client.tui.showToast({ body: { message: `Docs ping failed: ${msg}`, variant: "warning" } }).catch(() => {});
        }
        return [
          "Docs worker started but did not respond.",
          `- worker: docs`,
          `- warning: ${instance.warning}`,
          "",
          "Fix: run `orchestrator.dashboard` (see warnings) and switch to a working model via `set_profile_model`.",
        ].join("\n");
      }
    }

    if (spawned && ctx?.sessionID && instance?.modelResolution !== "reused existing worker") {
      workerPool.trackOwnership(ctx.sessionID, instance.profile.id);
    }

    if (seedDocs) {
      const bundle = await getRepoDocsBundle().catch(() => undefined);
      if (bundle?.markdown && instance.client && instance.sessionId) {
        const seed = [
          "You are the docs agent for the *orchestrator plugin itself* (not the user's app).",
          "Use the following local docs bundle as your primary reference. Quote relevant sections and point to file names.",
          "",
          `<repo-docs root="${bundle.root}" truncated="${bundle.truncated ? "true" : "false"}">`,
          bundle.markdown,
          "</repo-docs>",
        ].join("\n");
        await instance.client.session
          .prompt({
            path: { id: instance.sessionId },
            body: { noReply: true, parts: [{ type: "text", text: seed }] as any },
            query: { directory: getDirectory() },
          } as any)
          .catch(() => {});
      }
    }

    if (enablePassthrough && ctx?.sessionID) {
      await enableDocsPassthrough.execute({ workerId: "docs", showToast: false } as any, ctx as any).catch(() => {});
    }

    if (showToast) {
      void client.tui.showToast({ body: { message: "Docs ready. Ask questions normally.", variant: "success" } }).catch(() => {});
    }

    return [
      "# Orchestrator Started",
      "",
      "- Docs worker: `docs`",
      `- Model (saved): \`${chosenPersistModel ?? "(not saved)"}\``,
      `- Passthrough: ${enablePassthrough ? "enabled" : "disabled"}`,
      "",
      'Ask questions normally. Say "exit docs mode" to stop passthrough.',
    ].join("\n");
  },
});

export const orchestratorDashboard = tool({
  description: "Show a compact dashboard of running workers: models, ports, status, activity, and warnings.",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const workers = workerPool.toJSON() as Array<Record<string, any>>;
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify(workers, null, 2);

    if (workers.length === 0) {
      return [
        "# Orchestrator Dashboard",
        "",
        "No running workers.",
        "",
        "Next: run `set_profile_model` (or `autofill_profile_models`) then `orchestrator.spawn.docs` (or any profile).",
      ].join("\n");
    }

    const byStatus = new Map<string, number>();
    for (const w of workers) byStatus.set(String(w.status), (byStatus.get(String(w.status)) ?? 0) + 1);

    const rows = workers
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((w) => [String(w.id), String(w.status), String(w.model), String(w.port), String(w.currentTask ?? "")]);

    const warnings = workers
      .map((w) => ({ id: String(w.id), warning: String(w.warning ?? "") }))
      .filter((w) => w.warning.trim().length > 0);

    return [
      "# Orchestrator Dashboard",
      "",
      `- Workers: ${workers.length}`,
      `- Status: ${[...byStatus.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`,
      "",
      renderMarkdownTable(["Worker", "Status", "Model", "Port", "Doing"], rows),
      warnings.length ? ["", "## Warnings", ...warnings.map((w) => `- \`${w.id}\`: ${w.warning}`)].join("\n") : "",
      "",
      "Tip: `orchestrator.trace.docs` shows docs worker activity.",
    ].join("\n");
  },
});

export const orchestratorOutput = tool({
  description:
    "Unified view of orchestrator activity: recent jobs and internal logs (including vision router logs).",
  args: {
    limit: tool.schema.number().optional().describe("Max items per section (default: 20)"),
    after: tool.schema.number().optional().describe("Only include events after this unix-ms timestamp"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const limit = Math.max(1, args.limit ?? 20);
    const after = typeof args.after === "number" && Number.isFinite(args.after) ? args.after : 0;
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();

    const jobs = workerJobs
      .list({ limit: Math.max(limit, 50) })
      .filter((j) => (after ? j.startedAt > after || (j.finishedAt ?? 0) > after : true))
      .slice(0, limit);
    const logs = getLogBuffer(Math.max(limit * 2, 50)).filter((l) => (after ? l.at > after : true));

    const payload = { jobs, logs };
    if (format === "json") return JSON.stringify(payload, null, 2);

    const jobRows = jobs.map((j) => [
      j.id,
      j.workerId,
      j.status,
      new Date(j.startedAt).toISOString(),
      j.durationMs ? `${j.durationMs}` : "",
      (j.message ?? "").slice(0, 60).replace(/\s+/g, " "),
    ]);
    const logRows = logs
      .slice()
      .reverse()
      .slice(0, limit)
      .reverse()
      .map((l) => [new Date(l.at).toISOString(), l.level, l.message.slice(0, 200)]);

    return [
      "# Orchestrator Output",
      "",
      "## Jobs",
      jobRows.length ? renderMarkdownTable(["Job", "Worker", "Status", "Started", "ms", "Message"], jobRows) : "(none)",
      "",
      "## Logs",
      logRows.length ? renderMarkdownTable(["Time", "Level", "Message"], logRows) : "(none)",
    ].join("\n");
  },
});

export const orchestratorResults = tool({
  description: "Show the most recent final output/report for each running worker (what they did and any issues).",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    const workers = [...workerPool.workers.values()].sort((a, b) => a.profile.id.localeCompare(b.profile.id));
    const data = workers.map((w) => ({
      id: w.profile.id,
      name: w.profile.name,
      status: w.status,
      lastResult: w.lastResult
        ? {
            at: w.lastResult.at.toISOString(),
            jobId: w.lastResult.jobId,
            durationMs: w.lastResult.durationMs,
            response: w.lastResult.response,
            report: w.lastResult.report,
          }
        : undefined,
    }));
    if (format === "json") return JSON.stringify(data, null, 2);
    if (data.length === 0) return "No workers running.";

    const lines: string[] = [];
    lines.push("# Worker Results", "");
    for (const w of data) {
      lines.push(`## ${w.name} (${w.id})`);
      lines.push(`- Status: ${w.status}`);
      if (!w.lastResult) {
        lines.push("- Last: (none)", "");
        continue;
      }
      lines.push(`- Last: ${w.lastResult.at}${w.lastResult.durationMs ? ` (${w.lastResult.durationMs}ms)` : ""}`);
      if (w.lastResult.jobId) lines.push(`- Job: ${w.lastResult.jobId}`);
      if (w.lastResult.report?.summary) lines.push("", "### Summary", w.lastResult.report.summary);
      if (w.lastResult.report?.details) lines.push("", "### Details", w.lastResult.report.details);
      if (w.lastResult.report?.issues?.length) lines.push("", "### Issues", ...w.lastResult.report.issues.map((i) => `- ${i}`));
      if (w.lastResult.response?.trim()) lines.push("", "### Response", w.lastResult.response);
      lines.push("");
    }
    return lines.join("\n");
  },
});

export const orchestratorDeviceRegistry = tool({
  description: "List all orchestrator-tracked OpenCode worker sessions across this device (file-backed registry).",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const entries = await listDeviceRegistry();
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify(entries, null, 2);
    if (entries.length === 0) return "No worker sessions recorded on this device.";
    const workerRows = entries
      .filter((e: any) => e.kind === "worker")
      .map((e: any) => [
        e.orchestratorInstanceId,
        e.workerId,
        String(e.status),
        String(e.pid),
        String(e.port ?? ""),
        String(e.sessionId ?? ""),
        new Date(e.updatedAt).toISOString(),
      ]);
    const sessionRows = entries
      .filter((e: any) => e.kind === "session")
      .map((e: any) => [
        String(e.hostPid),
        String(e.sessionId),
        String(e.title),
        String(e.directory),
        new Date(e.updatedAt).toISOString(),
      ]);
    return [
      "# Device Registry",
      "",
      "## Workers",
      workerRows.length
        ? renderMarkdownTable(["Orch", "Worker", "Status", "PID", "Port", "Session", "Updated"], workerRows)
        : "(none)",
      "",
      "## Sessions",
      sessionRows.length
        ? renderMarkdownTable(["Host PID", "Session", "Title", "Directory", "Updated"], sessionRows)
        : "(none)",
    ].join("\n");
  },
});

export const orchestratorDemo = tool({
  description: "Run the first-run demo: show quickstart docs, optionally spawn docs worker, and optionally show trace.",
  args: {
    scope: tool.schema.enum(["global", "project"]).optional().describe("Where to persist model autofill if needed (default: global)"),
    spawnDocs: tool.schema.boolean().optional().describe("Spawn the docs worker (default: true)"),
    showTrace: tool.schema.boolean().optional().describe("Include recent docs-worker trace after running (default: true)"),
    showToast: tool.schema.boolean().optional().describe("Show toasts (default: true)"),
    autofillModels: tool.schema.boolean().optional().describe("Pin models for built-in profiles (default: false)"),
  },
  async execute(args, ctx: ToolContext) {
    const spawnDocs = args.spawnDocs ?? true;
    const showTrace = args.showTrace ?? true;
    const showToast = args.showToast ?? true;
    const autofillModels = args.autofillModels ?? false;
    const scope = args.scope ?? "global";

    const sections: string[] = [];
    sections.push(getHandbookMarkdown());

    const client = getClient();
    if (client && autofillModels) {
      sections.push("", "## Setup", "");
      sections.push("Pinning profile → model mapping from your current/last-used model…");
      try {
        await autofillProfileModels.execute({ scope, setAgent: true, showToast }, ctx as any);
      } catch (e) {
        sections.push(`Setup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (spawnDocs) {
      sections.push("", "## Start", "");
      sections.push("Models are configured manually in this plugin.");
      sections.push("- Pick a model: `orchestrator.models`");
      sections.push("- Configure docs: `set_profile_model({ scope: 'global', profileId: 'docs', model: 'provider/model' })`");
      sections.push("- Optional auto-pin: `autofill_profile_models({ scope: 'global' })`");
      sections.push("- Start + verify: `orchestrator.start`");
      if (showTrace) {
        sections.push("", "## Trace", "");
        sections.push("After start: `orchestrator.trace.docs`");
      }
    }

    return sections.join("\n");
  },
});

export const orchestratorTodoView = tool({
  description:
    "Orchestrator-flavored view of the current session todo list (adds labels + visuals). This is a read-only wrapper around the native todo system.",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(_args, ctx: ToolContext) {
    const client = getClient();
    if (!client) return "OpenCode client not available; restart OpenCode.";
    if (!ctx?.sessionID) return "Missing sessionID; run this inside an active OpenCode session.";

    const todosRes = await client.session.todo({ path: { id: ctx.sessionID }, query: { directory: getDirectory() } });
    const todos = todosRes.data as any[];

    const format: "markdown" | "json" = (_args as any).format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify(todos, null, 2);

    if (!Array.isArray(todos) || todos.length === 0) {
      return [
        "# Orchestrator Todo",
        "",
        "No todos yet.",
        "",
        "Tip: Use `todowrite` and prefix items with labels like `[docs]`, `[coder]`, `[vision]`, `[orchestrator]`.",
      ].join("\n");
    }

    const fmtStatus = (t: any) => {
      const s = String(t.status ?? "");
      if (s === "done") return "✅ done";
      if (s === "doing") return "⏳ doing";
      if (s === "pending") return "⬜ pending";
      return s || "unknown";
    };

    const fmtLabel = (text: string) => {
      const m = text.match(/^\s*\[([^\]]+)\]\s*/);
      return m ? m[1].toLowerCase() : "unlabeled";
    };

    const byLabel = new Map<string, any[]>();
    for (const t of todos) {
      const text = String(t.text ?? t.title ?? "");
      const label = fmtLabel(text);
      byLabel.set(label, [...(byLabel.get(label) ?? []), { ...t, _text: text }]);
    }

    const labels = [...byLabel.keys()].sort();
    const lines: string[] = ["# Orchestrator Todo", ""];

    for (const label of labels) {
      lines.push(`## [${label}]`);
      for (const t of byLabel.get(label) ?? []) {
        lines.push(`- ${fmtStatus(t)} ${t._text}`);
      }
      lines.push("");
    }

    lines.push("## Tips");
    lines.push("- Use `todowrite` to update the underlying todo list.");
    lines.push("- Prefer labeled items: `[docs] ...`, `[coder] ...`, `[vision] ...`.");
    return lines.join("\n");
  },
});

export const macosKeybindsFix = tool({
  description:
    "Fix macOS keybind conflicts by switching child-session navigation from ctrl+left/right to alt+left/right (writes to ~/.config/opencode/opencode.json).",
  args: {
    scope: tool.schema.enum(["global"]).optional().describe("Only global is supported for keybind updates"),
  },
  async execute() {
    const cfgPath = getDefaultGlobalOpenCodeConfigPath();
    const existing = await (async () => {
      try {
        return JSON.parse(await readFile(cfgPath, "utf8")) as any;
      } catch {
        return {};
      }
    })();

    existing.keybinds = existing.keybinds && typeof existing.keybinds === "object" ? existing.keybinds : {};
    existing.keybinds.session_child_cycle = "alt+right";
    existing.keybinds.session_child_cycle_reverse = "alt+left";

    await writeFile(cfgPath, JSON.stringify(existing, null, 2) + "\n", "utf8");
    return `Saved macOS keybind fix in ${cfgPath}`;
  },
});
