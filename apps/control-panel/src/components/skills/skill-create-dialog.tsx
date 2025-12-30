import { createSignal, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { useAgents } from "@/context/agents";
import { ModelSelector } from "./fields/model-selector";

export function AgentCreateDialog(props: { open: boolean; onClose: () => void }) {
  const { createAgent, selectAgent } = useAgents();
  const [id, setId] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [model, setModel] = createSignal("auto");
  const [prompt, setPrompt] = createSignal("");
  const [scope, setScope] = createSignal<"project" | "global">("project");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const reset = () => {
    setId("");
    setDescription("");
    setModel("auto");
    setPrompt("");
    setScope("project");
    setError(null);
  };

  const handleCreate = async () => {
    if (!id().trim()) {
      setError("Agent ID is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createAgent(
        {
          id: id().trim(),
          frontmatter: {
            description: description().trim() || "Custom agent",
            model: model(),
          },
          systemPrompt: prompt(),
        },
        scope(),
      );
      selectAgent(created.id);
      reset();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
          <DialogDescription>Create a new agent profile.</DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-xs font-medium text-muted-foreground">Agent ID</label>
            <Input
              placeholder="coder"
              value={id()}
              onInput={(e) => setId(e.currentTarget.value.toLowerCase().replace(/\s+/g, "-"))}
            />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
          </div>

          <div class="space-y-2">
            <ModelSelector value={model()} onChange={setModel} />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-medium text-muted-foreground">System Prompt</label>
            <Textarea rows={6} value={prompt()} onInput={(e) => setPrompt(e.currentTarget.value)} />
          </div>

          <div class="space-y-2">
            <label class="text-xs font-medium text-muted-foreground">Scope</label>
            <div class="flex gap-2">
              <Button
                variant={scope() === "project" ? "default" : "outline"}
                onClick={() => setScope("project")}
                type="button"
              >
                Project
              </Button>
              <Button
                variant={scope() === "global" ? "default" : "outline"}
                onClick={() => setScope("global")}
                type="button"
              >
                Global
              </Button>
            </div>
          </div>

          <Show when={error()}>
            <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error()}
            </div>
          </Show>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              props.onClose();
            }}
            disabled={saving()}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving()}>
            {saving() ? "Creating..." : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
