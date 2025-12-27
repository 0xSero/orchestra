import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSkills } from "@/context/skills";
import { SkillCard } from "./skill-card";
import { SkillCreateDialog } from "./skill-create-dialog";

const PlusIcon = () => (
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
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

export function SkillList() {
  const { skills, isLoading, selectedSkillId, selectSkill, openCreateDialog, closeCreateDialog, createDialogOpen } =
    useSkills();
  const [search, setSearch] = createSignal("");

  const filteredSkills = createMemo(() => {
    const list = skills();
    const query = search().trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (skill) => skill.id.toLowerCase().includes(query) || skill.frontmatter.description.toLowerCase().includes(query),
    );
  });

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 class="font-semibold text-foreground">Recipes</h2>
          <p class="text-xs text-muted-foreground">{skills().length} total</p>
        </div>
        <Button variant="ghost" size="sm" class="h-8" onClick={openCreateDialog}>
          <PlusIcon />
          New
        </Button>
      </div>

      <div class="p-3 border-b border-border">
        <Input placeholder="Search recipes..." value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
      </div>

      <ScrollArea class="flex-1">
        <div class="p-3 space-y-2">
          <Show when={!isLoading()} fallback={<div class="text-xs text-muted-foreground">Loading...</div>}>
            <Show
              when={filteredSkills().length > 0}
              fallback={<div class="text-xs text-muted-foreground">No recipes</div>}
            >
              <For each={filteredSkills()}>
                {(skill) => (
                  <SkillCard
                    skill={skill}
                    selected={selectedSkillId() === skill.id}
                    onClick={() => selectSkill(skill.id)}
                  />
                )}
              </For>
            </Show>
          </Show>
        </div>
      </ScrollArea>

      <SkillCreateDialog open={createDialogOpen()} onClose={closeCreateDialog} />
    </div>
  );
}
