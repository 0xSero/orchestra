import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import type { WorkerProfile } from "../../src/types";
import { createVisionRoutingState, routeVisionMessage, type VisionChatOutput } from "../../src/ux/vision-routing";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";

const VISION_MODEL = "opencode/gpt-5-nano";

function createSolidPng(width: number, height: number, rgba: [number, number, number, number]) {
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const TEST_PNG_BUFFER = createSolidPng(64, 64, [255, 0, 0, 255]);
const TEST_PNG_BASE64 = TEST_PNG_BUFFER.toString("base64");

describe("vision routing", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>>;

  beforeAll(async () => {
    const profile: WorkerProfile = {
      id: "vision",
      name: "Vision Worker",
      model: VISION_MODEL,
      purpose: "Image analysis",
      whenToUse: "Analyze screenshots and images",
      supportsVision: true,
    };

    runtime = await createTestWorkerRuntime({
      profiles: { vision: profile },
      directory: process.cwd(),
      timeoutMs: 120_000,
    });
  });

  afterAll(async () => {
    await runtime.stop();
  });

  test("replaces image parts with inline vision analysis", async () => {
    const output: VisionChatOutput = {
      message: { role: "user" },
      parts: [
        { type: "text", text: "What color is this image?" },
        { type: "file", mime: "image/png", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
      ],
    };

    const state = createVisionRoutingState();
    const jobId = await routeVisionMessage(
      {
        sessionID: "session-vision",
        agent: "orchestrator",
        messageID: "msg-vision",
      },
      output,
      {
        workers: runtime.workers,
        profiles: {
          vision: {
            id: "vision",
            name: "Vision Worker",
            model: VISION_MODEL,
            supportsVision: true,
          },
        },
        timeoutMs: 120_000,
      },
      state,
    );

    expect(jobId).toBeTruthy();
    const analysisPart = output.parts.find(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.includes("<pasted_image") &&
        part.text.includes("[VISION ANALYSIS IN PROGRESS]"),
    );
    expect(analysisPart).toBeTruthy();
    const hasImageParts = output.parts.some((part) => part.type === "file" || part.type === "image");
    expect(hasImageParts).toBe(false);
  }, 180_000);
});
