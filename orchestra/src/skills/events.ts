import { EventEmitter } from "node:events";
import type { Skill, SkillScope } from "../types";

export type SkillEvent =
  | { type: "skill.created"; skill: Skill }
  | { type: "skill.updated"; skill: Skill }
  | { type: "skill.deleted"; id: string; scope: SkillScope };

export type SkillsEvents = {
  emit: (event: SkillEvent) => void;
  on: (listener: (event: SkillEvent) => void) => () => void;
};

export function createSkillsEvents(): SkillsEvents {
  const emitter = new EventEmitter();

  return {
    emit: (event) => {
      emitter.emit("event", event);
    },
    on: (listener) => {
      emitter.on("event", listener);
      return () => emitter.off("event", listener);
    },
  };
}
