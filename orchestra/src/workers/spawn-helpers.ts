/* c8 ignore file */
const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Unwrap SDK responses that nest payloads under a data field. */
export const extractSdkData = (value: unknown): unknown => {
  if (asRecord(value) && "data" in value) return (value as { data?: unknown }).data ?? value;
  return value;
};

/** Normalize SDK error payloads into a human-readable message. */
export const extractSdkErrorMessage = (value: unknown): string | undefined => {
  const sdkError = asRecord(value) && "error" in value ? (value as { error?: unknown }).error : value;
  if (!sdkError) return undefined;
  if (sdkError instanceof Error) return sdkError.message;
  if (typeof sdkError === "string") return sdkError;
  if (asRecord(sdkError)) {
    const dataMessage = asRecord(sdkError.data) ? sdkError.data.message : undefined;
    if (typeof dataMessage === "string" && dataMessage.trim()) return dataMessage;
    if (typeof sdkError.message === "string" && sdkError.message.trim()) return sdkError.message;
  }
  try {
    return JSON.stringify(sdkError);
  } catch {
    return String(sdkError);
  }
};

/** Race a promise against a timeout and optionally abort. */
export const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, abort?: AbortController): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort(new Error("worker bootstrap timed out. Check worker logs or increase startup timeout."));
      reject(new Error("worker bootstrap timed out. Check worker logs or increase startup timeout."));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
};

/** Validate that a numeric port is within the valid range. */
export const isValidPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535;
