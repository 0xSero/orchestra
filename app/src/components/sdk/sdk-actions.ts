import type { OpencodeClient } from "@opencode-ai/sdk/client";

export type SdkAction = {
  id: string;
  group: string;
  label: string;
  description?: string;
  template?: Record<string, unknown>;
  run: (client: OpencodeClient, input?: any) => Promise<any>;
};

const templateForSessionId = (id = "<session-id>") => ({ path: { id } });

export const sdkActions: SdkAction[] = [
  // Project
  {
    id: "project.list",
    group: "Project",
    label: "List Projects",
    template: {},
    run: (client, input) => client.project.list(input),
  },
  {
    id: "project.current",
    group: "Project",
    label: "Current Project",
    template: {},
    run: (client, input) => client.project.current(input),
  },

  // Path/VCS
  {
    id: "path.get",
    group: "Path",
    label: "Get Current Path",
    template: {},
    run: (client, input) => client.path.get(input),
  },
  {
    id: "vcs.get",
    group: "Path",
    label: "Get VCS Info",
    template: {},
    run: (client, input) => client.vcs.get(input),
  },

  // Config
  {
    id: "config.get",
    group: "Config",
    label: "Get Config",
    template: {},
    run: (client, input) => client.config.get(input),
  },
  {
    id: "config.update",
    group: "Config",
    label: "Update Config",
    template: { body: { model: "opencode/gpt-5-nano" } },
    run: (client, input) => client.config.update(input),
  },
  {
    id: "config.providers",
    group: "Config",
    label: "List Providers",
    template: {},
    run: (client, input) => client.config.providers(input),
  },

  // Tools
  {
    id: "tool.ids",
    group: "Tools",
    label: "List Tool IDs",
    template: {},
    run: (client, input) => client.tool.ids(input),
  },
  {
    id: "tool.list",
    group: "Tools",
    label: "List Tools for Model",
    template: { query: { provider: "opencode", model: "gpt-5-nano" } },
    run: (client, input) => client.tool.list(input),
  },

  // Instance
  {
    id: "instance.dispose",
    group: "Instance",
    label: "Dispose Instance",
    template: {},
    run: (client, input) => client.instance.dispose(input),
  },

  // Sessions
  {
    id: "session.list",
    group: "Sessions",
    label: "List Sessions",
    template: {},
    run: (client, input) => client.session.list(input),
  },
  {
    id: "session.create",
    group: "Sessions",
    label: "Create Session",
    template: { body: { title: "New session" } },
    run: (client, input) => client.session.create(input),
  },
  {
    id: "session.get",
    group: "Sessions",
    label: "Get Session",
    template: templateForSessionId(),
    run: (client, input) => client.session.get(input),
  },
  {
    id: "session.update",
    group: "Sessions",
    label: "Update Session",
    template: { ...templateForSessionId(), body: { title: "Updated title" } },
    run: (client, input) => client.session.update(input),
  },
  {
    id: "session.delete",
    group: "Sessions",
    label: "Delete Session",
    template: templateForSessionId(),
    run: (client, input) => client.session.delete(input),
  },
  {
    id: "session.status",
    group: "Sessions",
    label: "Session Status",
    template: templateForSessionId(),
    run: (client, input) => client.session.status(input),
  },
  {
    id: "session.children",
    group: "Sessions",
    label: "Session Children",
    template: templateForSessionId(),
    run: (client, input) => client.session.children(input),
  },
  {
    id: "session.todo",
    group: "Sessions",
    label: "Session Todo",
    template: templateForSessionId(),
    run: (client, input) => client.session.todo(input),
  },
  {
    id: "session.init",
    group: "Sessions",
    label: "Session Init",
    template: {
      path: { id: "<session-id>" },
      body: { providerID: "opencode", modelID: "gpt-5-nano", messageID: "<message-id>" },
    },
    run: (client, input) => client.session.init(input),
  },
  {
    id: "session.fork",
    group: "Sessions",
    label: "Session Fork",
    template: { path: { id: "<session-id>" }, body: { messageID: "<message-id>" } },
    run: (client, input) => client.session.fork(input),
  },
  {
    id: "session.abort",
    group: "Sessions",
    label: "Session Abort",
    template: templateForSessionId(),
    run: (client, input) => client.session.abort(input),
  },
  {
    id: "session.share",
    group: "Sessions",
    label: "Session Share",
    template: templateForSessionId(),
    run: (client, input) => client.session.share(input),
  },
  {
    id: "session.unshare",
    group: "Sessions",
    label: "Session Unshare",
    template: templateForSessionId(),
    run: (client, input) => client.session.unshare(input),
  },
  {
    id: "session.diff",
    group: "Sessions",
    label: "Session Diff",
    template: templateForSessionId(),
    run: (client, input) => client.session.diff(input),
  },
  {
    id: "session.summarize",
    group: "Sessions",
    label: "Session Summarize",
    template: templateForSessionId(),
    run: (client, input) => client.session.summarize(input),
  },
  {
    id: "session.messages",
    group: "Sessions",
    label: "Session Messages",
    template: templateForSessionId(),
    run: (client, input) => client.session.messages(input),
  },
  {
    id: "session.message",
    group: "Sessions",
    label: "Session Message",
    template: { path: { id: "<session-id>", messageID: "<message-id>" } },
    run: (client, input) => client.session.message(input),
  },
  {
    id: "session.prompt",
    group: "Sessions",
    label: "Session Prompt",
    template: {
      path: { id: "<session-id>" },
      body: { parts: [{ type: "text", text: "Hello from SDK" }] },
    },
    run: (client, input) => client.session.prompt(input),
  },
  {
    id: "session.promptAsync",
    group: "Sessions",
    label: "Session Prompt Async",
    template: {
      path: { id: "<session-id>" },
      body: { parts: [{ type: "text", text: "Hello async" }] },
    },
    run: (client, input) => client.session.promptAsync(input),
  },
  {
    id: "session.command",
    group: "Sessions",
    label: "Session Command",
    template: { path: { id: "<session-id>" }, body: { command: "help", arguments: "" } },
    run: (client, input) => client.session.command(input),
  },
  {
    id: "session.shell",
    group: "Sessions",
    label: "Session Shell",
    template: { path: { id: "<session-id>" }, body: { agent: "shell", command: "pwd" } },
    run: (client, input) => client.session.shell(input),
  },
  {
    id: "session.revert",
    group: "Sessions",
    label: "Session Revert",
    template: { path: { id: "<session-id>" }, body: { messageID: "<message-id>" } },
    run: (client, input) => client.session.revert(input),
  },
  {
    id: "session.unrevert",
    group: "Sessions",
    label: "Session Unrevert",
    template: templateForSessionId(),
    run: (client, input) => client.session.unrevert(input),
  },

  // Command
  {
    id: "command.list",
    group: "Command",
    label: "List Commands",
    template: {},
    run: (client, input) => client.command.list(input),
  },

  // Providers
  {
    id: "provider.list",
    group: "Provider",
    label: "List Providers",
    template: {},
    run: (client, input) => client.provider.list(input),
  },
  {
    id: "provider.auth",
    group: "Provider",
    label: "Provider Auth Methods",
    template: {},
    run: (client, input) => client.provider.auth(input),
  },
  {
    id: "provider.oauth.authorize",
    group: "Provider",
    label: "Provider OAuth Authorize",
    template: { path: { id: "<provider-id>" }, body: { method: 0 } },
    run: (client, input) => client.provider.oauth.authorize(input),
  },
  {
    id: "provider.oauth.callback",
    group: "Provider",
    label: "Provider OAuth Callback",
    template: { path: { id: "<provider-id>" }, body: { code: "<auth-code>" } },
    run: (client, input) => client.provider.oauth.callback(input),
  },

  // Find
  {
    id: "find.text",
    group: "Find",
    label: "Find Text",
    template: { query: { pattern: "TODO" } },
    run: (client, input) => client.find.text(input),
  },
  {
    id: "find.files",
    group: "Find",
    label: "Find Files",
    template: { query: { query: "*.ts", dirs: "false" } },
    run: (client, input) => client.find.files(input),
  },
  {
    id: "find.symbols",
    group: "Find",
    label: "Find Symbols",
    template: { query: { query: "create" } },
    run: (client, input) => client.find.symbols(input),
  },

  // File
  {
    id: "file.list",
    group: "File",
    label: "List Files",
    template: { query: { path: "." } },
    run: (client, input) => client.file.list(input),
  },
  {
    id: "file.read",
    group: "File",
    label: "Read File",
    template: { query: { path: "README.md" } },
    run: (client, input) => client.file.read(input),
  },
  {
    id: "file.status",
    group: "File",
    label: "File Status",
    template: {},
    run: (client, input) => client.file.status(input),
  },

  // App
  {
    id: "app.log",
    group: "App",
    label: "Write App Log",
    template: { body: { service: "control-panel", level: "info", message: "SDK log entry" } },
    run: (client, input) => client.app.log(input),
  },
  {
    id: "app.agents",
    group: "App",
    label: "List Agents",
    template: {},
    run: (client, input) => client.app.agents(input),
  },

  // PTY
  {
    id: "pty.list",
    group: "PTY",
    label: "List PTYs",
    template: {},
    run: (client, input) => client.pty.list(input),
  },
  {
    id: "pty.create",
    group: "PTY",
    label: "Create PTY",
    template: { body: { command: "bash", args: ["-lc", "pwd"], title: "SDK PTY" } },
    run: (client, input) => client.pty.create(input),
  },
  {
    id: "pty.get",
    group: "PTY",
    label: "Get PTY",
    template: { path: { id: "<pty-id>" } },
    run: (client, input) => client.pty.get(input),
  },
  {
    id: "pty.update",
    group: "PTY",
    label: "Update PTY",
    template: { path: { id: "<pty-id>" }, body: { title: "Updated PTY" } },
    run: (client, input) => client.pty.update(input),
  },
  {
    id: "pty.remove",
    group: "PTY",
    label: "Remove PTY",
    template: { path: { id: "<pty-id>" } },
    run: (client, input) => client.pty.remove(input),
  },
  {
    id: "pty.connect",
    group: "PTY",
    label: "Connect PTY",
    template: { path: { id: "<pty-id>" } },
    run: (client, input) => client.pty.connect(input),
  },

  // MCP
  {
    id: "mcp.status",
    group: "MCP",
    label: "MCP Status",
    template: {},
    run: (client, input) => client.mcp.status(input),
  },
  {
    id: "mcp.add",
    group: "MCP",
    label: "MCP Add",
    template: { body: { name: "<server-name>", config: { type: "local", command: ["<command>"] } } },
    run: (client, input) => client.mcp.add(input),
  },
  {
    id: "mcp.connect",
    group: "MCP",
    label: "MCP Connect",
    template: { path: { name: "<server-name>" } },
    run: (client, input) => client.mcp.connect(input),
  },
  {
    id: "mcp.disconnect",
    group: "MCP",
    label: "MCP Disconnect",
    template: { path: { name: "<server-name>" } },
    run: (client, input) => client.mcp.disconnect(input),
  },
  {
    id: "mcp.auth.start",
    group: "MCP",
    label: "MCP Auth Start",
    template: { path: { name: "<server-name>" } },
    run: (client, input) => client.mcp.auth.start(input),
  },
  {
    id: "mcp.auth.callback",
    group: "MCP",
    label: "MCP Auth Callback",
    template: { path: { name: "<server-name>" }, body: { code: "<auth-code>" } },
    run: (client, input) => client.mcp.auth.callback(input),
  },
  {
    id: "mcp.auth.authenticate",
    group: "MCP",
    label: "MCP Auth Authenticate",
    template: { path: { name: "<server-name>" } },
    run: (client, input) => client.mcp.auth.authenticate(input),
  },
  {
    id: "mcp.auth.remove",
    group: "MCP",
    label: "MCP Auth Remove",
    template: { path: { name: "<server-name>" } },
    run: (client, input) => client.mcp.auth.remove(input),
  },

  // LSP
  {
    id: "lsp.status",
    group: "LSP",
    label: "LSP Status",
    template: {},
    run: (client, input) => client.lsp.status(input),
  },

  // Formatter
  {
    id: "formatter.status",
    group: "Formatter",
    label: "Formatter Status",
    template: {},
    run: (client, input) => client.formatter.status(input),
  },

  // TUI
  {
    id: "tui.appendPrompt",
    group: "TUI",
    label: "Append Prompt",
    template: { body: { text: "Hello from SDK" } },
    run: (client, input) => client.tui.appendPrompt(input),
  },
  {
    id: "tui.openHelp",
    group: "TUI",
    label: "Open Help",
    template: {},
    run: (client, input) => client.tui.openHelp(input),
  },
  {
    id: "tui.openSessions",
    group: "TUI",
    label: "Open Sessions",
    template: {},
    run: (client, input) => client.tui.openSessions(input),
  },
  {
    id: "tui.openThemes",
    group: "TUI",
    label: "Open Themes",
    template: {},
    run: (client, input) => client.tui.openThemes(input),
  },
  {
    id: "tui.openModels",
    group: "TUI",
    label: "Open Models",
    template: {},
    run: (client, input) => client.tui.openModels(input),
  },
  {
    id: "tui.submitPrompt",
    group: "TUI",
    label: "Submit Prompt",
    template: {},
    run: (client, input) => client.tui.submitPrompt(input),
  },
  {
    id: "tui.clearPrompt",
    group: "TUI",
    label: "Clear Prompt",
    template: {},
    run: (client, input) => client.tui.clearPrompt(input),
  },
  {
    id: "tui.executeCommand",
    group: "TUI",
    label: "Execute TUI Command",
    template: { body: { command: "agent.cycle" } },
    run: (client, input) => client.tui.executeCommand(input),
  },
  {
    id: "tui.showToast",
    group: "TUI",
    label: "Show Toast",
    template: { body: { title: "SDK", message: "Toast from control panel", variant: "info" } },
    run: (client, input) => client.tui.showToast(input),
  },
  {
    id: "tui.publish",
    group: "TUI",
    label: "Publish Event",
    template: { body: { type: "tui.toast.show", properties: { message: "Event payload", variant: "info" } } },
    run: (client, input) => client.tui.publish(input),
  },
  {
    id: "tui.control.next",
    group: "TUI",
    label: "Control Next",
    template: {},
    run: (client, input) => client.tui.control.next(input),
  },
  {
    id: "tui.control.response",
    group: "TUI",
    label: "Control Response",
    template: { body: { id: "<request-id>", response: "ok" } },
    run: (client, input) => client.tui.control.response(input),
  },

  // Auth
  {
    id: "auth.set",
    group: "Auth",
    label: "Set Auth",
    template: { path: { id: "<auth-id>" }, body: { type: "api", key: "<api-key>" } },
    run: (client, input) => client.auth.set(input),
  },

  // Permissions
  {
    id: "permission.respond",
    group: "Permissions",
    label: "Respond to Permission",
    template: { path: { id: "<session-id>", permissionID: "<permission-id>" }, body: { response: "once" } },
    run: (client, input) => client.postSessionIdPermissionsPermissionId(input),
  },
];
