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

export type ApiService = ServiceLifecycle & {
  client: ReturnType<typeof createOpencodeClient>;
  createClient: (input: { baseUrl: string; directory?: string }) => ReturnType<typeof createOpencodeClient>;
  createServer: typeof createOpencode;
  session: {
    create: (args: any) => Promise<any>;
    list: (args: any) => Promise<any>;
    get: (args: any) => Promise<any>;
    prompt: (args: any) => Promise<any>;
    promptAsync: (args: any) => Promise<any>;
    messages: (args: any) => Promise<any>;
    messageDelete: (args: any) => Promise<any>;
    abort: (args: any) => Promise<any>;
  };
  event: {
    subscribe: (args: any) => any;
  };
  file: {
    read: (args: any) => Promise<any>;
  };
  find: {
    text: (args: any) => Promise<any>;
    files: (args: any) => Promise<any>;
  };
  project: {
    list: (args: any) => Promise<any>;
    current: (args: any) => Promise<any>;
  };
  path: {
    get: (args: any) => Promise<any>;
  };
  config: {
    get: (args: any) => Promise<any>;
    providers: (args: any) => Promise<any>;
  };
  app: {
    agents: (args: any) => Promise<any>;
    log: (args: any) => Promise<any>;
  };
  tui: {
    appendPrompt: (args: any) => Promise<any>;
    showToast: (args: any) => Promise<any>;
    submitPrompt: (args: any) => Promise<any>;
    publish: (args: any) => Promise<any>;
  };
  auth: {
    set: (args: any) => Promise<any>;
  };
};

function withDirectory(directory: string | undefined, args: any): any {
  if (!directory) return args;
  if (!args || typeof args !== "object") return { query: { directory } };
  const next = { ...args };
  next.query = { ...(args.query ?? {}), directory };
  return next;
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
