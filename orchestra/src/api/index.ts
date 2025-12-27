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
 * The SDK uses complex generics; we normalize to a simple shape here and cast
 * back to the SDK's expected types at call sites.
 */
function withDirectory(directory: string | undefined, args: unknown): SdkArgs {
  if (!directory) {
    if (!args || typeof args !== "object") return {};
    return args as SdkArgs;
  }
  if (!args || typeof args !== "object") return { query: { directory } };
  const typedArgs = args as SdkArgs;
  return { ...typedArgs, query: { ...(typedArgs.query ?? {}), directory } };
}

export const createApi: Factory<ApiConfig, ApiDeps, ApiService> = ({ config, deps }) => {
  const client = deps.client ?? createOpencodeClient({ baseUrl: config.baseUrl });
  const directory = config.directory;
  const withDirectoryArgs = <T>(args: unknown): T => withDirectory(directory, args) as T;

  return {
    client,
    createClient: ({ baseUrl, directory: dir }) => createOpencodeClient({ baseUrl, directory: dir }),
    createServer: createOpencode,
    session: {
      create: (args) => client.session.create(withDirectoryArgs<Parameters<typeof client.session.create>[0]>(args)),
      list: (args) => client.session.list(withDirectoryArgs<Parameters<typeof client.session.list>[0]>(args)),
      get: (args) => client.session.get(withDirectoryArgs<Parameters<typeof client.session.get>[0]>(args)),
      prompt: (args) => client.session.prompt(withDirectoryArgs<Parameters<typeof client.session.prompt>[0]>(args)),
      promptAsync: (args) =>
        client.session.promptAsync(withDirectoryArgs<Parameters<typeof client.session.promptAsync>[0]>(args)),
      messages: (args) =>
        client.session.messages(withDirectoryArgs<Parameters<typeof client.session.messages>[0]>(args)),
      messageDelete: (args) =>
        client.session.delete(withDirectoryArgs<Parameters<typeof client.session.delete>[0]>(args)),
      abort: (args) => client.session.abort(withDirectoryArgs<Parameters<typeof client.session.abort>[0]>(args)),
    },
    event: {
      subscribe: (args) =>
        client.event.subscribe(withDirectoryArgs<Parameters<typeof client.event.subscribe>[0]>(args)),
    },
    file: {
      read: (args) => client.file.read(withDirectoryArgs<Parameters<typeof client.file.read>[0]>(args)),
    },
    find: {
      text: (args) => client.find.text(withDirectoryArgs<Parameters<typeof client.find.text>[0]>(args)),
      files: (args) => client.find.files(withDirectoryArgs<Parameters<typeof client.find.files>[0]>(args)),
    },
    project: {
      list: (args) => client.project.list(withDirectoryArgs<Parameters<typeof client.project.list>[0]>(args)),
      current: (args) => client.project.current(withDirectoryArgs<Parameters<typeof client.project.current>[0]>(args)),
    },
    path: {
      get: (args) => client.path.get(withDirectoryArgs<Parameters<typeof client.path.get>[0]>(args)),
    },
    config: {
      get: (args) => client.config.get(withDirectoryArgs<Parameters<typeof client.config.get>[0]>(args)),
      providers: (args) =>
        client.config.providers(withDirectoryArgs<Parameters<typeof client.config.providers>[0]>(args)),
    },
    app: {
      agents: (args) => client.app.agents(withDirectoryArgs<Parameters<typeof client.app.agents>[0]>(args)),
      log: (args) => client.app.log(withDirectoryArgs<Parameters<typeof client.app.log>[0]>(args)),
    },
    tui: {
      appendPrompt: (args) =>
        client.tui.appendPrompt(withDirectoryArgs<Parameters<typeof client.tui.appendPrompt>[0]>(args)),
      showToast: (args) => client.tui.showToast(withDirectoryArgs<Parameters<typeof client.tui.showToast>[0]>(args)),
      submitPrompt: (args) =>
        client.tui.submitPrompt(withDirectoryArgs<Parameters<typeof client.tui.submitPrompt>[0]>(args)),
      publish: (args) => client.tui.publish(withDirectoryArgs<Parameters<typeof client.tui.publish>[0]>(args)),
    },
    auth: {
      set: (args) => client.auth.set(withDirectoryArgs<Parameters<typeof client.auth.set>[0]>(args)),
    },
    start: async () => {},
    stop: async () => {},
    health: async () => ({ ok: true }),
  };
};
