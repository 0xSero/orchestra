import type { ProgressHandle, ToastFn } from "./progress";

export interface VisionResult {
  success: boolean;
  analysis?: string;
  error?: string;
  model?: string;
  durationMs?: number;
}

export interface ImageAttachment {
  type: "image";
  base64?: string;
  mimeType?: string;
}

export interface AnalyzeOptions {
  sendToVisionWorker: (
    message: string,
    attachments: ImageAttachment[],
    timeout: number
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  model?: string;
  progress?: ProgressHandle;
  showToast?: ToastFn;
  timeout?: number;
  prompt?: string;
}
