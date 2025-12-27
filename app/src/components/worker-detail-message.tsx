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

/** Render a single chat message with markdown and attachments. */
export const WorkerMessage: Component<WorkerMessageProps> = (props) => {
  const display = createMemo(() => getMessageDisplay(props.message, props.getMessageParts));
  const content = createMemo(() => {
    const { text, files } = display();
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
