/**
 * Vision Analyzer - Unit Tests
 *
 * Tests the simplified vision/analyzer.ts module
 */

import { describe, test, expect } from "bun:test";
import {
  hasImages,
  extractImages,
  analyzeImages,
  formatVisionAnalysis,
  replaceImagesWithAnalysis,
} from "../../../src/vision/analyzer";

// Test fixtures
const TEST_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Vision Analyzer - hasImages", () => {
  test("returns false for empty array", () => {
    expect(hasImages([])).toBe(false);
  });

  test("returns false for non-array", () => {
    expect(hasImages(null as any)).toBe(false);
    expect(hasImages(undefined as any)).toBe(false);
  });

  test("returns false for text-only parts", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ];
    expect(hasImages(parts)).toBe(false);
  });

  test("detects type=image parts", () => {
    const parts = [
      { type: "text", text: "check this" },
      { type: "image", base64: TEST_PNG_BASE64 },
    ];
    expect(hasImages(parts)).toBe(true);
  });

  test("detects type=file with image mime", () => {
    const parts = [
      { type: "file", mime: "image/png", url: "file://test.png" },
    ];
    expect(hasImages(parts)).toBe(true);
  });

  test("detects type=file with data URL", () => {
    const parts = [
      { type: "file", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
    ];
    expect(hasImages(parts)).toBe(true);
  });

  test("detects clipboard placeholder", () => {
    expect(hasImages([{ url: "clipboard" }])).toBe(true);
    expect(hasImages([{ url: "clipboard:timestamp" }])).toBe(true);
  });
});

