import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareWorkerAttachments } from "../../src/workers/attachments";

describe("worker attachments", () => {
  test("materializes base64 attachments and cleans up", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "orch-attachments-"));
    const base64 = Buffer.from("hello", "utf8").toString("base64");

    const result = await prepareWorkerAttachments({
      baseDir,
      workerId: "tester",
      attachments: [{ type: "image", base64, mimeType: "image/png" }],
    });

    const prepared = result.attachments?.[0];
    expect(prepared?.path).toBeTruthy();
    if (prepared?.path) {
      expect(await Bun.file(prepared.path).exists()).toBe(true);
    }

    await result.cleanup();
    if (prepared?.path) {
      expect(await Bun.file(prepared.path).exists()).toBe(false);
    }
  });

  test("copies external paths into sandbox", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "orch-attachments-base-"));
    const externalDir = await mkdtemp(join(tmpdir(), "orch-attachments-ext-"));
    const externalPath = join(externalDir, "image.png");
    await writeFile(externalPath, "data", "utf8");

    const result = await prepareWorkerAttachments({
      baseDir,
      workerId: "tester",
      attachments: [{ type: "image", path: externalPath, mimeType: "image/png" }],
    });

    const prepared = result.attachments?.[0];
    expect(prepared?.path).toBeTruthy();
    expect(prepared?.path?.startsWith(join(baseDir, ".opencode", "attachments"))).toBe(true);

    await result.cleanup();
  });

  test("keeps attachments already inside base dir and respects mime extensions", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "orch-attachments-inner-"));
    const innerPath = join(baseDir, "image.gif");
    await writeFile(innerPath, "data", "utf8");

    const inside = await prepareWorkerAttachments({
      baseDir,
      workerId: "tester",
      attachments: [{ type: "image", path: innerPath, mimeType: "image/gif" }],
    });
    expect(inside.attachments?.[0]?.path).toBe(innerPath);

    const base64 = Buffer.from("hello", "utf8").toString("base64");
    const webp = await prepareWorkerAttachments({
      baseDir,
      workerId: "tester",
      attachments: [{ type: "image", base64, mimeType: "image/webp" }],
    });
    expect(webp.attachments?.[0]?.path?.endsWith(".webp")).toBe(true);
    await webp.cleanup();

    const gif = await prepareWorkerAttachments({
      baseDir,
      workerId: "tester",
      attachments: [{ type: "image", base64, mimeType: "image/gif" }],
    });
    expect(gif.attachments?.[0]?.path?.endsWith(".gif")).toBe(true);
    await gif.cleanup();
  });

  test("preserves non-image attachments as-is", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "orch-attachments-text-"));
    const attachments = [{ type: "text", text: "note" }] as never;

    const result = await prepareWorkerAttachments({
      baseDir,
      workerId: "tester",
      attachments,
    });

    expect(result.attachments).toEqual(attachments);
    await result.cleanup();
  });

  test("keeps image attachments without file content", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "orch-attachments-empty-"));
    const attachments = [{ type: "image" }] as never;

    const result = await prepareWorkerAttachments({
      baseDir,
      workerId: "tester",
      attachments,
    });

    expect(result.attachments).toEqual(attachments);
    await result.cleanup();
  });

  test("returns early when no attachments are provided", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "orch-attachments-none-"));
    const result = await prepareWorkerAttachments({ baseDir, workerId: "tester" });
    expect(result.attachments).toBeUndefined();
    await result.cleanup();
  });
});
