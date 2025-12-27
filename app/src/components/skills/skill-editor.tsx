import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useSkills } from "@/context/skills";
import type { ToolPermissions } from "@/types/skill";
import { ModelSelector } from "./fields/model-selector";
import { PermissionsConfig } from "./fields/permissions-config";
import { PromptEditor } from "./fields/prompt-editor";
import { TagsInput } from "./fields/tags-input";
import { TemperatureSlider } from "./fields/temperature-slider";
import { ToolsConfig } from "./fields/tools-config";
import { SkillDeleteDialog } from "./skill-delete-dialog";

export function SkillEditor(props: { skillId: string; onClose: () => void }) {
  const { skills, updateSkill, deleteSkill } = useSkills();

  const skill = createMemo(() => skills().find((s) => s.id === props.skillId));
  const isBuiltin = () => skill()?.source.type === "builtin";

  const [description, setDescription] = createSignal("");
  const [model, setModel] = createSignal("auto");
  const [providerID, setProviderID] = createSignal("");
  const [temperature, setTemperature] = createSignal(0.7);
  const [prompt, setPrompt] = createSignal("");
  const [tools, setTools] = createSignal<Record<string, boolean>>({});
  const [permissions, setPermissions] = createSignal<ToolPermissions>({});
  const [tags, setTags] = createSignal<string[]>([]);
  const [supportsVision, setSupportsVision] = createSignal(false);
  const [supportsWeb, setSupportsWeb] = createSignal(false);
  const [injectRepoContext, setInjectRepoContext] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"basic" | "prompt" | "tools" | "permissions">("basic");
  const [saving, setSaving] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal<string | null>(null);

  createEffect(() => {
    const current = skill();
    if (!current) return;
    setDescription(current.frontmatter.description ?? "");
    setModel(current.frontmatter.model ?? "auto");
    setProviderID(current.frontmatter.providerID ?? "");
    setTemperature(current.frontmatter.temperature ?? 0.7);
    setPrompt(current.systemPrompt ?? "");
    setTools(current.frontmatter.tools ?? {});
    setPermissions(current.frontmatter.permissions ?? {});
    setTags(current.frontmatter.tags ?? []);
    setSupportsVision(Boolean(current.frontmatter.supportsVision));
    setSupportsWeb(Boolean(current.frontmatter.supportsWeb));
    setInjectRepoContext(Boolean(current.frontmatter.injectRepoContext));
  });

  const handleSave = async () => {
    const current = skill();
    if (!current) return;
    setSaving(true);
    const scope =
      current.source.type === "builtin" ? "project" : current.source.type === "global" ? "global" : "project";
    try {
      await updateSkill(
        current.id,
        {
          frontmatter: {
            name: current.id,
            description: description(),
            model: model(),
            providerID: providerID() || undefined,
            temperature: temperature(),
            tools: tools(),
            permissions: permissions(),
            tags: tags(),
            supportsVision: supportsVision(),
            supportsWeb: supportsWeb(),
            injectRepoContext: injectRepoContext(),
          },
          systemPrompt: prompt(),
        },
        scope,
      );
      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const current = skill();
    if (!current) return;
    setDeleteError(null);
    try {
      const scope = current.source.type === "global" ? "global" : "project";
      await deleteSkill(current.id, scope);
      setDeleteOpen(false);
      props.onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete recipe");
    }
  };

  return (
    <Show when={skill()} fallback={<div class="p-6 text-sm text-muted-foreground">Select a profile to edit.</div>}>
      {(current) => (
        <div class="skills-editor">
          <div class="skills-editor-header">
            <div>
              <p class="skills-editor-eyebrow">Agent Profile</p>
              <h2 class="skills-editor-title">{current().id}</h2>
              <p class="skills-editor-subtitle">
                {current().source.type === "builtin" ? "Built-in recipe (override to edit)" : "Custom recipe"}
              </p>
            </div>
            <div class="skills-editor-actions">
              <Show when={!isBuiltin()}>
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              </Show>
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                Close
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving()}>
                {isBuiltin() ? "Create Override" : saving() ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div class="skills-editor-tabs">
            <button
              class={activeTab() === "basic" ? "skills-editor-tab active" : "skills-editor-tab"}
              onClick={() => setActiveTab("basic")}
            >
              Basic
            </button>
            <button
              class={activeTab() === "prompt" ? "skills-editor-tab active" : "skills-editor-tab"}
              onClick={() => setActiveTab("prompt")}
            >
              Prompt
            </button>
            <button
              class={activeTab() === "tools" ? "skills-editor-tab active" : "skills-editor-tab"}
              onClick={() => setActiveTab("tools")}
            >
              Tools
            </button>
            <button
              class={activeTab() === "permissions" ? "skills-editor-tab active" : "skills-editor-tab"}
              onClick={() => setActiveTab("permissions")}
            >
              Permissions
            </button>
          </div>

          <div class="skills-editor-body">
            <Show when={activeTab() === "basic"}>
              <div class="space-y-4">
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground">ID</label>
                  <Input value={current().id} readOnly />
                </div>
                <div class="space-y-2">
                  <label class="text-xs font-medium text-muted-foreground">Description</label>
                  <Textarea rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  <ModelSelector value={model()} onChange={setModel} />
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">Provider ID</span>
                    <Input value={providerID()} onInput={(e) => setProviderID(e.currentTarget.value)} />
                  </label>
                </div>
                <TemperatureSlider value={temperature()} onChange={setTemperature} />
                <TagsInput value={tags()} onChange={setTags} />

                <div class="grid gap-2 md:grid-cols-3">
                  <label class="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={supportsVision()}
                      onChange={() => setSupportsVision(!supportsVision())}
                    />
                    Supports Vision
                  </label>
                  <label class="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={supportsWeb()} onChange={() => setSupportsWeb(!supportsWeb())} />
                    Supports Web
                  </label>
                  <label class="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={injectRepoContext()}
                      onChange={() => setInjectRepoContext(!injectRepoContext())}
                    />
                    Inject Repo Context
                  </label>
                </div>
              </div>
            </Show>

            <Show when={activeTab() === "prompt"}>
              <PromptEditor value={prompt()} onChange={setPrompt} />
            </Show>

            <Show when={activeTab() === "tools"}>
              <ToolsConfig value={tools()} onChange={setTools} />
            </Show>

            <Show when={activeTab() === "permissions"}>
              <PermissionsConfig value={permissions()} onChange={setPermissions} />
            </Show>
          </div>

          <SkillDeleteDialog
            open={deleteOpen()}
            skillId={current().id}
            onClose={() => setDeleteOpen(false)}
            onConfirm={handleDelete}
            error={deleteError()}
          />
        </div>
      )}
    </Show>
  );
}
