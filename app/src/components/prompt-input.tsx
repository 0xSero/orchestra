/**
 * PromptInput Component - Rich prompt input with attachments
 */

import { type Component, createSignal, Show, For } from "solid-js";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn, formatShortcut } from "@/lib/utils";

// Icons
const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const PaperclipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
);

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
  const [isFocused, setIsFocused] = createSignal(false);
  let textareaRef: HTMLTextAreaElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let imageInputRef: HTMLInputElement | undefined;

  const handleSubmit = async () => {
    const text = message().trim();
    if (!text && attachments().length === 0) return;
    if (props.isLoading) return;

    try {
      await props.onSubmit(text, attachments());
      setMessage("");
      setAttachments([]);
    } catch (err) {
      console.error("Failed to submit:", err);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Submit on Enter (without shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      newAttachments.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: file.type.startsWith("image/") ? "image" : "file",
        name: file.name,
        size: file.size,
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    input.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.url) {
        URL.revokeObjectURL(attachment.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Auto-resize textarea
  const handleInput = (e: Event) => {
    const textarea = e.target as HTMLTextAreaElement;
    setMessage(textarea.value);

    // Reset height to recalculate
    textarea.style.height = "auto";
    // Set new height (max 200px)
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  return (
    <div class="border-t border-border bg-card p-4">
      {/* Attachments preview */}
      <Show when={attachments().length > 0}>
        <div class="flex flex-wrap gap-2 mb-3">
          <For each={attachments()}>
            {(attachment) => (
              <div
                class={cn(
                  "relative group flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background",
                  attachment.type === "image" && "p-1"
                )}
              >
                {attachment.type === "image" && attachment.url ? (
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    class="h-16 w-16 object-cover rounded"
                  />
                ) : (
                  <>
                    <PaperclipIcon />
                    <div class="text-sm">
                      <p class="text-foreground truncate max-w-[150px]">{attachment.name}</p>
                      <p class="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                    </div>
                  </>
                )}
                <button
                  class="absolute -top-2 -right-2 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <XIcon />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Input area */}
      <div
        class={cn(
          "flex items-end gap-2 rounded-lg border bg-background transition-colors",
          isFocused() ? "border-ring ring-2 ring-ring/20" : "border-border",
          props.disabled && "opacity-50"
        )}
      >
        {/* Attachment buttons */}
        <div class="flex items-center p-2 gap-1">
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onClick={() => fileInputRef?.click()}
              disabled={props.disabled}
            >
              <PaperclipIcon />
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onClick={() => imageInputRef?.click()}
              disabled={props.disabled}
            >
              <ImageIcon />
            </TooltipTrigger>
            <TooltipContent>Attach image</TooltipContent>
          </Tooltip>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          class="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={props.placeholder ?? "Send a message..."}
          disabled={props.disabled}
          rows={1}
          class={cn(
            "flex-1 py-3 pr-2 bg-transparent text-foreground placeholder:text-muted-foreground resize-none",
            "focus:outline-none",
            "min-h-[44px] max-h-[200px]"
          )}
        />

        {/* Submit/Cancel button */}
        <div class="p-2">
          <Show
            when={props.isLoading}
            fallback={
              <Tooltip>
                <TooltipTrigger
                  as={Button}
                  variant={message().trim() || attachments().length > 0 ? "default" : "ghost"}
                  size="icon"
                  class="h-9 w-9"
                  onClick={handleSubmit}
                  disabled={props.disabled || (!message().trim() && attachments().length === 0)}
                >
                  <SendIcon />
                </TooltipTrigger>
                <TooltipContent>
                  Send ({formatShortcut("Enter")})
                </TooltipContent>
              </Tooltip>
            }
          >
            <Tooltip>
              <TooltipTrigger
                as={Button}
                variant="destructive"
                size="icon"
                class="h-9 w-9"
                onClick={props.onCancel}
              >
                <StopIcon />
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
          </Show>
        </div>
      </div>

      {/* Keyboard hint */}
      <div class="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <span>
          Press <kbd class="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono">Enter</kbd> to send,{" "}
          <kbd class="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono">Shift + Enter</kbd> for new line
        </span>
      </div>
    </div>
  );
};
