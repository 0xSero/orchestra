import { describe, expect, test } from "bun:test";
import { toBool, renderMarkdownTable } from "../../../src/command/markdown";

describe("toBool", () => {
  test("returns true for true", () => {
    expect(toBool(true)).toBe(true);
  });

  test("returns false for false", () => {
    expect(toBool(false)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(toBool(undefined)).toBe(false);
  });

  test("returns false for null", () => {
    expect(toBool(null)).toBe(false);
  });

  test("returns false for strings", () => {
    expect(toBool("true")).toBe(false);
    expect(toBool("false")).toBe(false);
  });

  test("returns false for numbers", () => {
    expect(toBool(0)).toBe(false);
    expect(toBool(1)).toBe(false);
  });
});

describe("renderMarkdownTable", () => {
  test("renders table with headers and rows", () => {
    const headers = ["Name", "Age", "City"];
    const rows = [
      ["Alice", "30", "NYC"],
      ["Bob", "25", "LA"],
    ];
    const result = renderMarkdownTable(headers, rows);
    expect(result).toContain("| Name | Age | City |");
    expect(result).toContain("| --- | --- | --- |");
    expect(result).toContain("| Alice | 30 | NYC |");
    expect(result).toContain("| Bob | 25 | LA |");
  });

  test("escapes pipe characters in cells content", () => {
    const header = ["Name"];
    const rows = [["Col | A"]];
    const result = renderMarkdownTable(header, rows);
    expect(result).toContain("Col \\| A");
  });

  test("replaces newlines with spaces", () => {
    const header = ["Name"];
    const rows = [["Multi\nLine"]];
    const result = renderMarkdownTable(header, rows);
    expect(result).toContain("Multi Line");
  });

  test("handles empty headers", () => {
    const result = renderMarkdownTable([], []);
    // Empty headers produces minimal table
    expect(result).toContain("|");
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles empty rows", () => {
    const header = ["Name"];
    const rows: string[][] = [];
    const result = renderMarkdownTable(header, rows);
    expect(result).toContain("| Name |");
    expect(result).toContain("| --- |");
  });

  test("handles single row", () => {
    const header = ["One"];
    const rows = [["Only"]];
    const result = renderMarkdownTable(header, rows);
    expect(result).toBe("| One |\n| --- |\n| Only |");
  });

  test("handles special characters in content", () => {
    const header = ["Name"];
    const rows = [["Test**Bold**"]];
    const result = renderMarkdownTable(header, rows);
    expect(result).toContain("Test**Bold**");
  });
});
