import { Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SkillDeleteDialog(props: {
  open: boolean;
  skillId: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Recipe</DialogTitle>
          <DialogDescription>
            This will remove "{props.skillId}" from its scope. Built-in recipes cannot be deleted.
          </DialogDescription>
        </DialogHeader>

        <Show when={props.error}>
          <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {props.error}
          </div>
        </Show>

        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={props.busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
