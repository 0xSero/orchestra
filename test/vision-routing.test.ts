/**
 * Vision Routing Tests
 * 
 * Tests the complete vision auto-routing pipeline:
 * 1. Image detection in message parts
 * 2. Vision worker spawning with correct model from config
 * 3. Image extraction and attachment building
 * 4. Communication with vision worker
 * 5. Analysis injection back to conversation
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createOpencode } from "@opencode-ai/sdk";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasImages, analyzeImages, formatVisionAnalysis, replaceImagesWithAnalysis } from "../src/ux/vision-router";
import { spawnWorker, sendToWorker, stopWorker } from "../src/workers/spawner";
import { registry } from "../src/core/registry";
import { buildPromptParts } from "../src/workers/prompt";
import { hydrateProfileModelsFromOpencode } from "../src/models/hydrate";
import { setupE2eEnv } from "./helpers/e2e-env";
import type { WorkerProfile } from "../src/types";

// Test image - 1x1 red PNG
const TEST_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const TEST_PNG_BUFFER = Buffer.from(TEST_PNG_BASE64, "base64");

describe("Vision Routing", () => {
  describe("formatVisionAnalysis", () => {
    test("formats successful analysis with header", () => {
      const out = formatVisionAnalysis({ success: true, analysis: "Detected text here." });
      expect(out).toBe("[VISION ANALYSIS]\nDetected text here.");
    });

    test("trims empty analysis", () => {
      const out = formatVisionAnalysis({ success: true, analysis: "   " });
      expect(out).toBeUndefined();
    });

    test("formats error output", () => {
      const out = formatVisionAnalysis({ success: false, error: "Vision worker unavailable" });
      expect(out).toBe("[VISION ANALYSIS FAILED]\nVision worker unavailable");
    });
  });

  describe("replaceImagesWithAnalysis", () => {
    test("removes image parts and appends analysis to text", () => {
      const parts = [
        { type: "text", text: "Please read this image." },
        { type: "file", mime: "image/png", url: "clipboard" },
      ];
      const out = replaceImagesWithAnalysis(parts, "[VISION ANALYSIS]\nFound text");
      expect(out.length).toBe(1);
      expect(out[0].type).toBe("text");
      expect(out[0].text).toContain("Please read this image.");
      expect(out[0].text).toContain("[VISION ANALYSIS]");
    });

    test("creates a new text part when no text exists", () => {
      const parts = [
        { type: "file", mime: "image/png", url: "clipboard" },
      ];
      const out = replaceImagesWithAnalysis(parts, "[VISION ANALYSIS]\nFound text", { sessionID: "s", messageID: "m" });
      expect(out.length).toBe(1);
      expect(out[0].type).toBe("text");
      expect(out[0].text).toBe("[VISION ANALYSIS]\nFound text");
    });

    test("returns original parts when no images exist", () => {
      const parts = [{ type: "text", text: "No images here." }];
      const out = replaceImagesWithAnalysis(parts, "[VISION ANALYSIS]\nIgnored");
      expect(out).toBe(parts);
    });
  });

  describe("hasImages - Image Detection", () => {
    test("detects type='image' parts", () => {
      const parts = [
        { type: "text", text: "hello" },
        { type: "image", url: "data:image/png;base64,..." },
      ];
      expect(hasImages(parts)).toBe(true);
    });

    test("detects type='file' with image mime type", () => {
      const parts = [
        { type: "text", text: "analyze this" },
        { type: "file", mime: "image/png", url: "file:///path/to/image.png" },
      ];
      expect(hasImages(parts)).toBe(true);
    });

    test("detects type='file' with image/jpeg mime", () => {
      const parts = [
        { type: "file", mime: "image/jpeg", url: "file:///photo.jpg" },
      ];
      expect(hasImages(parts)).toBe(true);
    });

    test("detects type='file' with image/webp mime", () => {
      const parts = [
        { type: "file", mime: "image/webp", url: "file:///photo.webp" },
      ];
      expect(hasImages(parts)).toBe(true);
    });

    test("detects data URL starting with data:image/", () => {
      const parts = [
        { type: "file", url: "data:image/png;base64,iVBORw0KGgo..." },
      ];
      expect(hasImages(parts)).toBe(true);
    });

    test("detects clipboard URL", () => {
      const parts = [
        { type: "file", url: "clipboard" },
      ];
      expect(hasImages(parts)).toBe(true);
    });

    test("detects clipboard: prefixed URL", () => {
      const parts = [
        { type: "file", url: "clipboard:12345" },
      ];
      expect(hasImages(parts)).toBe(true);
    });

    test("returns false for text-only parts", () => {
      const parts = [
        { type: "text", text: "just text" },
        { type: "text", text: "more text" },
      ];
      expect(hasImages(parts)).toBe(false);
    });

    test("returns false for non-image file parts", () => {
      const parts = [
        { type: "file", mime: "application/pdf", url: "file:///doc.pdf" },
        { type: "file", mime: "text/plain", url: "file:///readme.txt" },
      ];
      expect(hasImages(parts)).toBe(false);
    });

    test("returns false for empty array", () => {
      expect(hasImages([])).toBe(false);
    });

    test("returns false for non-array input", () => {
      expect(hasImages(null as any)).toBe(false);
      expect(hasImages(undefined as any)).toBe(false);
      expect(hasImages("string" as any)).toBe(false);
    });

    test("handles malformed parts gracefully", () => {
      const parts = [
        null,
        undefined,
        "string",
        123,
        { type: "text" }, // missing text
        { type: "file" }, // missing mime and url
      ];
      expect(hasImages(parts as any)).toBe(false);
    });

    test("detects images in mixed parts", () => {
      const parts = [
        { type: "text", text: "Check this screenshot" },
        { type: "file", mime: "application/json", url: "file:///data.json" },
        { type: "file", mime: "image/png", url: "file:///screenshot.png" },
        { type: "text", text: "What do you see?" },
      ];
      expect(hasImages(parts)).toBe(true);
    });
  });

  describe("buildPromptParts - Attachment Building", () => {
    let tempDir: string;

    beforeAll(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "vision-test-"));
    });

    test("builds text-only parts when no attachments", async () => {
      const parts = await buildPromptParts({ message: "hello world" });
      expect(parts).toEqual([{ type: "text", text: "hello world" }]);
    });

    test("builds parts with image from file path", async () => {
      const imgPath = join(tempDir, "test.png");
      await writeFile(imgPath, TEST_PNG_BUFFER);

      const parts = await buildPromptParts({
        message: "analyze this",
        attachments: [{ type: "image", path: imgPath }],
      });

      expect(parts.length).toBe(2);
      expect(parts[0]).toEqual({ type: "text", text: "analyze this" });
      expect(parts[1].type).toBe("file");
      expect(parts[1].mime).toBe("image/png");
      expect((parts[1].url as string).startsWith("file://")).toBe(true);
    });

    test("builds parts with image from base64", async () => {
      const parts = await buildPromptParts({
        message: "what is this",
        attachments: [{ type: "image", base64: TEST_PNG_BASE64, mimeType: "image/png" }],
      });

      expect(parts.length).toBe(2);
      expect(parts[0]).toEqual({ type: "text", text: "what is this" });
      expect(parts[1].type).toBe("file");
      expect(parts[1].mime).toBe("image/png");
      expect((parts[1].url as string).startsWith("data:image/png;base64,")).toBe(true);
    });

    test("handles data URL in base64 field", async () => {
      const dataUrl = `data:image/png;base64,${TEST_PNG_BASE64}`;
      const parts = await buildPromptParts({
        message: "check this",
        attachments: [{ type: "image", base64: dataUrl, mimeType: "image/png" }],
      });

      expect(parts.length).toBe(2);
      expect(parts[1].type).toBe("file");
      // Should extract base64 from data URL and rebuild it
      expect((parts[1].url as string).includes(TEST_PNG_BASE64)).toBe(true);
    });

    test("infers JPEG mime type from file extension", async () => {
      const imgPath = join(tempDir, "photo.jpg");
      await writeFile(imgPath, TEST_PNG_BUFFER); // content doesn't matter for this test

      const parts = await buildPromptParts({
        message: "describe",
        attachments: [{ type: "image", path: imgPath }],
      });

      expect(parts[1].mime).toBe("image/jpeg");
    });

    test("infers WebP mime type from file extension", async () => {
      const imgPath = join(tempDir, "image.webp");
      await writeFile(imgPath, TEST_PNG_BUFFER);

      const parts = await buildPromptParts({
        message: "describe",
        attachments: [{ type: "image", path: imgPath }],
      });

      expect(parts[1].mime).toBe("image/webp");
    });

    test("skips non-image attachments", async () => {
      const parts = await buildPromptParts({
        message: "hello",
        attachments: [{ type: "file", path: "/some/file.txt" }],
      });

      expect(parts.length).toBe(1);
      expect(parts[0]).toEqual({ type: "text", text: "hello" });
    });

    test("handles multiple image attachments", async () => {
      const img1 = join(tempDir, "img1.png");
      const img2 = join(tempDir, "img2.png");
      await writeFile(img1, TEST_PNG_BUFFER);
      await writeFile(img2, TEST_PNG_BUFFER);

      const parts = await buildPromptParts({
        message: "compare these",
        attachments: [
          { type: "image", path: img1 },
          { type: "image", path: img2 },
        ],
      });

      expect(parts.length).toBe(3);
      expect(parts[0].type).toBe("text");
      expect(parts[1].type).toBe("file");
      expect(parts[2].type).toBe("file");
    });
  });

  describe("Model Resolution for Vision Workers", () => {
    test("explicit vision model is resolved even from api-source providers", async () => {
      const providers: any[] = [
        {
          id: "zhipuai-coding-plan",
          source: "api", // This is the key - api providers should work when explicitly referenced
          models: {
            "glm-4.6v": {
              name: "GLM-4.6V",
              capabilities: {
                attachment: true,
                input: { image: true, video: true, text: true },
              },
            },
          },
        },
        {
          id: "local-proxy",
          source: "config",
          models: {
            "text-only": {
              capabilities: { attachment: false, input: { image: false } },
            },
          },
        },
      ];

      const client: any = {
        config: {
          get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
          providers: async () => ({ data: { providers, default: {} } }),
        },
      };

      // This should NOT throw - explicit model references should work
      const out = await hydrateProfileModelsFromOpencode({
        client,
        directory: process.cwd(),
        profiles: {
          vision: {
            id: "vision",
            name: "Vision Analyst",
            model: "zhipuai-coding-plan/glm-4.6v", // Explicit model from api provider
            purpose: "Analyze images",
            whenToUse: "When you need to analyze images",
            supportsVision: true,
          },
        },
      });

      expect(out.profiles.vision.model).toBe("zhipuai-coding-plan/glm-4.6v");
    });

    test("rejects vision profile with non-vision model", async () => {
      const providers: any[] = [
        {
          id: "anthropic",
          source: "config",
          models: {
            "claude-3-sonnet": {
              name: "Claude 3 Sonnet",
              capabilities: { attachment: false, input: { image: false } },
            },
          },
        },
      ];

      const client: any = {
        config: {
          get: async () => ({ data: { model: "anthropic/claude-3-sonnet" } }),
          providers: async () => ({ data: { providers, default: {} } }),
        },
      };

      await expect(
        hydrateProfileModelsFromOpencode({
          client,
          directory: process.cwd(),
          profiles: {
            vision: {
              id: "vision",
              name: "Vision",
              model: "anthropic/claude-3-sonnet",
              purpose: "p",
              whenToUse: "w",
              supportsVision: true,
            },
          },
        })
      ).rejects.toThrow(/requires vision/i);
    });

    test("node:vision auto-selects from usable providers only", async () => {
      const providers: any[] = [
        {
          id: "configured-provider",
          source: "config",
          models: {
            "vision-model": {
              name: "Vision Model",
              capabilities: { attachment: true, input: { image: true } },
            },
          },
        },
        {
          id: "api-only-provider",
          source: "api",
          models: {
            "better-vision": {
              name: "Better Vision",
              capabilities: { attachment: true, input: { image: true } },
            },
          },
        },
      ];

      const client: any = {
        config: {
          get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
          providers: async () => ({ data: { providers, default: {} } }),
        },
      };

      const out = await hydrateProfileModelsFromOpencode({
        client,
        directory: process.cwd(),
        profiles: {
          vision: {
            id: "vision",
            name: "Vision",
            model: "node:vision", // Auto-select
            purpose: "p",
            whenToUse: "w",
            supportsVision: true,
          },
        },
      });

      // Should pick from configured provider, not api-only
      expect(out.profiles.vision.model).toBe("configured-provider/vision-model");
    });
  });

  describe("analyzeImages - Integration", () => {
    // These tests require a running OpenCode server with vision capability
    // Skip if no vision model is available
    const SKIP_E2E = !process.env.OPENCODE_ORCH_E2E_MODEL;

    test.skipIf(SKIP_E2E)("returns error when no vision worker and spawnIfNeeded=false", async () => {
      const parts = [
        { type: "text", text: "analyze" },
        { type: "file", mime: "image/png", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
      ];

      const result = await analyzeImages(parts, {
        spawnIfNeeded: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No vision worker available");
    });

    test("returns error when no valid image attachments found", async () => {
      const parts = [
        { type: "text", text: "no images here" },
      ];

      const result = await analyzeImages(parts, {
        spawnIfNeeded: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No valid image attachments");
    });

    test("serializes concurrent calls instead of failing fast", async () => {
      // Start two analyze calls simultaneously
      const parts = [
        { type: "file", mime: "image/png", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
      ];

      const [result1, result2] = await Promise.all([
        analyzeImages(parts, { spawnIfNeeded: false }),
        analyzeImages(parts, { spawnIfNeeded: false }),
      ]);

      // With no vision worker available, both should fail normally (not with a transient busy error).
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
      expect(result1.error).toContain("No vision worker");
      expect(result2.error).toContain("No vision worker");
      expect(result1.error?.toLowerCase().includes("already processing")).toBe(false);
      expect(result2.error?.toLowerCase().includes("already processing")).toBe(false);
    });

    test("handles concurrent calls gracefully", async () => {
      // Note: Deduplication now happens at the plugin level via message ID tracking.
      // The analyzeImages function no longer deduplicates at the API level.
      const parts = [
        { type: "file", mime: "image/png", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
      ];

      const [result1, result2] = await Promise.all([
        analyzeImages(parts, { spawnIfNeeded: false, requestKey: "session:message" }),
        analyzeImages(parts, { spawnIfNeeded: false, requestKey: "session:message" }),
      ]);

      // Both calls complete with equivalent results
      expect(result1).toEqual(result2);
      expect(result1.success).toBe(false);
      expect(result1.error).toContain("No vision worker");
    });
  });
});

describe("Vision Worker Communication", () => {
  // These are E2E tests that require actual worker spawning
  let restoreEnv: (() => void) | undefined;
  let tempDir: string;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
    tempDir = await mkdtemp(join(tmpdir(), "vision-e2e-"));
  });

  afterAll(() => {
    restoreEnv?.();
  });

  afterEach(async () => {
    // Clean up any spawned workers
    const workers = Array.from(registry.workers.keys());
    for (const workerId of workers) {
      try {
        await stopWorker(workerId);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // Only run if a vision model is configured
  const visionModel = process.env.OPENCODE_ORCH_E2E_VISION_MODEL;
  const SKIP_E2E = !visionModel;

  test.skipIf(SKIP_E2E)("spawns vision worker with correct model and sends image", async () => {
    const profile: WorkerProfile = {
      id: "test-vision",
      name: "Test Vision Worker",
      model: visionModel!,
      purpose: "Test vision analysis",
      whenToUse: "Testing",
      supportsVision: true,
    };

    // Create a test image file
    const imgPath = join(tempDir, "test-image.png");
    await writeFile(imgPath, TEST_PNG_BUFFER);

    const { client, server } = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config: { model: visionModel },
    });

    try {
      // Spawn the worker
      const worker = await spawnWorker(profile, {
        basePort: 0,
        timeout: 30000,
        directory: process.cwd(),
        client,
      });

      expect(worker.status).toBe("ready");
      expect(worker.profile.model).toBe(visionModel!);
      expect(worker.profile.supportsVision).toBe(true);

      // Send an image to the worker
      const result = await sendToWorker(worker.profile.id, "Describe what you see in this image.", {
        attachments: [{ type: "image", path: imgPath }],
        timeout: 60000,
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeTruthy();
      expect(typeof result.response).toBe("string");
      expect(result.response!.length).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  }, 120_000);

  test.skipIf(SKIP_E2E)("sends base64 image to vision worker", async () => {
    const profile: WorkerProfile = {
      id: "test-vision-b64",
      name: "Test Vision Base64",
      model: visionModel!,
      purpose: "Test base64 image",
      whenToUse: "Testing",
      supportsVision: true,
    };

    const { client, server } = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config: { model: visionModel },
    });

    try {
      const worker = await spawnWorker(profile, {
        basePort: 0,
        timeout: 30000,
        directory: process.cwd(),
        client,
      });

      expect(worker.status).toBe("ready");

      // Send base64 image
      const result = await sendToWorker(worker.profile.id, "What color is this image?", {
        attachments: [{ type: "image", base64: TEST_PNG_BASE64, mimeType: "image/png" }],
        timeout: 60000,
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeTruthy();
    } finally {
      server.close();
    }
  }, 120_000);
});

describe("Vision Router Config Integration", () => {
  test("analyzeImages uses profiles from options", async () => {
    // This tests that the profiles option is correctly passed through
    const customProfiles = {
      vision: {
        id: "vision",
        name: "Custom Vision",
        model: "custom-provider/custom-vision-model",
        purpose: "Custom vision",
        whenToUse: "Testing custom config",
        supportsVision: true,
      },
    };

    const parts = [
      { type: "file", mime: "image/png", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
    ];

    // This will fail to spawn (no such provider), but we're testing that
    // the profiles option is used
    const result = await analyzeImages(parts, {
      spawnIfNeeded: true,
      profiles: customProfiles,
      // No client provided, so spawn will fail gracefully
    });

    // Should fail because no client, not because it used wrong profile
    expect(result.success).toBe(false);
    // The error should be about no vision worker, not about built-in profile
    expect(result.error).toContain("No vision worker available");
  });

  test("falls back to builtInProfiles when profiles option not provided", async () => {
    const parts = [
      { type: "file", mime: "image/png", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
    ];

    const result = await analyzeImages(parts, {
      spawnIfNeeded: true,
      // No profiles option - should use builtInProfiles
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No vision worker available");
  });
});
