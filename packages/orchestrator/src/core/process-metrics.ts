import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : unit <= 2 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export async function getProcessRssBytes(
  pid: number,
): Promise<number | undefined> {
  if (!Number.isFinite(pid) || pid <= 0) return undefined;

  if (process.platform === "linux") {
    const status = await readFile(`/proc/${pid}/status`, "utf8").catch(
      () => "",
    );
    const m = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (m) {
      const kb = Number(m[1]);
      if (Number.isFinite(kb)) return kb * 1024;
    }
  }

  const { stdout } = await execFileAsync("ps", [
    "-o",
    "rss=",
    "-p",
    String(pid),
  ]).catch(() => ({ stdout: "" }) as any);
  const kb = Number(String(stdout).trim().split(/\s+/)[0]);
  if (!Number.isFinite(kb)) return undefined;
  return kb * 1024;
}

export type ProcessInfo = { pid: number; rssBytes?: number; args: string };

export async function listOpencodeServeProcesses(): Promise<ProcessInfo[]> {
  const { stdout } = await execFileAsync("ps", [
    "-axo",
    "pid=,rss=,args=",
  ]).catch(() => ({ stdout: "" }) as any);
  const lines = String(stdout)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ProcessInfo[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const pid = Number(parts[0]);
    const rssKb = Number(parts[1]);
    const args = parts.slice(2).join(" ");
    if (!Number.isFinite(pid) || pid <= 0) continue;
    // Match "opencode serve" but not tsserver or other node processes that happen to have similar strings
    if (!args.includes("opencode serve --hostname")) continue;
    out.push({
      pid,
      rssBytes: Number.isFinite(rssKb) ? rssKb * 1024 : undefined,
      args,
    });
  }
  return out;
}
