import type { SdkAction } from "../sdk-action-types";

export const mcpActions: SdkAction[] = [
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
];
