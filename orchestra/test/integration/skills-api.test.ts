import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillsService } from "../../src/skills/service";
import { createSkillsApiServer } from "../../src/api/skills-server";

let projectDir: string;
let homeDir: string;

describe("skills api", () => {
  beforeAll(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "orch-skill-api-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "orch-skill-api-home-"));
    process.env.OPENCODE_SKILLS_HOME = homeDir;
  });

  afterAll(() => {
    delete process.env.OPENCODE_SKILLS_HOME;
  });

  test("crud endpoints respond", async () => {
    const skills = createSkillsService(projectDir);
    const api = createSkillsApiServer({ config: { port: 0 }, deps: { skills } });
    await api.start();

    try {
      const baseUrl = api.url!;

      const createRes = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            id: "api-skill",
            frontmatter: { description: "API skill", model: "auto" },
            systemPrompt: "API prompt",
          },
          scope: "project",
        }),
      });
      expect(createRes.status).toBe(201);

      const listRes = await fetch(`${baseUrl}/api/skills`);
      const list = (await listRes.json()) as Array<{ id: string }>;
      expect(list.some((skill) => skill.id === "api-skill")).toBe(true);

      const updateRes = await fetch(`${baseUrl}/api/skills/api-skill`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: { frontmatter: { description: "Updated API skill", model: "auto" } },
          scope: "project",
        }),
      });
      expect(updateRes.status).toBe(200);

      const dupRes = await fetch(`${baseUrl}/api/skills/api-skill/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newId: "api-skill-copy", scope: "project" }),
      });
      expect(dupRes.status).toBe(201);

      const deleteRes = await fetch(`${baseUrl}/api/skills/api-skill`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "project" }),
      });
      expect(deleteRes.status).toBe(200);
    } finally {
      await api.stop();
    }
  });
});
