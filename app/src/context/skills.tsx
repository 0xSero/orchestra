import {
  createContext,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  type ParentComponent,
  useContext,
} from "solid-js";
import { getSkillsApiBase } from "@/lib/opencode-base";
import type { Skill, SkillEvent, SkillInput, SkillScope } from "@/types/skill";

interface SkillsContextValue {
  skills: () => Skill[];
  isLoading: () => boolean;
  selectedSkillId: () => string | null;
  createDialogOpen: () => boolean;

  builtinSkills: () => Skill[];
  customSkills: () => Skill[];

  refresh: () => Promise<void>;
  selectSkill: (id: string | null) => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  createSkill: (input: SkillInput, scope: SkillScope) => Promise<Skill>;
  updateSkill: (id: string, updates: Partial<SkillInput>, scope: SkillScope) => Promise<Skill>;
  deleteSkill: (id: string, scope: SkillScope) => Promise<boolean>;
  duplicateSkill: (sourceId: string, newId: string, scope: SkillScope) => Promise<Skill>;
}

const SkillsContext = createContext<SkillsContextValue>();

export const SkillsProvider: ParentComponent<{ baseUrl?: string }> = (props) => {
  const apiBase = getSkillsApiBase(props.baseUrl);

  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [createOpen, setCreateOpen] = createSignal(false);

  const fetchSkills = async () => {
    const res = await fetch(`${apiBase}/api/skills`);
    if (!res.ok) throw new Error("Failed to load skills");
    return (await res.json()) as Skill[];
  };

  const [skills, { refetch }] = createResource(fetchSkills);

  createEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`${apiBase}/api/skills/events`);
    const handleEvent = (_evt: MessageEvent) => {
      void refetch();
    };
    source.addEventListener("skill.created", handleEvent);
    source.addEventListener("skill.updated", handleEvent);
    source.addEventListener("skill.deleted", handleEvent);
    source.onmessage = (evt) => {
      if (!evt?.data) return;
      try {
        const parsed = JSON.parse(evt.data) as SkillEvent;
        if (parsed?.type?.startsWith("skill.")) {
          void refetch();
        }
      } catch {
        // ignore malformed events
      }
    };
    onCleanup(() => {
      source.close();
    });
  });

  const createSkill = async (input: SkillInput, scope: SkillScope) => {
    const res = await fetch(`${apiBase}/api/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, scope }),
    });
    if (!res.ok) throw new Error("Failed to create skill");
    const skill = (await res.json()) as Skill;
    await refetch();
    return skill;
  };

  const updateSkill = async (id: string, updates: Partial<SkillInput>, scope: SkillScope) => {
    const res = await fetch(`${apiBase}/api/skills/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, scope }),
    });
    if (!res.ok) throw new Error("Failed to update skill");
    const skill = (await res.json()) as Skill;
    await refetch();
    return skill;
  };

  const deleteSkill = async (id: string, scope: SkillScope) => {
    const res = await fetch(`${apiBase}/api/skills/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    if (!res.ok) throw new Error("Failed to delete skill");
    await refetch();
    if (selectedId() === id) setSelectedId(null);
    return true;
  };

  const duplicateSkill = async (sourceId: string, newId: string, scope: SkillScope) => {
    const res = await fetch(`${apiBase}/api/skills/${sourceId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId, scope }),
    });
    if (!res.ok) throw new Error("Failed to duplicate skill");
    const skill = (await res.json()) as Skill;
    await refetch();
    return skill;
  };

  const value: SkillsContextValue = {
    skills: () => skills() ?? [],
    isLoading: () => skills.loading,
    selectedSkillId: selectedId,
    createDialogOpen: createOpen,

    builtinSkills: () => (skills() ?? []).filter((s) => s.source.type === "builtin"),
    customSkills: () => (skills() ?? []).filter((s) => s.source.type !== "builtin"),

    refresh: async () => {
      await refetch();
    },
    selectSkill: setSelectedId,
    openCreateDialog: () => setCreateOpen(true),
    closeCreateDialog: () => setCreateOpen(false),
    createSkill,
    updateSkill,
    deleteSkill,
    duplicateSkill,
  };

  return <SkillsContext.Provider value={value}>{props.children}</SkillsContext.Provider>;
};

export function useSkills(): SkillsContextValue {
  const ctx = useContext(SkillsContext);
  if (!ctx) throw new Error("useSkills must be used within a SkillsProvider");
  return ctx;
}
