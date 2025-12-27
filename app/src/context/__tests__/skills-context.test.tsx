import { render, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SkillsProvider, useSkills } from "@/context/skills";
import type { Skill } from "@/types/skill";

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  addEventListener() {}
  close() {}
}

describe("SkillsProvider", () => {
  const baseUrl = "http://localhost:4097";
  let skillsStore: Skill[];

  beforeEach(() => {
    skillsStore = [
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

    (globalThis as any).EventSource = MockEventSource;
    (globalThis as any).fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/skills") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => skillsStore,
        };
      }

      if (url.endsWith("/api/skills") && method === "POST") {
        const body = JSON.parse(init?.body as string);
        const created: Skill = {
          id: body.input.id,
          source: { type: "project", path: "/tmp" },
          frontmatter: { name: body.input.id, ...body.input.frontmatter },
          systemPrompt: body.input.systemPrompt ?? "",
          filePath: "/tmp/SKILL.md",
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
        };
        skillsStore = [...skillsStore, created];
        return {
          ok: true,
          status: 201,
          json: async () => created,
        };
      }

      if (url.includes("/api/skills/") && method === "PUT") {
        const id = url.split("/").pop()!;
        const body = JSON.parse(init?.body as string);
        skillsStore = skillsStore.map((skill) =>
          skill.id === id
            ? {
                ...skill,
                frontmatter: {
                  ...skill.frontmatter,
                  ...body.updates.frontmatter,
                  name: id,
                },
              }
            : skill,
        );
        const updated = skillsStore.find((skill) => skill.id === id)!;
        return {
          ok: true,
          status: 200,
          json: async () => updated,
        };
      }

      if (url.includes("/api/skills/") && method === "DELETE") {
        const id = url.split("/").pop()!;
        skillsStore = skillsStore.filter((skill) => skill.id !== id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates, updates, and deletes skills via context", async () => {
    let ctx: ReturnType<typeof useSkills> | undefined;

    const Harness = () => {
      ctx = useSkills();
      return null;
    };

    render(() => (
      <SkillsProvider baseUrl={baseUrl}>
        <Harness />
      </SkillsProvider>
    ));

    await waitFor(() => {
      expect(ctx?.skills().length).toBe(1);
    });

    await ctx!.createSkill(
      { id: "new-skill", frontmatter: { description: "New skill", model: "auto" }, systemPrompt: "" },
      "project",
    );

    await waitFor(() => {
      expect(ctx?.skills().length).toBe(2);
    });

    await ctx!.updateSkill("new-skill", { frontmatter: { description: "Updated", model: "auto" } }, "project");

    await waitFor(() => {
      const updated = ctx?.skills().find((skill) => skill.id === "new-skill");
      expect(updated?.frontmatter.description).toBe("Updated");
    });

    await ctx!.deleteSkill("new-skill", "project");

    await waitFor(() => {
      expect(ctx?.skills().length).toBe(1);
    });
  });
});
