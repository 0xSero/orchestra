import { describe, expect, test } from "bun:test";
import { buildPromptParts, extractTextFromPromptResponse } from "../../src/workers/prompt";

describe("worker prompt", () => {
  test("builds prompt parts with base64 attachments", async () => {
    const base64 = Buffer.from("hello", "utf8").toString("base64");
    const parts = await buildPromptParts({
      message: "Hello",
      attachments: [{ type: "image", base64, mimeType: "image/png" }],
    });

    expect(parts[0]).toMatchObject({ type: "text", text: "Hello" });
    const filePart = parts[1] as { type: string; url: string; mime: string };
    expect(filePart.type).toBe("file");
    expect(filePart.url).toContain("data:image/png;base64");
    expect(filePart.mime).toBe("image/png");
  });

  test("extracts text from prompt response", () => {
    const res = {
      parts: [
        { type: "text", text: "alpha" },
        { type: "reasoning", text: "beta" },
      ],
    };

    const extracted = extractTextFromPromptResponse(res);
    expect(extracted.text).toContain("alpha");
    expect(extracted.text).not.toContain("beta");
  });

  test("returns debug when no text parts", () => {
    const res = { parts: [{ type: "tool" }] };
    const extracted = extractTextFromPromptResponse(res);
    expect(extracted.text).toBe("");
    expect(extracted.debug).toContain("parts:");
  });
});
