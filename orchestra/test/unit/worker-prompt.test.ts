import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPromptParts, extractTextFromPromptResponse, normalizeBase64Image } from "../../src/workers/prompt";

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

  test("infers mime type from file paths and normalizes data URLs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-prompt-"));
    const jpegPath = join(dir, "photo.jpeg");
    const webpPath = join(dir, "photo.webp");
    const gifPath = join(dir, "photo.gif");
    await writeFile(jpegPath, "data", "utf8");
    await writeFile(webpPath, "data", "utf8");
    await writeFile(gifPath, "data", "utf8");

    const parts = await buildPromptParts({
      message: "Hello",
      attachments: [
        { type: "image", path: jpegPath },
        { type: "image", path: webpPath },
        { type: "image", path: gifPath },
      ],
    });
    const filePart = parts[1] as { mime?: string; url?: string };
    expect(filePart.mime).toBe("image/jpeg");
    expect(filePart.url).toContain("file://");
    expect((parts[2] as { mime?: string }).mime).toBe("image/webp");
    expect((parts[3] as { mime?: string }).mime).toBe("image/gif");

    expect(normalizeBase64Image("data:image/png;base64,abc")).toBe("abc");
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
