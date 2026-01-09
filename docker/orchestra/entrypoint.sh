#!/usr/bin/env sh
set -eu

cd /workspace

config_root="${XDG_CONFIG_HOME:-/data}/opencode"
plugin_dir="${config_root}/plugin"

mkdir -p "${plugin_dir}"

dist_path="/workspace/packages/orchestrator/dist/index.js"

bun install

if [ ! -f "${dist_path}" ] || find /workspace/packages/orchestrator/src -type f -newer "${dist_path}" -print -quit | grep -q .; then
  bun run build:plugin
fi

plugin_path="${plugin_dir}/orchestrator.js"
printf 'export { OrchestratorPlugin as default } from "%s";\n' "${dist_path}" > "${plugin_path}"

opencode_config="${config_root}/opencode.json"
OPENCODE_CONFIG_ROOT="${config_root}" \
node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readJson(filepath) {
  try {
    if (!filepath || !fs.existsSync(filepath)) return {};
    const raw = fs.readFileSync(filepath, "utf8");
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizePlugins(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry.trim());
}

function isOrchestratorPlugin(entry) {
  return /orchestrator\\.(?:js|mjs|cjs|ts)\\b/i.test(entry);
}

const configRoot = process.env.OPENCODE_CONFIG_ROOT || "/data/opencode";
const opencodeConfigPath = path.join(configRoot, "opencode.json");

const base = readJson(opencodeConfigPath);
const merged = { ...base };
if (isObject(merged.provider) && "homelabai" in merged.provider) {
  const { homelabai: _dropped, ...rest } = merged.provider;
  merged.provider = rest;
  if (!Object.keys(rest).length) delete merged.provider;
}

const plugins = normalizePlugins(base.plugin).filter(
  (entry) => !isOrchestratorPlugin(entry),
);
merged.plugin = [...new Set([...plugins, "./plugin/orchestrator.js"])];
merged.$schema = typeof merged.$schema === "string" ? merged.$schema : "https://opencode.ai/config.json";

fs.mkdirSync(path.dirname(opencodeConfigPath), { recursive: true });
fs.writeFileSync(opencodeConfigPath, JSON.stringify(merged, null, 2) + "\n");
NODE

exec opencode serve --hostname="${OPENCODE_HOSTNAME}" --port="${OPENCODE_PORT}" --print-logs
