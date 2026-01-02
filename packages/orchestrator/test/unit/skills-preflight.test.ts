import { describe, expect, test } from "bun:test";
import type { WorkflowDefinition } from "../../src/workflows/types";
import type { WorkerProfile } from "../../src/types";
import {
  collectWorkflowSkillRequirements,
  resolveSkillPermission,
  validateSkills,
} from "../../src/skills/preflight";

describe("skills preflight", () => {
  test("resolves permission patterns by specificity", () => {
    const map = {
      "*": "deny",
      "docs-*": "allow",
      "docs-research": "ask",
    } as const;
    expect(resolveSkillPermission("docs-research", map)).toBe("ask");
    expect(resolveSkillPermission("docs-other", map)).toBe("allow");
    expect(resolveSkillPermission("misc", map)).toBe("deny");
  });

  test("validates missing and denied skills", async () => {
    const result = await validateSkills({
      requiredSkills: ["missing-skill"],
      directory: process.cwd(),
      includeGlobal: false,
      permissionMap: { "*": "deny" },
      toolEnabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.skills[0].status).toBe("missing");
  });

  test("collects workflow and worker required skills", () => {
    const workflow: WorkflowDefinition = {
      id: "test",
      name: "Test",
      description: "Test workflow",
      steps: [
        {
          id: "step-1",
          title: "Step 1",
          workerId: "coder",
          prompt: "Do the thing",
          requiredSkills: ["docs-research"],
        },
      ],
    };
    const profiles: Record<string, WorkerProfile> = {
      coder: {
        id: "coder",
        name: "Coder",
        model: "opencode/gpt-5-nano",
        purpose: "Test",
        whenToUse: "Test",
        requiredSkills: ["code-implementer"],
      },
    };
    const requirements = collectWorkflowSkillRequirements(workflow, profiles);
    expect(requirements.map((req) => req.name).sort()).toEqual([
      "code-implementer",
      "docs-research",
    ]);
  });
});
