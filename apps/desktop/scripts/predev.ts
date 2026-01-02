import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { $ } from "bun";

import { copyBinaryToSidecarFolder, getCurrentSidecar } from "./utils";

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE;

const sidecarConfig = getCurrentSidecar(RUST_TARGET);

const binaryPath = `../opencode/dist/${sidecarConfig.ocBinary}/bin/opencode`;

if (!existsSync("../opencode")) {
  console.log("Skipping sidecar build: ../opencode not found");
  // Create a stub sidecar so Tauri dev can still run
  const stubPath = `src-tauri/sidecars/opencode-cli-${RUST_TARGET}${process.platform === "win32" ? ".exe" : ""}`;
  await $`mkdir -p src-tauri/sidecars`;
  if (!existsSync(stubPath)) {
    // Create a minimal stub script that explains the situation
    const stubContent = process.platform === "win32"
      ? `@echo off\necho OpenCode CLI stub - run from opencode repo for full functionality\nexit /b 1`
      : `#!/bin/sh\necho "OpenCode CLI stub - run from opencode repo for full functionality"\nexit 1`;
    writeFileSync(stubPath, stubContent);
    chmodSync(stubPath, 0o755);
    console.log(`Created stub sidecar at ${stubPath}`);
  }
  process.exit(0);
}

await $`cd ../opencode && bun run build --single`;

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET);
