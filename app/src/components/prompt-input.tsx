/**
 * PromptInput - Clean, minimal input
 *
 * Simple textarea with optional file picker.
 * Attachments via picker, drag-drop, or paste.
 */

import { type Component, createSignal, For, onCleanup, Show } from "solid-js";

export interface Attachment {
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
  allowFilePicker?: boolean;
}

export const PromptInput: Component<PromptInputProps> = (props) => {
  const [message, setMessage] = createSignal("");
  const [attachments, setAttachments] = createSignal<Attachment[]>([]);
  let textareaRef: HTMLTextAreaElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;

  const releaseAttachments = (items: Attachment[]) => {
    for (const item of items) {
      if (item.url) URL.revokeObjectURL(item.url);
    }
  };

  const handleSubmit = async () => {
    const text = message().trim();
    if (!text && attachments().length === 0) return;
    if (props.isLoading) return;

    try {
      await props.onSubmit(text, attachments());
      setMessage("");
      releaseAttachments(attachments());
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
    if (props.disabled || props.isLoading) return;
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
    if (props.disabled || props.isLoading) return;
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

  const handleFilePick = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      addFile(file);
    }
    input.value = "";
  };

  const openFilePicker = () => {
    if (props.disabled || props.isLoading) return;
    fileInputRef?.click();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  onCleanup(() => {
    releaseAttachments(attachments());
  });

  return (
    <div class="border-t border-border bg-card p-3" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Attachments */}
      <Show when={attachments().length > 0}>
        <div class="flex flex-wrap gap-2 mb-2">
          <For each={attachments()}>
            {(a) => (
              <div class="flex items-center gap-2 px-2 py-1 bg-secondary rounded text-xs">
                <span class="truncate max-w-[120px]">{a.name}</span>
                <span class="text-muted-foreground">{formatSize(a.size)}</span>
                <button class="text-muted-foreground hover:text-foreground" onClick={() => removeAttachment(a.id)}>
                  x
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Input row */}
      <div class="flex items-end gap-2">
        <Show when={props.allowFilePicker}>
          <button class="btn btn-ghost btn-icon" onClick={openFilePicker} title="Attach file">
            <AttachmentIcon />
          </button>
          <input ref={fileInputRef} type="file" multiple class="hidden" onChange={handleFilePick} />
        </Show>
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
      <p class="text-xs text-muted-foreground mt-2">Enter to send · Shift+Enter for newline · Paste or drop files</p>
    </div>
  );
};

const AttachmentIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21.44 11.05l-8.49 8.49a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78" />
  </svg>
);
