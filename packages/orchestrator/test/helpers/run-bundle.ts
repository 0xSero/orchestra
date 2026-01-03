import { startRunRecorder, type RunRecorder } from "./run-recorder";

export type RunBundleOptions = {
  testName: string;
  workflowId?: string | null;
  model?: string;
  directory?: string;
  runRoot?: string;
  messageLimit?: number;
};

export type RunBundleHandle = {
  start: () => Promise<RunRecorder>;
  finalize: () => Promise<void>;
  getRecorder: () => RunRecorder | undefined;
};

export const withRunBundle = (options: RunBundleOptions): RunBundleHandle => {
  let recorder: RunRecorder | undefined;

  const start = async () => {
    if (!recorder) {
      recorder = await startRunRecorder({
        workflowId: options.workflowId ?? null,
        testName: options.testName,
        runRoot: options.runRoot,
        directory: options.directory,
        model: options.model,
        messageLimit: options.messageLimit,
      });
    }
    return recorder;
  };

  const finalize = async () => {
    if (recorder) {
      await recorder.finalize();
    }
  };

  return { start, finalize, getRecorder: () => recorder };
};
