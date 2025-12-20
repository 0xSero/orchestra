import { readFileSync } from "node:fs";

function parseTimeVerbose(text: string) {
  const pick = (prefix: string) => {
    const line = text
      .split("\n")
      .map((l) => l.trimEnd())
      .find((l) => l.startsWith(prefix));
    if (!line) return undefined;
    return line.slice(prefix.length).trim();
  };

  return {
    command: pick("Command being timed:")?.replace(/^"|"$/g, ""),
    userSeconds: pick("User time (seconds):"),
    systemSeconds: pick("System time (seconds):"),
    cpuPercent: pick("Percent of CPU this job got:"),
    elapsed: pick("Elapsed (wall clock) time (h:mm:ss or m:ss):"),
    maxRssKb: pick("Maximum resident set size (kbytes):"),
    pageFaultsMajor: pick("Major (requiring I/O) page faults:"),
    pageFaultsMinor: pick("Minor (reclaiming a frame) page faults:"),
    fsInputs: pick("File system inputs:"),
    fsOutputs: pick("File system outputs:"),
    exitStatus: pick("Exit status:"),
  };
}

function toMarkdownTable(rows: Array<[string, string | undefined]>) {
  const filtered = rows.filter(([, v]) => v !== undefined && String(v).length > 0) as Array<[string, string]>;
  if (filtered.length === 0) return "_No resource data captured._\n";
  const lines: string[] = [];
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const [k, v] of filtered) lines.push(`| ${k} | ${String(v).replace(/\|/g, "\\|")} |`);
  lines.push("");
  return lines.join("\n");
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: bun scripts/ci/summarize-usrbin-time.ts <path-to-time-log>");
    process.exit(2);
  }

  const raw = readFileSync(input, "utf8");
  const parsed = parseTimeVerbose(raw);
  process.stdout.write(
    [
      "## Resource usage",
      "",
      toMarkdownTable([
        ["Command", parsed.command],
        ["Elapsed", parsed.elapsed],
        ["CPU", parsed.cpuPercent],
        ["User seconds", parsed.userSeconds],
        ["System seconds", parsed.systemSeconds],
        ["Max RSS (kB)", parsed.maxRssKb],
        ["Major page faults", parsed.pageFaultsMajor],
        ["Minor page faults", parsed.pageFaultsMinor],
        ["FS inputs", parsed.fsInputs],
        ["FS outputs", parsed.fsOutputs],
        ["Exit status", parsed.exitStatus],
      ]),
    ].join("\n")
  );
}

main();

