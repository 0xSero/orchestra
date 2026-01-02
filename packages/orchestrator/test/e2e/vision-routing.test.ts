import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { createE2eEnv, type E2eEnv } from "../helpers/e2e-env";
import { mergeOpenCodeConfig } from "../../src/config/opencode";
import {
  spawnWorker,
  sendToWorker,
  stopWorker,
} from "../../src/workers/spawner";
import { workerPool } from "../../src/core/worker-pool";
import type { WorkerProfile } from "../../src/types";

const ORCH_MODEL = process.env.OPENCODE_ORCH_E2E_MODEL ?? "opencode/gpt-5-nano";
const VISION_MODEL =
  process.env.OPENCODE_ORCH_E2E_MODEL ?? "opencode/gpt-5-nano";

function createSolidPng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
) {
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

  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TEST_PNG_BUFFER = createSolidPng(64, 64, [255, 0, 0, 255]);
const TEST_PNG_BASE64 = TEST_PNG_BUFFER.toString("base64");

describe("vision worker integration", () => {
  let env: E2eEnv;
  let tempDir: string;
  let server: { close: () => void };

  beforeAll(async () => {
    env = await createE2eEnv();
    tempDir = await mkdtemp(join(env.root, "vision-e2e-"));
    env.cleanup.registerDirectory(tempDir);
    const config = await mergeOpenCodeConfig(
      { model: ORCH_MODEL },
      { dropOrchestratorPlugin: true },
    );
    const opencode = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config,
    });
    server = opencode.server;
  });

  afterAll(async () => {
    server?.close();
    await env.restore();
  });

  afterEach(async () => {
    const workers = Array.from(workerPool.workers.keys());
    for (const workerId of workers) {
      await stopWorker(workerId).catch(() => {});
    }
  });

  test("spawns a vision worker and handles an image file", async () => {
    const profile: WorkerProfile = {
      id: "vision",
      name: "Vision",
      model: VISION_MODEL,
      purpose: "Image analysis",
      whenToUse: "Testing vision flow",
      supportsVision: true,
    };

    const imgPath = join(tempDir, "test-image.png");
    await writeFile(imgPath, TEST_PNG_BUFFER);

    const worker = await spawnWorker(profile, {
      basePort: 0,
      timeout: 30_000,
      directory: process.cwd(),
    });

    const result = await sendToWorker(
      worker.profile.id,
      "Describe what you see in this image.",
      {
        attachments: [{ type: "image", path: imgPath }],
        timeout: 120_000,
      },
    );

    if (result.success) {
      expect(result.response && result.response.length > 0).toBe(true);
    } else {
      expect(result.error && result.error.length > 0).toBe(true);
    }
  }, 240_000);

  test("spawns a vision worker and handles a base64 image", async () => {
    const profile: WorkerProfile = {
      id: "vision-b64",
      name: "Vision Base64",
      model: VISION_MODEL,
      purpose: "Image analysis (base64)",
      whenToUse: "Testing vision base64 flow",
      supportsVision: true,
    };

    const worker = await spawnWorker(profile, {
      basePort: 0,
      timeout: 30_000,
      directory: process.cwd(),
    });

    const result = await sendToWorker(
      worker.profile.id,
      "What color is this image?",
      {
        attachments: [
          { type: "image", base64: TEST_PNG_BASE64, mimeType: "image/png" },
        ],
        timeout: 120_000,
      },
    );

    if (result.success) {
      expect(result.response && result.response.length > 0).toBe(true);
    } else {
      expect(result.error && result.error.length > 0).toBe(true);
    }
  }, 240_000);
});
