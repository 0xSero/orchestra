// @jsxImportSource solid-js
import { render, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentsProvider, useAgents } from "@/context/agents";
import type { AgentProfile } from "@/types/agent";

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  onmessage: ((event: MessageEvent) => void) | null = null;
  addEventListener() {}
  close() {}
}

describe("AgentsProvider", () => {
  const baseUrl = "http://localhost:4097";
  let agentsStore: AgentProfile[];

  beforeEach(() => {
    agentsStore = [
      {
        id: "coder",
        source: { type: "builtin" },
        frontmatter: { name: "coder", description: "Coder", model: "auto" },
        systemPrompt: "",
        filePath: "builtin:coder",
        hasScripts: false,
        hasReferences: false,
        hasAssets: false,
      },
    ];

    const globalScope = globalThis as typeof globalThis & {
      EventSource?: typeof EventSource;
      fetch?: typeof fetch;
    };

    globalScope.EventSource = MockEventSource as unknown as typeof EventSource;
    globalScope.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/skills") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => agentsStore,
        };
      }

      if (url.endsWith("/api/skills") && method === "POST") {
        const body = JSON.parse(init?.body as string);
        const created: AgentProfile = {
          id: body.input.id,
          source: { type: "project", path: "/tmp" },
          frontmatter: { name: body.input.id, ...body.input.frontmatter },
          systemPrompt: body.input.systemPrompt ?? "",
          filePath: "/tmp/SKILL.md",
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
        };
        agentsStore = [...agentsStore, created];
        return {
          ok: true,
          status: 201,
          json: async () => created,
        };
      }

      if (url.includes("/api/skills/") && method === "PUT") {
        const id = url.split("/").pop()!;
        const body = JSON.parse(init?.body as string);
        agentsStore = agentsStore.map((agent) =>
          agent.id === id
            ? {
                ...agent,
                frontmatter: {
                  ...agent.frontmatter,
                  ...body.updates.frontmatter,
                  name: id,
                },
              }
            : agent,
        );
        const updated = agentsStore.find((agent) => agent.id === id)!;
        return {
          ok: true,
          status: 200,
          json: async () => updated,
        };
      }

      if (url.includes("/api/skills/") && method === "DELETE") {
        const id = url.split("/").pop()!;
        agentsStore = agentsStore.filter((agent) => agent.id !== id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates, updates, and deletes agents via context", async () => {
    let ctx: ReturnType<typeof useAgents> | undefined;

    const Harness = () => {
      ctx = useAgents();
      return null;
    };

    render(() => (
      <AgentsProvider baseUrl={baseUrl}>
        <Harness />
      </AgentsProvider>
    ));

    await waitFor(() => {
      expect(ctx?.agents().length).toBe(1);
    });

    await ctx!.createAgent(
      { id: "new-agent", frontmatter: { description: "New agent", model: "auto" }, systemPrompt: "" },
      "project",
    );

    await waitFor(() => {
      expect(ctx?.agents().length).toBe(2);
    });

    await ctx!.updateAgent("new-agent", { frontmatter: { description: "Updated", model: "auto" } }, "project");

    await waitFor(() => {
      const updated = ctx?.agents().find((agent) => agent.id === "new-agent");
      expect(updated?.frontmatter.description).toBe("Updated");
    });

    await ctx!.deleteAgent("new-agent", "project");

    await waitFor(() => {
      expect(ctx?.agents().length).toBe(1);
    });
  });
});
