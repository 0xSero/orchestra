import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import type { WorkerProfile } from "../src/types";
import { setupE2eEnv } from "./helpers/e2e-env";
import { createTestWorkerRuntime } from "./helpers/worker-runtime";

const VISION_MODEL = "opencode/gpt-5-nano";

function createSolidPng(width: number, height: number, rgba: [number, number, number, number]) {
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // no filter
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = rgba[0];
      raw[offset + 1] = rgba[1];
      raw[offset + 2] = rgba[2];
      raw[offset + 3] = rgba[3];
    }
  }

  const crcTable = new Uint32Array(256).map((_, i) => {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let crc = 0xffffffff;
    for (const b of buf) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const TEST_PNG_BUFFER = createSolidPng(64, 64, [255, 0, 0, 255]);
const TEST_PNG_BASE64 = TEST_PNG_BUFFER.toString("base64");

describe("vision worker integration", () => {
  let restoreEnv: (() => void) | undefined;
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>> | undefined;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
    runtime = await createTestWorkerRuntime({
      profiles: {},
      directory: process.cwd(),
      timeoutMs: 60_000,
    });
  });

  afterAll(async () => {
    await runtime?.stop();
    restoreEnv?.();
  });

  afterEach(async () => {
    const workers = runtime?.workers.listWorkers() ?? [];
    await Promise.allSettled(workers.map((w) => runtime!.workers.stopWorker(w.profile.id)));
  });

  test("spawns a vision worker and handles a base64 image", async () => {
    const profile: WorkerProfile = {
      id: "vision-b64",
      name: "Vision Base64",
      model: VISION_MODEL,
      purpose: "Image analysis (base64)",
      whenToUse: "Testing vision base64 flow",
      supportsVision: true,
    };

    const worker = await runtime!.workers.spawn(profile);

    const result = await runtime!.workers.send(worker.profile.id, "What color is this image?", {
      attachments: [{ type: "image", base64: TEST_PNG_BASE64, mimeType: "image/png" }],
      timeout: 60_000,
    });

    if (!result.success) {
      throw new Error(result.error ?? "vision worker returned error");
    }
    expect(result.response && result.response.length > 0).toBe(true);
  }, 120_000);
});
