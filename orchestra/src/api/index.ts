import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { Factory, ServiceLifecycle } from "../types";

export * from "./skills-server";

export type ApiConfig = {
  baseUrl?: string;
  directory?: string;
};

export type ApiDeps = {
  client?: ReturnType<typeof createOpencodeClient>;
};

/**
 * Simplified API service interface for OpenCode SDK operations.
 *
 * Note: This interface uses `unknown` for args/return types instead of the SDK's
 * complex generic types. This is intentional - the SDK types have deeply nested
 * generics with conditional types that would require complex type gymnastics to
 * properly expose. Using `unknown` provides a clean interface while the actual
 * implementation delegates to the properly-typed SDK client.
 *
 * Callers should refer to SDK documentation for the actual request/response shapes.
 */
export type ApiService = ServiceLifecycle & {
  client: ReturnType<typeof createOpencodeClient>;
  createClient: (input: { baseUrl: string; directory?: string }) => ReturnType<typeof createOpencodeClient>;
  createServer: typeof createOpencode;
  session: {
    create: (args: unknown) => Promise<unknown>;
    list: (args: unknown) => Promise<unknown>;
    get: (args: unknown) => Promise<unknown>;
    prompt: (args: unknown) => Promise<unknown>;
    promptAsync: (args: unknown) => Promise<unknown>;
    messages: (args: unknown) => Promise<unknown>;
    messageDelete: (args: unknown) => Promise<unknown>;
    abort: (args: unknown) => Promise<unknown>;
  };
  event: {
    subscribe: (args: unknown) => unknown;
  };
  file: {
    read: (args: unknown) => Promise<unknown>;
  };
  find: {
    text: (args: unknown) => Promise<unknown>;
    files: (args: unknown) => Promise<unknown>;
  };
  project: {
    list: (args: unknown) => Promise<unknown>;
    current: (args: unknown) => Promise<unknown>;
  };
  path: {
    get: (args: unknown) => Promise<unknown>;
  };
  config: {
    get: (args: unknown) => Promise<unknown>;
    providers: (args: unknown) => Promise<unknown>;
  };
  app: {
    agents: (args: unknown) => Promise<unknown>;
    log: (args: unknown) => Promise<unknown>;
  };
  tui: {
    appendPrompt: (args: unknown) => Promise<unknown>;
    showToast: (args: unknown) => Promise<unknown>;
    submitPrompt: (args: unknown) => Promise<unknown>;
    publish: (args: unknown) => Promise<unknown>;
  };
  auth: {
    set: (args: unknown) => Promise<unknown>;
  };
};

/**
 * SDK request arguments shape - simplified for type checking.
 */
type SdkArgs = { query?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Helper to inject directory into SDK request arguments.
 *
 * Note: Returns `any` because the SDK client methods expect specific option types
 * (e.g., Options<SessionGetData>). The actual type validation happens in the SDK.
 * Using `any` here allows the wrapper to remain flexible while the SDK enforces
 * the actual type constraints at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDirectory(directory: string | undefined, args: unknown): any {
  if (!directory) return args;
  if (!args || typeof args !== "object") return { query: { directory } };
  const typedArgs = args as SdkArgs;
  return { ...typedArgs, query: { ...(typedArgs.query ?? {}), directory } };
}

export const createApi: Factory<ApiConfig, ApiDeps, ApiService> = ({ config, deps }) => {
  const client = deps.client ?? createOpencodeClient({ baseUrl: config.baseUrl });
  const directory = config.directory;

  return {
    client,
    createClient: ({ baseUrl, directory: dir }) => createOpencodeClient({ baseUrl, directory: dir }),
    createServer: createOpencode,
    session: {
      create: (args) => client.session.create(withDirectory(directory, args)),
      list: (args) => client.session.list(withDirectory(directory, args)),
      get: (args) => client.session.get(withDirectory(directory, args)),
      prompt: (args) => client.session.prompt(withDirectory(directory, args)),
      promptAsync: (args) => client.session.promptAsync(withDirectory(directory, args)),
      messages: (args) => client.session.messages(withDirectory(directory, args)),
      messageDelete: (args) => client.session.delete(withDirectory(directory, args)),
      abort: (args) => client.session.abort(withDirectory(directory, args)),
    },
    event: {
      subscribe: (args) => client.event.subscribe(withDirectory(directory, args)),
    },
    file: {
      read: (args) => client.file.read(withDirectory(directory, args)),
    },
    find: {
      text: (args) => client.find.text(withDirectory(directory, args)),
      files: (args) => client.find.files(withDirectory(directory, args)),
    },
    project: {
      list: (args) => client.project.list(withDirectory(directory, args)),
      current: (args) => client.project.current(withDirectory(directory, args)),
    },
    path: {
      get: (args) => client.path.get(withDirectory(directory, args)),
    },
    config: {
      get: (args) => client.config.get(withDirectory(directory, args)),
      providers: (args) => client.config.providers(withDirectory(directory, args)),
    },
    app: {
      agents: (args) => client.app.agents(withDirectory(directory, args)),
      log: (args) => client.app.log(withDirectory(directory, args)),
    },
    tui: {
      appendPrompt: (args) => client.tui.appendPrompt(withDirectory(directory, args)),
      showToast: (args) => client.tui.showToast(withDirectory(directory, args)),
      submitPrompt: (args) => client.tui.submitPrompt(withDirectory(directory, args)),
      publish: (args) => client.tui.publish(withDirectory(directory, args)),
    },
    auth: {
      set: (args) => client.auth.set(withDirectory(directory, args)),
    },
    start: async () => {},
    stop: async () => {},
    health: async () => ({ ok: true }),
  };
};
