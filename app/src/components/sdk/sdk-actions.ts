import { authActions } from "./actions/auth-actions";
import { coreActions } from "./actions/core-actions";
import { mcpActions } from "./actions/mcp-actions";
import { platformActions } from "./actions/platform-actions";
import { providerActions } from "./actions/provider-actions";
import { sessionActions } from "./actions/session-actions";
import { toolingActions } from "./actions/tooling-actions";
import { tuiActions } from "./actions/tui-actions";
import type { SdkAction } from "./sdk-action-types";

export type { SdkAction } from "./sdk-action-types";

export const sdkActions: SdkAction[] = [
  ...coreActions,
  ...sessionActions,
  ...providerActions,
  ...platformActions,
  ...mcpActions,
  ...toolingActions,
  ...tuiActions,
  ...authActions,
];
