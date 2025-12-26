import type { Skill } from "../types";
import { builtInProfiles } from "../workers/profiles";
import { profileToSkill } from "./convert";

export function loadBuiltinSkills(): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  for (const profile of Object.values(builtInProfiles)) {
    const skill = profileToSkill(profile, { type: "builtin" });
    skill.filePath = `builtin:${skill.id}`;
    skills.set(skill.id, skill);
  }
  return skills;
}
