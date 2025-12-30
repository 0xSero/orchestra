import type { SdkAction } from "../sdk-action-types";

export const authActions: SdkAction[] = [
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
