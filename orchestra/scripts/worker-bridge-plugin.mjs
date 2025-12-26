import { tool } from "@opencode-ai/plugin";

const streamChunk = tool({
  description: "Internal worker bridge stream chunk (no-op).",
  args: {
    streamId: tool.schema.string().optional(),
    chunk: tool.schema.string().optional(),
    done: tool.schema.boolean().optional(),
    meta: tool.schema.record(tool.schema.any()).optional(),
  },
  async execute() {
    return "";
  },
});

const streamEnd = tool({
  description: "Internal worker bridge stream end (no-op).",
  args: {
    streamId: tool.schema.string().optional(),
  },
  async execute() {
    return "";
  },
});

export const WorkerBridgePlugin = async () => {
  return {
    tool: {
      stream_chunk: streamChunk,
      stream_end: streamEnd,
    },
  };
};

export default WorkerBridgePlugin;
