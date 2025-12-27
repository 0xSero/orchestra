import { describe, expect, test } from "bun:test";
import { createSkillsEvents } from "../../src/skills/events";

describe("skills events", () => {
  test("emits events and supports unsubscribe", () => {
    const events = createSkillsEvents();
    const received: string[] = [];
    const unsubscribe = events.on((event) => {
      received.push(event.type);
    });

    events.emit({ type: "skill.created", skill: {} as never });
    unsubscribe();
    events.emit({ type: "skill.deleted", id: "alpha", scope: "project" });

    expect(received).toEqual(["skill.created"]);
  });
});
