import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
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
    expect(prepared?.path && existsSync(prepared.path)).toBe(true);

    await result.cleanup();
    expect(prepared?.path && existsSync(prepared.path)).toBe(false);
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
});
