import { describe, expect, test } from "bun:test";
import { asBooleanRecord, asStringArray, deepMerge, getUserConfigDir, isPlainObject } from "../../src/helpers/format";

describe("format helpers", () => {
  test("asStringArray rejects non-string values", () => {
    expect(asStringArray(["ok", 1] as unknown)).toBeUndefined();
  });

  test("asBooleanRecord rejects non-boolean values", () => {
    expect(asBooleanRecord({ ok: true, nope: "false" } as unknown)).toBeUndefined();
  });

  test("deepMerge prefers arrays and nested objects", () => {
    const merged = deepMerge(
      { nested: { a: 1, list: ["a"] }, keep: true },
      { nested: { b: 2, list: ["b"] }, added: 1 },
    );
    expect(merged).toEqual({ nested: { a: 1, b: 2, list: ["b"] }, keep: true, added: 1 });
  });

  test("isPlainObject excludes arrays", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject({ ok: true })).toBe(true);
  });

  test("getUserConfigDir uses APPDATA on windows", () => {
    const original = process.platform;
    const originalAppdata = process.env.APPDATA;
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";

    try {
      expect(getUserConfigDir()).toBe("C:\\Users\\test\\AppData\\Roaming");
    } finally {
      Object.defineProperty(process, "platform", { value: original });
      if (originalAppdata) process.env.APPDATA = originalAppdata;
      else delete process.env.APPDATA;
    }
  });
});
