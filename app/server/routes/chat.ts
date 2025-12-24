import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { workerPool } from "@orchestrator/core/worker-pool";
import { sendToWorker } from "@orchestrator/workers/spawner";
import { streamEmitter, type StreamChunk } from "@orchestrator/core/bridge-server";

export const chatRoutes = new Hono();

// POST /api/chat/:workerId - Send chat message with streaming response
chatRoutes.post("/:workerId", async (c) => {
  const workerId = c.req.param("workerId");
  const worker = workerPool.get(workerId);

  if (!worker) {
    return c.json({ error: "Worker not found" }, 404);
  }

  try {
    const { message, attachments } = await c.req.json();

    // Return SSE stream for the response
    return streamSSE(c, async (stream) => {
      let responseText = "";

      // Listen for chunks from this worker
      const onChunk = (chunk: StreamChunk) => {
        if (chunk.workerId !== workerId) return;

        responseText += chunk.chunk;

        // Stream in AI SDK compatible format
        stream.writeSSE({
          event: "text",
          data: JSON.stringify({ text: chunk.chunk }),
        });

        if (chunk.final) {
          stream.writeSSE({
            event: "finish",
            data: JSON.stringify({
              finishReason: "stop",
              usage: { promptTokens: 0, completionTokens: 0 },
            }),
          });
        }
      };

      streamEmitter.on("chunk", onChunk);

      try {
        // Send message to worker (this triggers the stream)
        await sendToWorker(workerId, message, {
          attachments,
          timeout: 300000, // 5 min for long responses
        });
      } catch (error) {
        stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: (error as Error).message }),
        });
      } finally {
        streamEmitter.off("chunk", onChunk);
      }
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});
