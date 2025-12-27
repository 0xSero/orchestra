import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { extractVisionAttachments } from "../../src/ux/vision-attachments";

const withPlatform = async (platform: string, run: () => Promise<void>) => {
  const original = process.platform;
  Object.defineProperty(process, "platform", { value: platform });
  try {
    await run();
  } finally {
    Object.defineProperty(process, "platform", { value: original });
  }
};

const withPath = async (dir: string, run: () => Promise<void>) => {
  const original = process.env.PATH;
  process.env.PATH = `${dir}:${original ?? ""}`;
  try {
    await run();
  } finally {
    if (original !== undefined) process.env.PATH = original;
    else delete process.env.PATH;
  }
};

const writeExecutable = async (dir: string, name: string, contents: string) => {
  const path = join(dir, name);
  await writeFile(path, contents, "utf8");
  await chmod(path, 0o755);
  return path;
};

describe("vision attachments", () => {
  test("extracts attachments from paths, data URLs, and base64", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-vision-"));
    try {
      const filePath = join(dir, "image.png");
      const absPath = join(dir, "image-abs.jpg");
      const webpPath = join(dir, "image.webp");
      await writeFile(filePath, "data", "utf8");
      await writeFile(absPath, "data", "utf8");
      await writeFile(webpPath, "data", "utf8");

      const fileUrl = pathToFileURL(filePath).toString();
      const parts = [
        { type: "file", url: fileUrl, mime: "image/png" },
        { type: "file", url: absPath, mime: "image/jpeg" },
        { type: "file", url: "data:image/png;base64,Zm9v" },
        { type: "image", base64: "Zm9v", mime: "image/png" },
        { type: "image", url: webpPath },
      ];
      const attachments = await extractVisionAttachments(parts as never[]);
      expect(attachments.length).toBe(5);
      expect(attachments[0]?.mimeType).toBe("image/png");
      expect(attachments[1]?.mimeType).toBe("image/jpeg");
      expect(attachments[4]?.mimeType).toBe("image/webp");
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("returns null for unreadable file paths", async () => {
    const attachments = await extractVisionAttachments([{ type: "file", url: "file:///missing.png" }] as never[]);
    expect(attachments.length).toBe(0);
  });

  test("reads clipboard on darwin using osascript", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-vision-osascript-"));
    try {
      await writeExecutable(
        dir,
        "osascript",
        `#!/bin/sh
if [ "$1" = "-e" ]; then
  script="$2"
  outPath=$(printf "%s" "$script" | sed -n 's/^set outPath to \"\\(.*\\)\"$/\\1/p' | head -n 1)
  if [ -n "$outPath" ]; then
    printf "pngdata" > "$outPath"
  fi
fi
exit 0
`,
      );

      await withPlatform("darwin", async () => {
        await withPath(dir, async () => {
          const attachments = await extractVisionAttachments([{ type: "file", url: "clipboard" }] as never[]);
          expect(attachments[0]?.base64).toBeTruthy();
        });
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("reads clipboard on linux with wl-paste and xclip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-vision-linux-"));
    try {
      await writeExecutable(dir, "wl-paste", "#!/bin/sh\nprintf 'data'\n");
      await withPlatform("linux", async () => {
        await withPath(dir, async () => {
          const attachments = await extractVisionAttachments([{ type: "file", url: "clipboard" }] as never[]);
          expect(attachments[0]?.base64).toBeTruthy();
        });
      });

      await writeExecutable(dir, "wl-paste", "#!/bin/sh\nexit 1\n");
      await writeExecutable(dir, "xclip", "#!/bin/sh\nprintf 'fallback'\n");
      await withPlatform("linux", async () => {
        await withPath(dir, async () => {
          const attachments = await extractVisionAttachments([{ type: "file", url: "clipboard" }] as never[]);
          expect(attachments[0]?.base64).toBeTruthy();
        });
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("returns undefined when clipboard helpers fail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-vision-fail-"));
    try {
      await writeExecutable(dir, "wl-paste", "#!/bin/sh\nexit 1\n");
      await writeExecutable(dir, "xclip", "#!/bin/sh\nexit 1\n");
      await withPlatform("linux", async () => {
        await withPath(dir, async () => {
          const attachments = await extractVisionAttachments([{ type: "file", url: "clipboard" }] as never[]);
          expect(attachments.length).toBe(0);
        });
      });

      await withPlatform("win32", async () => {
        const attachments = await extractVisionAttachments([{ type: "file", url: "clipboard" }] as never[]);
        expect(attachments.length).toBe(0);
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
