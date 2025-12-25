/**
 * SpawnDialog Component - Dialog to create a new session
 */

import { type Component, createSignal, Show } from "solid-js";
import { useOpenCode } from "@/context/opencode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Icons
const BotIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

const LoaderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

interface SpawnDialogProps {
  open: boolean;
  onClose: () => void;
  onSessionCreated?: (sessionId: string) => void;
}

export const SpawnDialog: Component<SpawnDialogProps> = (props) => {
  const { createSession } = useOpenCode();
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      const session = await createSession();
      if (session) {
        props.onSessionCreated?.(session.id);
      }
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <BotIcon />
            New Session
          </DialogTitle>
          <DialogDescription>
            Create a new OpenCode session.
          </DialogDescription>
        </DialogHeader>

        <div class="py-4">
          <p class="text-sm text-muted-foreground">
            A new session will be created where you can interact with the AI assistant.
          </p>

          {/* Error */}
          <Show when={error()}>
            <div class="mt-4 p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-sm">
              {error()}
            </div>
          </Show>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            disabled={creating()}
            onClick={handleCreate}
            class="gap-2"
          >
            <Show when={creating()}>
              <LoaderIcon />
            </Show>
            {creating() ? "Creating..." : "Create Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
