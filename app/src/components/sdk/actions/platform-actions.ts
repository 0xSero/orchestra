import type { SdkAction } from "../sdk-action-types";

export const platformActions: SdkAction[] = [
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
];
