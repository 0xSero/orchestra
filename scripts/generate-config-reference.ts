import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const schemaPath = join(process.cwd(), "schema", "orchestrator.schema.json");
const outPath = join(process.cwd(), "docs", "configuration-reference.md");

const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, any>;

const lines: string[] = [];
lines.push("# Configuration Reference");
lines.push("");
lines.push("This file is auto-generated from `schema/orchestrator.schema.json`.");
lines.push("Run `bun scripts/generate-config-reference.ts` to regenerate.");
lines.push("");

function describeType(node: any): string {
  if (!node) return "unknown";
  if (node.enum) return `enum(${node.enum.join(", ")})`;
  if (node.type) return node.type;
  if (node.oneOf) return "oneOf";
  if (node.anyOf) return "anyOf";
  return "unknown";
}

function describeConstraints(node: any): string[] {
  const constraints: string[] = [];
  if (!node || typeof node !== "object") return constraints;
  if (typeof node.minimum === "number") constraints.push(`minimum: ${node.minimum}`);
  if (typeof node.maximum === "number") constraints.push(`maximum: ${node.maximum}`);
  if (typeof node.pattern === "string") constraints.push(`pattern: ${node.pattern}`);
  if (node.enum) constraints.push(`enum: ${node.enum.join(", ")}`);
  if (node.additionalProperties === false) constraints.push("additionalProperties: false");
  if (node.additionalProperties && typeof node.additionalProperties === "object") {
    constraints.push(`additionalProperties: ${describeType(node.additionalProperties)}`);
  }
  if (node.items) constraints.push(`items: ${describeType(node.items)}`);
  return constraints;
}

function walk(node: any, path: string) {
  if (!node || typeof node !== "object") return;
  const props = node.properties ?? {};
  for (const [key, child] of Object.entries(props)) {
    const nextPath = path ? `${path}.${key}` : key;
    lines.push(`## ${nextPath}`);
    lines.push("");
    lines.push(`- Type: ${describeType(child)}`);
    if (child.description) lines.push(`- Description: ${String(child.description)}`);
    if (child.default !== undefined) lines.push(`- Default: ${JSON.stringify(child.default)}`);
    const constraints = describeConstraints(child as any);
    if (constraints.length > 0) lines.push(`- Validation: ${constraints.join("; ")}`);
    lines.push("");

    walk(child, nextPath);
  }
}

walk(schema, "");

writeFileSync(outPath, lines.join("\n"), "utf8");
