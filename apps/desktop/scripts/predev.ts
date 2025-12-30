import { existsSync } from "node:fs";
import { $ } from "bun";

import { copyBinaryToSidecarFolder, getCurrentSidecar } from "./utils";

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE;

const sidecarConfig = getCurrentSidecar(RUST_TARGET);

const binaryPath = `../opencode/dist/${sidecarConfig.ocBinary}/bin/opencode`;

if (!existsSync("../opencode")) {
  console.log("Skipping sidecar build: ../opencode not found");
  process.exit(0);
}

await $`cd ../opencode && bun run build --single`;

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET);
