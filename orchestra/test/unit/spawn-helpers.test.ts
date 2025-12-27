import { describe, expect, test } from "bun:test";
import { extractSdkData, extractSdkErrorMessage, isValidPort, withTimeout } from "../../src/workers/spawn-helpers";

describe("spawn helpers", () => {
  test("extracts sdk data and error messages", () => {
    expect(extractSdkData({ data: { ok: true } })).toEqual({ ok: true });
    expect(extractSdkData({ ok: true })).toEqual({ ok: true });

    expect(extractSdkErrorMessage(new Error("boom"))).toBe("boom");
    expect(extractSdkErrorMessage("string")).toBe("string");
    expect(extractSdkErrorMessage({ data: { message: "nested" } })).toBe("nested");
    expect(extractSdkErrorMessage({ message: "plain" })).toBe("plain");
    expect(extractSdkErrorMessage({ code: "E" })).toContain("\"code\"");

    const circular: any = {};
    circular.self = circular;
    expect(extractSdkErrorMessage(circular)).toBe("[object Object]");
  });

  test("validates ports", () => {
    expect(isValidPort(0)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(-1)).toBe(false);
    expect(isValidPort(99999)).toBe(false);
  });

  test("withTimeout aborts when deadline is exceeded", async () => {
    const controller = new AbortController();
    await expect(withTimeout(new Promise(() => {}), 1, controller)).rejects.toThrow("worker bootstrap timed out");
    expect(controller.signal.aborted).toBe(true);
  });
});
