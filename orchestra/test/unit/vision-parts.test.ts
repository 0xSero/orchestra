import { describe, expect, test } from "bun:test";
import { formatVisionAnalysis, hasVisionParts, isImagePart, replaceImagesWithText } from "../../src/ux/vision-parts";

describe("vision parts utilities", () => {
  test("detects image parts and formats analysis", () => {
    expect(hasVisionParts([])).toBe(false);
    expect(hasVisionParts("nope" as never)).toBe(false);
    expect(isImagePart({ type: "image" })).toBe(true);
    expect(isImagePart({ type: "file", mime: "image/png" })).toBe(true);
    expect(isImagePart({ type: "file", url: "data:image/png;base64,abc" })).toBe(true);
    expect(isImagePart({ type: "file", url: "clipboard" })).toBe(true);

    expect(formatVisionAnalysis({ response: " ok " })).toBe("[VISION ANALYSIS]\nok");
    expect(formatVisionAnalysis({ error: " fail " })).toBe("[VISION ANALYSIS FAILED]\nfail");
    expect(formatVisionAnalysis({})).toContain("Vision analysis unavailable");
  });

  test("replaces image parts with text", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "file", mime: "image/png", url: "data:image/png;base64,abc" },
    ];

    const replaced = replaceImagesWithText(parts, "analysis", { messageID: "msg-1", sessionID: "s1" });
    expect(replaced.length).toBe(1);
    expect(replaced[0]?.text).toContain("analysis");

    const withoutText = replaceImagesWithText([{ type: "file", mime: "image/png", url: "clipboard" }], "analysis", {
      messageID: "msg-2",
      sessionID: "s2",
    });
    expect(withoutText[0]?.type).toBe("text");
    expect(withoutText[0]?.id).toContain("msg-2-vision-placeholder");

    const unchanged = replaceImagesWithText([{ type: "text", text: "only text" }], "analysis");
    expect(unchanged).toEqual([{ type: "text", text: "only text" }]);
  });
});
