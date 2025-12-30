/**
 * Stream Formatter - Formats worker output with visual distinction
 */

import type { StreamChunk } from "./bridge-server";

export interface FormattedChunk {
  workerId: string;
  jobId?: string;
  content: string;
  timestamp: number;
  final: boolean;
}

/**
 * Format a stream chunk with ASCII box header for visual distinction
 */
export function formatStreamChunk(chunk: StreamChunk | null | undefined, isFirst: boolean, isFinal: boolean): string {
  // Defensive: handle undefined/null chunk
  if (!chunk || typeof chunk.workerId !== "string" || typeof chunk.chunk !== "string") {
    return "";
  }

  const workerLabel = chunk.workerId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const lines: string[] = [];

  if (isFirst) {
    // Add header box on first chunk
    const headerWidth = Math.max(50, workerLabel.length + 10);
    const hr = "─".repeat(headerWidth - 2);
    lines.push(`┌${hr}┐`);
    lines.push(`│ 🤖 ${workerLabel.padEnd(headerWidth - 7)}│`);
    lines.push(`├${hr}┤`);
  }

  // Add the content with left border
  const contentLines = chunk.chunk.split("\n");
  for (const line of contentLines) {
    lines.push(`│ ${line}`);
  }

  if (isFinal) {
    // Add footer on final chunk
    const footerWidth = Math.max(50, workerLabel.length + 10);
    const hr = "─".repeat(footerWidth - 2);
    lines.push(`└${hr}┘`);
  }

  return lines.join("\n");
}

/**
 * Create a stream buffer that accumulates chunks and formats them with visual distinction
 */
export function createStreamBuffer(workerId: string) {
  let chunks: string[] = [];
  let isStarted = false;

  return {
    add(chunk: string, isFinal: boolean): string {
      const formatted = formatStreamChunk(
        { workerId, chunk, timestamp: Date.now(), final: isFinal },
        !isStarted,
        isFinal
      );
      isStarted = true;
      chunks.push(chunk);
      return formatted;
    },

    getFullContent(): string {
      return chunks.join("");
    },

    reset() {
      chunks = [];
      isStarted = false;
    },
  };
}

/**
 * Format a complete worker response with ASCII box
 */
export function formatWorkerResponse(workerId: string | null | undefined, content: string | null | undefined): string {
  // Defensive: handle undefined/null inputs
  if (typeof workerId !== "string" || typeof content !== "string") {
    return content ?? "";
  }

  const workerLabel = workerId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const headerWidth = Math.max(60, workerLabel.length + 10);
  const hr = "─".repeat(headerWidth - 2);

  const lines: string[] = [];
  lines.push(`┌${hr}┐`);
  lines.push(`│ 🤖 ${workerLabel.padEnd(headerWidth - 7)}│`);
  lines.push(`├${hr}┤`);

  const contentLines = content.split("\n");
  for (const line of contentLines) {
    // Wrap long lines to fit within box
    if (line.length > headerWidth - 4) {
      const wrapped = wrapText(line, headerWidth - 4);
      for (const wrappedLine of wrapped) {
        lines.push(`│ ${wrappedLine.padEnd(headerWidth - 4)}│`);
      }
    } else {
      lines.push(`│ ${line.padEnd(headerWidth - 4)}│`);
    }
  }

  lines.push(`└${hr}┘`);
  return lines.join("\n");
}

/**
 * Wrap text to a maximum width
 */
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length ? lines : [""];
}
