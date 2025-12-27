import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { VisionPart } from "../../src/ux/vision-types";
import { __test__, extractVisionAttachments } from "../../src/ux/vision-attachments";

describe("vision attachments", () => {
  test("extracts file, file URL, data URL, and base64 image parts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-vision-attach-"));
    const filePath = join(dir, "image.jpg");
    await writeFile(filePath, "hello", "utf8");
    const fileUrl = pathToFileURL(filePath).toString();

    const parts: VisionPart[] = [
      { type: "image", url: filePath },
      { type: "image", url: fileUrl },
      { type: "file", url: "data:image/png;base64,aGVsbG8=", mime: "image/png" },
      { type: "image", base64: "aGVsbG8=" },
      { type: "image", url: "file:///missing.png" },
      { type: "image", url: "data:text/plain;base64,aGVsbG8=" },
    ];

    const attachments = await extractVisionAttachments(parts);
    expect(attachments.length).toBe(4);
    const mimeTypes = attachments.map((entry) => entry.mimeType);
    expect(mimeTypes).toEqual(expect.arrayContaining(["image/jpeg", "image/png"]));
    expect(attachments.some((entry) => entry.base64 === "aGVsbG8=")).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  test("ignores non-image parts", async () => {
    const attachments = await extractVisionAttachments([{ type: "text", text: "hello" }]);
    expect(attachments.length).toBe(0);
  });

  test("uses a provided clipboard reader", async () => {
    const attachments = await extractVisionAttachments(
      [{ type: "image", url: "clipboard" }],
      {
        readClipboardImage: async () => ({ mimeType: "image/png", base64: "aGVsbG8=" }),
      },
    );
    expect(attachments[0]?.base64).toBe("aGVsbG8=");
  });

  test("returns empty attachments when parts are not an array", async () => {
    const attachments = await extractVisionAttachments("nope" as never);
    expect(attachments).toEqual([]);
  });

  test("reads clipboard images with injected platform deps", async () => {
    const darwin = await __test__.readClipboardImage({
      platform: "darwin",
      tmpdir: () => tmpdir(),
      execFileAsync: async () => ({ stdout: "", stderr: "" } as { stdout: string; stderr: string }),
      readFile: async () => Buffer.from("clip"),
      unlink: async () => {},
    });
    expect(darwin?.base64).toBe(Buffer.from("clip").toString("base64"));

    const darwinCleanup = await __test__.readClipboardImage({
      platform: "darwin",
      tmpdir: () => tmpdir(),
      execFileAsync: async () => ({ stdout: "", stderr: "" } as { stdout: string; stderr: string }),
      readFile: async () => Buffer.from("clip2"),
      unlink: async () => {
        throw new Error("unlink failed");
      },
    });
    expect(darwinCleanup?.base64).toBe(Buffer.from("clip2").toString("base64"));

    const linux = await __test__.readClipboardImage({
      platform: "linux",
      execFileAsync: async () => ({ stdout: Buffer.from("clip") } as { stdout: Buffer }),
    });
    expect(linux?.base64).toBe(Buffer.from("clip").toString("base64"));

    const linuxFallback = await __test__.readClipboardImage({
      platform: "linux",
      execFileAsync: async (command: string) => {
        if (command === "wl-paste") throw new Error("fail");
        return { stdout: Buffer.from("clip2") } as { stdout: Buffer };
      },
    });
    expect(linuxFallback?.base64).toBe(Buffer.from("clip2").toString("base64"));

    const linuxEmpty = await __test__.readClipboardImage({
      platform: "linux",
      execFileAsync: async () => {
        throw new Error("fail");
      },
    });
    expect(linuxEmpty).toBeUndefined();
  });
});
