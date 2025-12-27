import { exec } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type ProcessInfo = {
  pid: number;
  cpu: number;
  memory: number;
  started: string;
  command: string;
  type: "opencode-serve" | "opencode-main" | "vite" | "bun" | "other";
};

export type SystemStats = {
  processes: ProcessInfo[];
  totalMemory: number;
  totalCpu: number;
  count: number;
};

async function getOpencodeProcesses(): Promise<SystemStats> {
  try {
    const { stdout } = await execAsync(
      `/bin/ps aux | /usr/bin/grep -E 'opencode|node.*vite|bun.*serve' | /usr/bin/grep -v grep`,
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    const processes: ProcessInfo[] = [];
    let totalMemory = 0;
    let totalCpu = 0;

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      const cpu = parseFloat(parts[2]) || 0;
      const memKb = parseInt(parts[5], 10) || 0;
      const memory = memKb / 1024; // Convert to MB
      const started = parts[8] || "";
      const command = parts.slice(10).join(" ");

      // Determine process type
      let type: ProcessInfo["type"] = "other";
      if (command.includes("opencode serve")) {
        type = "opencode-serve";
      } else if (command.includes("opencode") && !command.includes("serve")) {
        type = "opencode-main";
      } else if (command.includes("vite")) {
        type = "vite";
      } else if (command.includes("bun")) {
        type = "bun";
      }

      processes.push({ pid, cpu, memory, started, command, type });
      totalMemory += memory;
      totalCpu += cpu;
    }

    // Sort by memory usage descending
    processes.sort((a, b) => b.memory - a.memory);

    return {
      processes,
      totalMemory,
      totalCpu,
      count: processes.length,
    };
  } catch {
    return { processes: [], totalMemory: 0, totalCpu: 0, count: 0 };
  }
}

async function killProcess(pid: number): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`kill ${pid}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function killAllOpencodeServe(): Promise<{ killed: number; errors: string[] }> {
  try {
    const stats = await getOpencodeProcesses();
    const servePids = stats.processes.filter((p) => p.type === "opencode-serve").map((p) => p.pid);

    let killed = 0;
    const errors: string[] = [];

    for (const pid of servePids) {
      const result = await killProcess(pid);
      if (result.success) {
        killed++;
      } else if (result.error) {
        errors.push(`PID ${pid}: ${result.error}`);
      }
    }

    return { killed, errors };
  } catch (err) {
    return { killed: 0, errors: [String(err)] };
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

export function createSystemRouter() {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? "";
    const method = req.method ?? "GET";

    // Handle CORS preflight
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.end();
      return;
    }

    // GET /api/system/processes - List all opencode processes
    if (url === "/api/system/processes" && method === "GET") {
      const stats = await getOpencodeProcesses();
      sendJson(res, 200, stats);
      return;
    }

    // DELETE /api/system/processes/:pid - Kill a specific process
    const killMatch = url.match(/^\/api\/system\/processes\/(\d+)$/);
    if (killMatch && method === "DELETE") {
      const pid = parseInt(killMatch[1], 10);
      const result = await killProcess(pid);
      if (result.success) {
        sendJson(res, 200, { success: true, pid });
      } else {
        sendJson(res, 500, { success: false, error: result.error });
      }
      return;
    }

    // POST /api/system/processes/kill-all-serve - Kill all opencode serve processes
    if (url === "/api/system/processes/kill-all-serve" && method === "POST") {
      const result = await killAllOpencodeServe();
      sendJson(res, 200, result);
      return;
    }

    // 404 for unknown routes
    sendJson(res, 404, { error: "Not found" });
  };
}
