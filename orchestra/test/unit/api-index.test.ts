import { describe, expect, test } from "bun:test";
import { createApi } from "../../src/api";

const createStubClient = () => {
  const calls: Record<string, unknown> = {};
  const record =
    (name: string) =>
    async (args: unknown): Promise<unknown> => {
      calls[name] = args;
      return args;
    };
  const recordSync = (name: string) => (args: unknown): unknown => {
    calls[name] = args;
    return args;
  };

  const client = {
    session: {
      create: record("session.create"),
      list: record("session.list"),
      get: record("session.get"),
      prompt: record("session.prompt"),
      promptAsync: record("session.promptAsync"),
      messages: record("session.messages"),
      delete: record("session.delete"),
      abort: record("session.abort"),
    },
    event: { subscribe: recordSync("event.subscribe") },
    file: { read: record("file.read") },
    find: {
      text: record("find.text"),
      files: record("find.files"),
    },
    project: {
      list: record("project.list"),
      current: record("project.current"),
    },
    path: { get: record("path.get") },
    config: {
      get: record("config.get"),
      providers: record("config.providers"),
    },
    app: {
      agents: record("app.agents"),
      log: record("app.log"),
    },
    tui: {
      appendPrompt: record("tui.appendPrompt"),
      showToast: record("tui.showToast"),
      submitPrompt: record("tui.submitPrompt"),
      publish: record("tui.publish"),
    },
    auth: { set: record("auth.set") },
  };

  return { client: client as never, calls };
};

describe("api service", () => {
  test("injects directory into requests", async () => {
    const { client, calls } = createStubClient();
    const api = createApi({ config: { baseUrl: "http://localhost", directory: "/tmp/project" }, deps: { client } });

    await api.session.create({ query: { foo: "bar" } });
    await api.session.list(undefined);
    await api.session.get({ path: { id: "1" } });
    await api.session.prompt({ path: { id: "1" }, body: {} });
    await api.session.promptAsync({ path: { id: "1" }, body: {} });
    await api.session.messages({ path: { id: "1" } });
    await api.session.messageDelete({ path: { id: "1" } });
    await api.session.abort({ path: { id: "1" } });
    api.event.subscribe({ stream: true });
    await api.file.read({ path: "file" });
    await api.find.text({ query: "text" });
    await api.find.files({ query: "files" });
    await api.project.list({});
    await api.project.current({});
    await api.path.get({ path: "p" });
    await api.config.get({});
    await api.config.providers({});
    await api.app.agents({});
    await api.app.log({});
    await api.tui.appendPrompt({});
    await api.tui.showToast({});
    await api.tui.submitPrompt({});
    await api.tui.publish({});
    await api.auth.set({});

    expect(calls["session.create"]).toEqual({ query: { foo: "bar", directory: "/tmp/project" } });
    expect(calls["session.list"]).toEqual({ query: { directory: "/tmp/project" } });

    const apiClient = api.createClient({ baseUrl: "http://localhost", directory: "/tmp/project" });
    expect(apiClient).toBeTruthy();
    await api.start();
    await api.stop();
    const health = await api.health();
    expect(health.ok).toBe(true);
  });

  test("returns raw args when directory is missing", async () => {
    const { client, calls } = createStubClient();
    const api = createApi({ config: { baseUrl: "http://localhost" }, deps: { client } });

    await api.session.list("bad" as never);
    await api.session.create({ query: { ok: true } });

    expect(calls["session.list"]).toEqual({});
    expect(calls["session.create"]).toEqual({ query: { ok: true } });
  });
});
