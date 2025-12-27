import { describe, expect, test } from "bun:test";
import { resolveProfileInheritance } from "../../src/config/profile-inheritance";

describe("profile inheritance errors", () => {
  test("throws when required fields are missing", () => {
    expect(() =>
      resolveProfileInheritance({
        builtIns: {},
        definitions: {
          alpha: { id: "alpha" },
        },
      }),
    ).toThrow('Profile "alpha" is missing required fields');
  });
});
