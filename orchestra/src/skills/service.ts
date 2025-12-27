import type { Skill, SkillInput, SkillScope } from "../types";
import { createSkill, deleteSkill, duplicateSkill, updateSkill } from "./crud";
import { createSkillsEvents, type SkillsEvents } from "./events";
import { loadAllSkills, loadSkill } from "./loader";
import { resolveProjectDir } from "./paths";

export interface SkillsService {
  events: SkillsEvents;
  list(projectDir?: string): Promise<Skill[]>;
  get(id: string, projectDir?: string): Promise<Skill | undefined>;
  create(input: SkillInput, scope: SkillScope, projectDir?: string): Promise<Skill>;
  update(id: string, updates: Partial<SkillInput>, scope: SkillScope, projectDir?: string): Promise<Skill>;
  delete(id: string, scope: SkillScope, projectDir?: string): Promise<boolean>;
  duplicate(sourceId: string, newId: string, scope: SkillScope, projectDir?: string): Promise<Skill>;
}

export function createSkillsService(projectDir?: string): SkillsService {
  const events = createSkillsEvents();
  const resolvedDir = resolveProjectDir(projectDir);

  return {
    events,
    async list() {
      const skills = await loadAllSkills(resolvedDir);
      return Array.from(skills.values());
    },

    async get(id) {
      return loadSkill(id, resolvedDir);
    },

    async create(input, scope) {
      const skill = await createSkill(input, scope, resolvedDir);
      events.emit({ type: "skill.created", skill });
      return skill;
    },

    async update(id, updates, scope) {
      const skill = await updateSkill(id, updates, scope, resolvedDir);
      events.emit({ type: "skill.updated", skill });
      return skill;
    },

    async delete(id, scope) {
      const ok = await deleteSkill(id, scope, resolvedDir);
      if (ok) events.emit({ type: "skill.deleted", id, scope });
      return ok;
    },

    async duplicate(sourceId, newId, scope) {
      const skill = await duplicateSkill(sourceId, newId, scope, resolvedDir);
      events.emit({ type: "skill.created", skill });
      return skill;
    },
  };
}
