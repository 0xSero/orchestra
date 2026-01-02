export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export function stripCodeBlocks(input: string): string {
  return input.replace(/```[\s\S]*?```/g, "[code omitted]");
}

export function redactSecrets(input: string): string {
  const patterns: RegExp[] = [
    /\bsk-[a-zA-Z0-9]{16,}\b/g, // common API key prefix
    /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key
    /\bAIza[0-9A-Za-z\-_]{20,}\b/g, // Google API key
    /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub token
    /\b(xox[baprs]-[0-9A-Za-z-]{10,})\b/g, // Slack token
    /\b-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----\b/g,
  ];
  let out = input;
  for (const re of patterns) out = out.replace(re, "[REDACTED]");
  return out;
}

export function normalizeForMemory(input: string, maxChars: number): string {
  const cleaned = redactSecrets(stripCodeBlocks(input))
    .replace(/\s+/g, " ")
    .trim();
  return truncate(cleaned, maxChars);
}

export function shortenWithMarker(
  text: string,
  maxChars: number,
  options?: { headRatio?: number },
): string {
  if (text.length <= maxChars) return text;
  const headRatio =
    typeof options?.headRatio === "number" ? options.headRatio : 0.4;
  const marker = `\n\n[... trimmed ${text.length - maxChars} chars ...]\n\n`;
  const budget = Math.max(0, maxChars - marker.length);
  const keepHead = Math.floor(budget * headRatio);
  const keepTail = budget - keepHead;
  return `${text.slice(0, keepHead)}${marker}${text.slice(text.length - keepTail)}`;
}

export function appendRollingSummary(
  prev: string | undefined,
  entry: string,
  maxChars: number,
): string {
  const next =
    prev && prev.trim().length > 0 ? `${prev.trim()}\n${entry}` : entry;
  return shortenWithMarker(next, maxChars, { headRatio: 0.35 });
}
