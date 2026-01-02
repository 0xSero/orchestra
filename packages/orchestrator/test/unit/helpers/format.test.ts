import { describe, expect, test } from "bun:test";
import {
  isPlainObject,
  asBooleanRecord,
  asStringArray,
  deepMerge,
  getUserConfigDir,
} from "../../../src/helpers/format";

describe("isPlainObject", () => {
  test("returns true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  test("returns false for null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  test("returns false for arrays", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  test("returns false for primitives", () => {
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(123)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

describe("asBooleanRecord", () => {
  test("converts valid boolean record", () => {
    const result = asBooleanRecord({ a: true, b: false });
    expect(result).toEqual({ a: true, b: false });
  });

  test("returns undefined for non-object", () => {
    expect(asBooleanRecord("string")).toBeUndefined();
    expect(asBooleanRecord(123)).toBeUndefined();
    expect(asBooleanRecord(null)).toBeUndefined();
  });

  test("returns undefined if values are not boolean", () => {
    const result = asBooleanRecord({ a: true, b: "not boolean" });
    expect(result).toBeUndefined();
  });

  test("returns undefined for arrays", () => {
    expect(asBooleanRecord([true, false])).toBeUndefined();
  });
});

describe("asStringArray", () => {
  test("converts valid string array", () => {
    const result = asStringArray(["a", "b", "c"]);
    expect(result).toEqual(["a", "b", "c"]);
  });

  test("returns undefined for non-array", () => {
    expect(asStringArray("string")).toBeUndefined();
    expect(asStringArray({})).toBeUndefined();
  });

  test("returns undefined if array contains non-strings", () => {
    const result = asStringArray(["a", 123, "c"]);
    expect(result).toBeUndefined();
  });

  test("returns empty array as valid", () => {
    expect(asStringArray([])).toEqual([]);
  });
});

describe("deepMerge", () => {
  test("merges simple objects", () => {
    const base = { a: 1, b: 2 };
    const override = { c: 3 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  test("override replaces base values", () => {
    const base = { a: 1, b: 2 };
    const override = { a: 10 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 10, b: 2 });
  });

  test("merges nested objects recursively", () => {
    const base = { a: { nested: 1 }, b: 2 };
    const override = { a: { added: 2 }, c: 3 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: { nested: 1, added: 2 }, b: 2, c: 3 });
  });

  test("arrays are replaced, not merged", () => {
    const base = { arr: [1, 2] };
    const override = { arr: [3, 4] };
    const result = deepMerge(base, override);
    expect(result).toEqual({ arr: [3, 4] });
  });
});

describe("getUserConfigDir", () => {
  test("returns XDG_CONFIG_HOME on non-Windows", () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    const originalXDG = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/custom/config";
    expect(getUserConfigDir()).toBe("/custom/config");
    process.env.XDG_CONFIG_HOME = originalXDG;
    Object.defineProperty(process, "platform", { value: original });
  });

  test("returns .config on non-Windows when XDG not set", () => {
    const original = process.platform;
    const originalXDG = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = undefined;
    expect(getUserConfigDir()).toMatch(/\.config$/);
    process.env.XDG_CONFIG_HOME = originalXDG;
    Object.defineProperty(process, "platform", { value: original });
  });

  test("returns APPDATA on Windows", () => {
    const original = process.platform;
    const originalAppData = process.env.APPDATA;
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
    expect(getUserConfigDir()).toBe("C:\\Users\\test\\AppData\\Roaming");
    process.env.APPDATA = originalAppData;
    Object.defineProperty(process, "platform", { value: original });
  });
});
