import { EventEmitter } from "node:events";

export type StreamChunk = {
  workerId: string;
  jobId?: string;
  chunk: string;
  timestamp: number;
  final?: boolean;
};

export const streamEmitter = new EventEmitter();
streamEmitter.setMaxListeners(100); // Allow many concurrent SSE connections

const STREAM_BUFFER_LIMIT = 500;
const streamBuffer: StreamChunk[] = [];

export function recordStreamChunk(chunk: StreamChunk): void {
  streamBuffer.push(chunk);
  if (streamBuffer.length > STREAM_BUFFER_LIMIT) {
    streamBuffer.splice(0, streamBuffer.length - STREAM_BUFFER_LIMIT);
  }
}

export function listStreamChunks(options?: { workerId?: string; jobId?: string; limit?: number; after?: number }): StreamChunk[] {
  const limit = Math.max(1, options?.limit ?? STREAM_BUFFER_LIMIT);
  const after = options?.after ?? 0;
  const filtered = streamBuffer.filter((chunk) => {
    if (options?.workerId && chunk.workerId !== options.workerId) return false;
    if (options?.jobId && chunk.jobId !== options.jobId) return false;
    if (after && chunk.timestamp <= after) return false;
    return true;
  });
  if (filtered.length <= limit) return filtered;
  return filtered.slice(-limit);
}
