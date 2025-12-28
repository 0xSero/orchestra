import { marked } from "marked";
import { type Component, createMemo, For, Show } from "solid-js";
import type { Message, Part } from "@/context/opencode";
import { getMessageDisplay } from "./worker-detail-utils";

marked.setOptions({
  breaks: true,
  gfm: true,
});

interface WorkerMessageProps {
  message: Message;
  getMessageParts: (messageId: string) => Part[];
}

/** Vision analysis loading indicator. */
const VisionAnalyzingIndicator: Component = () => (
  <div class="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 my-3">
    <div class="relative flex h-5 w-5 items-center justify-center">
      <div class="absolute h-5 w-5 animate-ping rounded-full bg-primary/30" />
      <div class="relative h-3 w-3 rounded-full bg-primary animate-pulse" />
    </div>
    <div class="flex flex-col gap-0.5">
      <span class="text-sm font-medium text-primary">Analyzing image...</span>
      <span class="text-xs text-muted-foreground">Vision worker is processing your image</span>
    </div>
  </div>
);

/** Render a single chat message with markdown and attachments. */
export const WorkerMessage: Component<WorkerMessageProps> = (props) => {
  const display = createMemo(() => getMessageDisplay(props.message, props.getMessageParts));

  // Clean content by removing vision placeholder XML when analyzing
  const content = createMemo(() => {
    const { text, files, visionAnalyzing } = display();
    if (visionAnalyzing) {
      // Remove the placeholder XML tags and their content for cleaner display
      const cleaned = text
        .replace(/<pasted_image[^>]*>[\s\S]*?<\/pasted_image>/g, "")
        .replace(/\[VISION ANALYSIS IN PROGRESS\][\s\S]*?Job ID:.*$/gm, "")
        .trim();
      return cleaned || (files.length > 0 ? "" : "");
    }
    return text || (files.length > 0 ? "" : `[${props.message.role} message]`);
  });

  const renderedHtml = createMemo(() => (content() ? marked.parse(content()) : ""));

  return (
    <div class={`message ${props.message.role === "user" ? "message-user" : "message-assistant"} animate-fade-in`}>
      <div class="flex items-center gap-2 mb-2">
        <span
          class={`text-xs font-medium uppercase tracking-wide ${props.message.role === "user" ? "text-primary" : "text-muted-foreground"}`}
        >
          {props.message.role}
        </span>
      </div>

      <Show when={content()}>
        <div class="message-content prose prose-sm prose-invert max-w-none" innerHTML={renderedHtml()} />
      </Show>

      <Show when={display().visionAnalyzing}>
        <VisionAnalyzingIndicator />
      </Show>

      <Show when={display().files.length > 0}>
        <div class="mt-3 grid gap-2">
          <For each={display().files}>
            {(file) => (
              <Show
                when={file.mime?.startsWith("image/")}
                fallback={
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs"
                  >
                    <div class="flex flex-col gap-1">
                      <span class="font-medium text-foreground">{file.filename ?? "Attachment"}</span>
                      <span class="text-[10px] text-muted-foreground">{file.mime}</span>
                    </div>
                    <span class="text-[10px] text-muted-foreground">Open</span>
                  </a>
                }
              >
                <a href={file.url} target="_blank" rel="noopener noreferrer" class="block w-fit">
                  <img
                    src={file.url}
                    alt={file.filename ?? "attachment"}
                    class="max-h-48 rounded-md border border-border/60"
                  />
                </a>
              </Show>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
