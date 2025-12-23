import { describe, expect, test, beforeEach } from "bun:test";
import {
  buildPassthroughSystemPrompt,
  clearAllPassthrough,
  clearPassthrough,
  getPassthrough,
  isPassthroughExitMessage,
  setPassthrough,
} from "../../../src/core/passthrough";

describe("passthrough session state", () => {
  beforeEach(() => {
    clearAllPassthrough();
  });

  test("set/get/clear passthrough", () => {
    expect(getPassthrough("s1")).toBeUndefined();
    setPassthrough("s1", "docs");
    expect(getPassthrough("s1")?.workerId).toBe("docs");
    expect(clearPassthrough("s1")).toBe(true);
    expect(getPassthrough("s1")).toBeUndefined();
  });

  test("detects exit commands", () => {
    expect(isPassthroughExitMessage("exit passthrough")).toBe(true);
    expect(isPassthroughExitMessage("EXIT DOCS MODE")).toBe(true);
    expect(isPassthroughExitMessage(" back ")).toBe(true);
    expect(isPassthroughExitMessage("exit code 1")).toBe(false);
  });

  test("system prompt contains internal bypass marker", () => {
    const prompt = buildPassthroughSystemPrompt("docs");
    expect(prompt).toContain("<orchestrator-passthrough");
    expect(prompt).toContain("<orchestrator-internal");
  });
});

