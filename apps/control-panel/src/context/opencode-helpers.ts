import type { FilePartInput, Message, Part, Provider } from "@opencode-ai/sdk/client";
import type {
  ModelOption,
  OpenCodeEventItem,
  OrchestratorEvent,
  WorkerRuntime,
  WorkerStatus,
  WorkerStreamChunk,
} from "./opencode-types";

type WorkerLastResultReport = NonNullable<WorkerRuntime["lastResult"]>["report"];

const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export const isWorkerStatus = (value: unknown): value is WorkerStatus =>
  value === "starting" || value === "ready" || value === "busy" || value === "error" || value === "stopped";

export const buildModelOptions = (providers: Provider[]): ModelOption[] => {
  const byValue = new Map<string, ModelOption>();
  byValue.set("auto", { value: "auto", label: "Auto (Best Available)" });

  for (const provider of providers) {
    const providerId = provider.id;
    const providerName = provider.name ?? providerId;
    const models = provider.models ?? {};

    for (const [key, model] of Object.entries(models)) {
      const modelId = model.id ?? key;
      if (!modelId) continue;
      const value = String(modelId).includes(":") ? String(modelId) : `${providerId}:${modelId}`;
      const modelName = model.name ?? modelId;
      const label = `${providerName} · ${modelName}`;
      byValue.set(value, { value, label });
    }
  }

  const options = Array.from(byValue.values()).filter((option) => option.value !== "auto");
  options.sort((a, b) => a.label.localeCompare(b.label));
  return [byValue.get("auto")!, ...options];
};

export const extractProvidersPayload = (payload: unknown): Provider[] => {
  if (!asRecord(payload)) return [];
  if (Array.isArray(payload.providers)) return payload.providers as Provider[];
  if (Array.isArray(payload.all)) return payload.all as Provider[];
  return [];
};

export const extractToolIdsPayload = (payload: unknown): string[] =>
  Array.isArray(payload) ? payload.map((id) => String(id)) : [];

export const extractMessagesAndParts = (rawData: unknown): { messages: Message[]; parts: Part[] } => {
  const messages: Message[] = [];
  const parts: Part[] = [];

  if (!rawData) return { messages, parts };

  if (Array.isArray(rawData)) {
    for (const item of rawData) {
      if (!asRecord(item)) continue;
      const info = item.info;
      if (info) messages.push(info as Message);
      if (Array.isArray(item.parts)) parts.push(...(item.parts as Part[]));
    }
    return { messages, parts };
  }

  if (asRecord(rawData)) {
    if (Array.isArray(rawData.messages)) messages.push(...(rawData.messages as Message[]));
    if (Array.isArray(rawData.parts)) parts.push(...(rawData.parts as Part[]));
  }

  return { messages, parts };
};

export const createEventItem = (payload: unknown): OpenCodeEventItem => {
  const type = asRecord(payload) && typeof payload.type === "string" ? payload.type : "event";
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    at: Date.now(),
  };
};

export const toWorkerRuntime = (raw: unknown): WorkerRuntime | null => {
  if (!asRecord(raw)) return null;
  const profile = asRecord(raw.profile) ? raw.profile : {};
  const id = typeof profile.id === "string" ? profile.id : typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;
  const name = typeof profile.name === "string" ? profile.name : typeof raw.name === "string" ? raw.name : id;
  const status = isWorkerStatus(raw.status) ? raw.status : "starting";
  const uiSessionId = typeof raw.uiSessionId === "string" ? raw.uiSessionId : undefined;
  const workerSessionId = typeof raw.sessionId === "string" ? raw.sessionId : undefined;
  const sessionId = uiSessionId ?? workerSessionId;
  const lastResult = asRecord(raw.lastResult) ? raw.lastResult : undefined;
  const supportsVision = Boolean(profile.supportsVision) || Boolean(raw.supportsVision);
  const supportsWeb = Boolean(profile.supportsWeb) || Boolean(raw.supportsWeb);

  return {
    id,
    name,
    status,
    sessionId,
    workerSessionId,
    parentSessionId: typeof raw.parentSessionId === "string" ? raw.parentSessionId : undefined,
    model: typeof profile.model === "string" ? profile.model : typeof raw.model === "string" ? raw.model : undefined,
    port: typeof raw.port === "number" ? raw.port : undefined,
    serverUrl: typeof raw.serverUrl === "string" ? raw.serverUrl : undefined,
    supportsVision,
    supportsWeb,
    lastActivity: typeof raw.lastActivity === "string" ? raw.lastActivity : undefined,
    currentTask: typeof raw.currentTask === "string" ? raw.currentTask : undefined,
    lastResult: lastResult
      ? {
          at: typeof lastResult.at === "string" ? lastResult.at : undefined,
          jobId: typeof lastResult.jobId === "string" ? lastResult.jobId : undefined,
          response: typeof lastResult.response === "string" ? lastResult.response : undefined,
          report: asRecord(lastResult.report) ? (lastResult.report as WorkerLastResultReport) : undefined,
          durationMs: typeof lastResult.durationMs === "number" ? lastResult.durationMs : undefined,
        }
      : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
    warning: typeof raw.warning === "string" ? raw.warning : undefined,
  };
};

export const parseOrchestratorEvent = (payload: unknown): OrchestratorEvent | null => {
  if (!asRecord(payload)) return null;
  const type = payload.type;
  if (typeof type !== "string") return null;
  const data = asRecord(payload.data) ? payload.data : undefined;
  if (!data) return null;
  if (typeof payload.id !== "string") return null;
  if (typeof payload.timestamp !== "number") return null;
  if (typeof payload.version !== "number") return null;
  return payload as OrchestratorEvent;
};

export const extractWorkerSnapshotFromEvent = (event: OrchestratorEvent): unknown | null => {
  if (event.type !== "orchestra.worker.status") return null;
  const data = event.data;
  if (!asRecord(data)) return null;
  const worker = data.worker;
  return asRecord(worker) ? worker : null;
};

export const extractWorkerStreamChunkFromEvent = (event: OrchestratorEvent): WorkerStreamChunk | null => {
  if (event.type !== "orchestra.worker.stream") return null;
  const data = event.data;
  if (!asRecord(data)) return null;
  const chunk = asRecord(data.chunk) ? data.chunk : undefined;
  if (!chunk) return null;
  const workerId = typeof chunk.workerId === "string" ? chunk.workerId : "";
  if (!workerId) return null;
  return {
    workerId,
    jobId: typeof chunk.jobId === "string" ? chunk.jobId : undefined,
    chunk: typeof chunk.chunk === "string" ? chunk.chunk : "",
    timestamp: typeof chunk.timestamp === "number" ? chunk.timestamp : Date.now(),
    final: Boolean(chunk.final),
  };
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export const buildAttachmentParts = async (
  attachments?: Array<{
    type: "file" | "image";
    name?: string;
    url?: string;
    file?: File;
  }>,
): Promise<FilePartInput[]> => {
  if (!attachments || attachments.length === 0) return [];
  const parts: FilePartInput[] = [];
  for (const attachment of attachments) {
    if (!attachment.file) continue;
    const url = await fileToDataUrl(attachment.file);
    parts.push({
      type: "file",
      mime: attachment.file.type || "application/octet-stream",
      filename: attachment.name ?? attachment.file.name,
      url,
    });
  }
  return parts;
};
