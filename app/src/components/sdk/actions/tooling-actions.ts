import type { SdkAction } from "../sdk-action-types";

export const toolingActions: SdkAction[] = [
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
];
