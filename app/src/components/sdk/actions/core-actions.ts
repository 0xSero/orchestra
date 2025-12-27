import type { SdkAction } from "../sdk-action-types";

export const coreActions: SdkAction[] = [
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
];
