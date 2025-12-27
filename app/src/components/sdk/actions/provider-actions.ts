import type { SdkAction } from "../sdk-action-types";

export const providerActions: SdkAction[] = [
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
];