describe("Vision Analyzer - extractImages", () => {
  test("returns empty array for no images", async () => {
    const parts = [{ type: "text", text: "no images" }];
    const result = await extractImages(parts);
    expect(result).toEqual([]);
  });

  test("extracts from data URL", async () => {
    const parts = [
      { type: "file", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
    ];
    const result = await extractImages(parts);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("image");
    expect(result[0].mimeType).toBe("image/png");
    expect(result[0].base64).toBe(TEST_PNG_BASE64);
  });

  test("extracts from direct base64", async () => {
    const parts = [
      { type: "image", base64: TEST_PNG_BASE64, mime: "image/jpeg" },
    ];
    const result = await extractImages(parts);
    expect(result.length).toBe(1);
    expect(result[0].mimeType).toBe("image/jpeg");
    expect(result[0].base64).toBe(TEST_PNG_BASE64);
  });

  test("extracts multiple images in parallel", async () => {
    const parts = [
      { type: "file", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
      { type: "image", base64: TEST_PNG_BASE64, mime: "image/png" },
    ];
    const result = await extractImages(parts);
    expect(result.length).toBe(2);
  });

  test("ignores invalid parts gracefully", async () => {
    const parts = [
      { type: "file", url: "file:///nonexistent/path.png" },
      { type: "file", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
    ];
    // Should still extract the valid one, ignore the invalid
    const result = await extractImages(parts);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Vision Analyzer - analyzeImages", () => {
  test("returns error when no images", async () => {
    const parts = [{ type: "text", text: "no images" }];
    const result = await analyzeImages(parts, {
      sendToVisionWorker: async () => ({ success: true, response: "test" }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No valid images");
  });

  test("calls sendToVisionWorker with extracted images", async () => {
    const parts = [
      { type: "file", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
    ];

    let capturedAttachments: any[] = [];
    let capturedPrompt = "";

    const result = await analyzeImages(parts, {
      sendToVisionWorker: async (message, attachments) => {
        capturedPrompt = message;
        capturedAttachments = attachments;
        return { success: true, response: "I see a 1x1 pixel image" };
      },
      prompt: "Describe this image",
    });

    expect(result.success).toBe(true);
    expect(result.analysis).toBe("I see a 1x1 pixel image");
    expect(capturedPrompt).toBe("Describe this image");
    expect(capturedAttachments.length).toBe(1);
    expect(capturedAttachments[0].type).toBe("image");
  });

  test("handles worker errors gracefully", async () => {
    const parts = [
      { type: "image", base64: TEST_PNG_BASE64 },
    ];

    const result = await analyzeImages(parts, {
      sendToVisionWorker: async () => ({
        success: false,
        error: "Worker unavailable",
      }),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Worker unavailable");
  });

  test("includes duration in result", async () => {
    const parts = [
      { type: "image", base64: TEST_PNG_BASE64 },
    ];

    const result = await analyzeImages(parts, {
      sendToVisionWorker: async () => {
        await new Promise(r => setTimeout(r, 10));
        return { success: true, response: "test" };
      },
    });

    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(10);
  });

  test("uses default prompt if none provided", async () => {
    const parts = [
      { type: "image", base64: TEST_PNG_BASE64 },
    ];

    let capturedPrompt = "";

    await analyzeImages(parts, {
      sendToVisionWorker: async (message) => {
        capturedPrompt = message;
        return { success: true, response: "test" };
      },
    });

    expect(capturedPrompt).toContain("Analyze this image");
  });
});

describe("Vision Analyzer - formatVisionAnalysis", () => {
  test("formats successful analysis", () => {
    const result = formatVisionAnalysis({
      success: true,
      analysis: "This is a screenshot of code",
    });
    expect(result).toBe("[VISION ANALYSIS]\nThis is a screenshot of code");
  });

  test("formats failed analysis", () => {
    const result = formatVisionAnalysis({
      success: false,
      error: "Worker timeout",
    });
    expect(result).toBe("[VISION ANALYSIS FAILED]\nWorker timeout");
  });

  test("returns undefined for empty analysis", () => {
    const result = formatVisionAnalysis({
      success: true,
      analysis: "   ",
    });
    expect(result).toBeUndefined();
  });

  test("trims whitespace", () => {
    const result = formatVisionAnalysis({
      success: true,
      analysis: "  content with whitespace  \n",
    });
    expect(result).toBe("[VISION ANALYSIS]\ncontent with whitespace");
  });
});

describe("Vision Analyzer - replaceImagesWithAnalysis", () => {
  test("removes image parts and appends analysis", () => {
    const parts = [
      { type: "text", text: "Check this image:" },
      { type: "image", base64: TEST_PNG_BASE64 },
    ];

    const result = replaceImagesWithAnalysis(parts, "[VISION ANALYSIS]\nTest");

    expect(result.length).toBe(1);
    expect(result[0].type).toBe("text");
    expect(result[0].text).toContain("Check this image:");
    expect(result[0].text).toContain("[VISION ANALYSIS]");
  });

  test("creates new text part if no text parts exist", () => {
    const parts = [
      { type: "image", base64: TEST_PNG_BASE64 },
    ];

    const result = replaceImagesWithAnalysis(parts, "[VISION ANALYSIS]\nTest", {
      messageID: "msg-123",
    });

    expect(result.length).toBe(1);
    expect(result[0].type).toBe("text");
    expect(result[0].text).toContain("[VISION ANALYSIS]");
    expect(result[0].id).toContain("msg-123");
    expect(result[0].synthetic).toBe(true);
  });

  test("handles non-array input gracefully", () => {
    const result = replaceImagesWithAnalysis(null as any, "test");
    expect(result as any).toBe(null);
  });

  test("returns original parts if no images", () => {
    const parts = [{ type: "text", text: "no images" }];
    const result = replaceImagesWithAnalysis(parts, "analysis");
    expect(result).toEqual(parts);
  });
});

describe("Vision Analyzer - Integration", () => {
  test("full workflow: extract -> analyze -> format -> replace", async () => {
    // Simulate a complete vision analysis workflow
    const originalParts = [
      { type: "text", text: "What is this?" },
      { type: "file", url: `data:image/png;base64,${TEST_PNG_BASE64}` },
    ];

    // Step 1: Check for images
    expect(hasImages(originalParts)).toBe(true);

    // Step 2: Analyze images
    const result = await analyzeImages(originalParts, {
      sendToVisionWorker: async () => ({
        success: true,
        response: "A 1x1 red pixel",
      }),
      model: "test-vision-model",
    });

    expect(result.success).toBe(true);
    expect(result.model).toBe("test-vision-model");

    // Step 3: Format result
    const formatted = formatVisionAnalysis(result);
    expect(formatted).toContain("[VISION ANALYSIS]");
    expect(formatted).toContain("1x1 red pixel");

    // Step 4: Replace images with analysis
    const finalParts = replaceImagesWithAnalysis(originalParts, formatted!, {
      sessionID: "ses-1",
      messageID: "msg-1",
    });

    // Verify final state
    expect(finalParts.length).toBe(1);
    expect(finalParts[0].text).toContain("What is this?");
    expect(finalParts[0].text).toContain("[VISION ANALYSIS]");
    expect(finalParts[0].text).toContain("1x1 red pixel");
  });

  test("error workflow: graceful failure handling", async () => {
    const parts = [
      { type: "image", base64: TEST_PNG_BASE64 },
    ];

    // Simulate worker failure
    const result = await analyzeImages(parts, {
      sendToVisionWorker: async () => ({
        success: false,
        error: "Vision model unavailable",
      }),
    });

    expect(result.success).toBe(false);

    // Format error
    const formatted = formatVisionAnalysis(result);
    expect(formatted).toContain("[VISION ANALYSIS FAILED]");
    expect(formatted).toContain("Vision model unavailable");

    // Replace still works with error text
    const finalParts = replaceImagesWithAnalysis(parts, formatted!);
    expect(finalParts[0].text).toContain("[VISION ANALYSIS FAILED]");
  });
});
