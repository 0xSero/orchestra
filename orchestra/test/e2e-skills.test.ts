import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillsApiServer } from "../src/api/skills-server";
import { createSkillsService } from "../src/skills/service";

async function waitForSse(baseUrl: string, matcher: RegExp, timeoutMs = 4000) {
  return await new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for SSE event"));
    }, timeoutMs);

    const req = request(`${baseUrl}/api/skills/events`, (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buffer += chunk;
        if (matcher.test(buffer)) {
          clearTimeout(timer);
          resolve(buffer);
          req.destroy();
        }
      });
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

describe("skills e2e", () => {
  let projectDir: string;
  let homeDir: string;

  beforeAll(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "orch-skill-e2e-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "orch-skill-e2e-home-"));
    process.env.OPENCODE_SKILLS_HOME = homeDir;
  });

  afterAll(() => {
    delete process.env.OPENCODE_SKILLS_HOME;
  });

  test("sse emits skill events", async () => {
    const skills = createSkillsService(projectDir);
    const api = createSkillsApiServer({ config: { port: 0 }, deps: { skills } });
    await api.start();

    try {
      const baseUrl = api.url!;
      const ssePromise = waitForSse(baseUrl, /skill\.created/);

      await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            id: "stream-skill",
            frontmatter: { description: "Stream skill", model: "auto" },
            systemPrompt: "Streaming",
          },
          scope: "project",
        }),
      });

      const output = await ssePromise;
      expect(output).toContain("skill.created");
    } finally {
      await api.stop();
    }
  }, 10000);
});
