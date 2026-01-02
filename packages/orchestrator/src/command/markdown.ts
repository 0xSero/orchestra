export function toBool(value: unknown): boolean {
  return value === true;
}

export function renderMarkdownTable(
  headers: string[],
  rows: string[][],
): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((r) => `| ${r.map((c) => esc(c.replace(/\n/g, " "))).join(" | ")} |`)
    .join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}
