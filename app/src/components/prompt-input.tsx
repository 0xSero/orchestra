/**
 * PromptInput - Modern pill-shaped input with toolbar
 *
 * Matches the reference design with icons and rounded styling.
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
    <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Attachments */}
      <Show when={attachments().length > 0}>
        <div class="flex flex-wrap gap-2 mb-3">
          <For each={attachments()}>
            {(a) => (
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted/60 rounded-full text-xs border border-border/50">
                <span class="truncate max-w-[120px]">{a.name}</span>
                <span class="text-muted-foreground">{formatSize(a.size)}</span>
                <button
                  class="text-muted-foreground hover:text-foreground ml-1"
                  onClick={() => removeAttachment(a.id)}
                >
                  <XIcon />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Main input container - pill shape */}
      <div class="relative rounded-2xl border border-border/60 bg-muted/30 focus-within:border-primary/50 transition-colors">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={props.placeholder ?? "Message..."}
          disabled={props.disabled || props.isLoading}
          rows={1}
          class="w-full bg-transparent px-4 pt-3 pb-12 resize-none min-h-[52px] max-h-[160px] text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />

        {/* Bottom toolbar */}
        <div class="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-2">
          {/* Left icons */}
          <div class="flex items-center gap-1">
            <Show when={props.allowFilePicker}>
              <button
                class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={openFilePicker}
                title="Attach file"
              >
                <AttachmentIcon />
              </button>
              <input ref={fileInputRef} type="file" multiple class="hidden" onChange={handleFilePick} />
            </Show>
            <button
              class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Add image"
            >
              <ImageIcon />
            </button>

            <div class="w-px h-4 bg-border/60 mx-1" />

            <button
              class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1 text-xs"
              title="Tools"
            >
              <GlobeIcon />
              <span class="hidden sm:inline">Tools</span>
            </button>
            <button
              class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1 text-xs"
              title="Preview"
            >
              <CodeIcon />
              <span class="hidden sm:inline">Preview</span>
            </button>
          </div>

          {/* Right - send button */}
          <Show
            when={props.isLoading}
            fallback={
              <button
                class="p-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSubmit}
                disabled={props.disabled || (!message().trim() && attachments().length === 0)}
                title="Send message"
              >
                <SendIcon />
              </button>
            }
          >
            <button
              class="px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors text-sm font-medium"
              onClick={props.onCancel}
            >
              Stop
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

// Icons
const AttachmentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.44 11.05l-8.49 8.49a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78" />
  </svg>
);

const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const CodeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
