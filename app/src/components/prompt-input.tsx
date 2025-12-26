/**
 * PromptInput - Clean, minimal input
 *
 * No attachment buttons cluttering the view. Simple textarea.
 * Attachments via drag-drop or paste only.
 */

import { type Component, createSignal, Show, For } from "solid-js";

interface Attachment {
  id: string;
  type: "file" | "image";
  name: string;
  size: number;
  url?: string;
  file?: File;
}

interface PromptInputProps {
  onSubmit: (message: string, attachments: Attachment[]) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export const PromptInput: Component<PromptInputProps> = (props) => {
  const [message, setMessage] = createSignal("");
  const [attachments, setAttachments] = createSignal<Attachment[]>([]);
  let textareaRef: HTMLTextAreaElement | undefined;

  const handleSubmit = async () => {
    const text = message().trim();
    if (!text && attachments().length === 0) return;
    if (props.isLoading) return;

    try {
      await props.onSubmit(text, attachments());
      setMessage("");
      setAttachments([]);
      if (textareaRef) {
        textareaRef.style.height = "auto";
      }
    } catch (err) {
      console.error("Failed to submit:", err);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: Event) => {
    const textarea = e.target as HTMLTextAreaElement;
    setMessage(textarea.value);
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          addFile(file);
        }
      }
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;

    for (const file of files) {
      addFile(file);
    }
  };

  const addFile = (file: File) => {
    const attachment: Attachment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: file.type.startsWith("image/") ? "image" : "file",
      name: file.name,
      size: file.size,
      file,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    };
    setAttachments((prev) => [...prev, attachment]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.url) URL.revokeObjectURL(a.url);
      return prev.filter((x) => x.id !== id);
    });
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div
      class="border-t border-border bg-card p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Attachments */}
      <Show when={attachments().length > 0}>
        <div class="flex flex-wrap gap-2 mb-2">
          <For each={attachments()}>
            {(a) => (
              <div class="flex items-center gap-2 px-2 py-1 bg-secondary rounded text-xs">
                <span class="truncate max-w-[120px]">{a.name}</span>
                <span class="text-muted-foreground">{formatSize(a.size)}</span>
                <button
                  class="text-muted-foreground hover:text-foreground"
                  onClick={() => removeAttachment(a.id)}
                >
                  x
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Input row */}
      <div class="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={message()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={props.placeholder ?? "Type a message..."}
          disabled={props.disabled || props.isLoading}
          rows={1}
          class="input flex-1 resize-none min-h-[40px] max-h-[160px] py-2"
        />

        <Show
          when={props.isLoading}
          fallback={
            <button
              class="btn btn-primary h-[40px] px-4"
              onClick={handleSubmit}
              disabled={props.disabled || (!message().trim() && attachments().length === 0)}
            >
              Send
            </button>
          }
        >
          <button class="btn btn-danger h-[40px] px-4" onClick={props.onCancel}>
            Stop
          </button>
        </Show>
      </div>

      {/* Hint */}
      <p class="text-xs text-muted-foreground mt-2">
        Enter to send · Shift+Enter for newline · Paste or drop files
      </p>
    </div>
  );
};
