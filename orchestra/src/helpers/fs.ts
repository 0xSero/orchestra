import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type WriteJsonAtomicOptions = {
  tmpPrefix?: string;
  fs?: {
    mkdir?: typeof mkdir;
    rename?: typeof rename;
    unlink?: typeof unlink;
    writeFile?: typeof writeFile;
  };
};

/**
 * Write JSON data atomically using a temp file and rename.
 *
 * Uses a temp file in the same directory as the target to ensure rename is atomic
 * (same filesystem). Falls back to direct write only if same-directory temp fails,
 * with a warning that atomicity is not guaranteed.
 */
export async function writeJsonAtomic(path: string, data: unknown, options?: WriteJsonAtomicOptions): Promise<void> {
  const fs = {
    mkdir: options?.fs?.mkdir ?? mkdir,
    rename: options?.fs?.rename ?? rename,
    unlink: options?.fs?.unlink ?? unlink,
    writeFile: options?.fs?.writeFile ?? writeFile,
  };

  const targetDir = dirname(path);
  await fs.mkdir(targetDir, { recursive: true }).catch(() => {});

  // Use temp file in same directory to ensure atomic rename (same filesystem)
  const tmpName = `.${options?.tmpPrefix ?? "opencode-orch"}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  const tmp = join(targetDir, tmpName);

  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, path);
  } catch (renameError) {
    // Clean up temp file if it exists
    await fs.unlink(tmp).catch(() => {});

    // Last resort: direct write (not atomic, but better than failing)
    // This should rarely happen since temp is in same directory
    console.warn(
      `[writeJsonAtomic] Atomic rename failed for ${path}, falling back to direct write. ` +
        `Data integrity is not guaranteed if process crashes during write.`,
    );
    await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
  }
}
