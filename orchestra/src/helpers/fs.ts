import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type WriteJsonAtomicOptions = {
  tmpPrefix?: string;
};

export async function writeJsonAtomic(path: string, data: unknown, options?: WriteJsonAtomicOptions): Promise<void> {
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  const tmp = join(
    tmpdir(),
    `${options?.tmpPrefix ?? "opencode-orch"}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path).catch(async () => {
    // Fallback for cross-device rename issues.
    await writeFile(path, JSON.stringify(data, null, 2), "utf8");
    await unlink(tmp).catch(() => {});
  });
}
