import type { Skill, SkillInput, SkillScope } from "../types";
import { loadAllSkills, loadSkill } from "./loader";
import { createSkill, updateSkill, deleteSkill, duplicateSkill } from "./crud";
import { createSkillsEvents, type SkillsEvents } from "./events";

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

  return {
    events,
    async list() {
      const skills = await loadAllSkills(projectDir);
      return Array.from(skills.values());
    },

    async get(id) {
      return loadSkill(id, projectDir);
    },

    async create(input, scope) {
      const skill = await createSkill(input, scope, projectDir);
      events.emit({ type: "skill.created", skill });
      return skill;
    },

    async update(id, updates, scope) {
      const skill = await updateSkill(id, updates, scope, projectDir);
      events.emit({ type: "skill.updated", skill });
      return skill;
    },

    async delete(id, scope) {
      const ok = await deleteSkill(id, scope, projectDir);
      if (ok) events.emit({ type: "skill.deleted", id, scope });
      return ok;
    },

    async duplicate(sourceId, newId, scope) {
      const skill = await duplicateSkill(sourceId, newId, scope, projectDir);
      events.emit({ type: "skill.created", skill });
      return skill;
    },
  };
}
