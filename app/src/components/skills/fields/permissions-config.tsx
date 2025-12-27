import { createMemo } from "solid-js";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ToolPermissions } from "@/types/skill";

const FILESYSTEM_OPTIONS = ["", "full", "read", "none"] as const;
const EXECUTION_OPTIONS = ["", "full", "sandboxed", "none"] as const;
const NETWORK_OPTIONS = ["", "full", "localhost", "none"] as const;

const formatPaths = (paths?: string[]) => (paths ?? []).join("\n");
const parsePaths = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

type PermissionCategory = NonNullable<ToolPermissions["categories"]>;

export function PermissionsConfig(props: { value: ToolPermissions; onChange: (v: ToolPermissions) => void }) {
  const categories = createMemo(() => props.value.categories ?? {});
  const categoryOptions: Record<keyof PermissionCategory, readonly string[]> = {
    filesystem: FILESYSTEM_OPTIONS,
    execution: EXECUTION_OPTIONS,
    network: NETWORK_OPTIONS,
  };

  const updateCategory = (key: keyof PermissionCategory, value: string) => {
    const isValid = categoryOptions[key].includes(value);
    const nextValue = isValid && value ? (value as PermissionCategory[typeof key]) : undefined;
    props.onChange({
      ...props.value,
      categories: {
        ...(props.value.categories ?? {}),
        [key]: nextValue,
      },
    });
  };

  const updatePaths = (key: "allowed" | "denied", value: string) => {
    const parsed = parsePaths(value);
    props.onChange({
      ...props.value,
      paths: {
        ...(props.value.paths ?? {}),
        [key]: parsed.length ? parsed : undefined,
      },
    });
  };

  return (
    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-3">
        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Filesystem</span>
          <select
            class={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            value={categories().filesystem ?? ""}
            onChange={(e) => updateCategory("filesystem", e.currentTarget.value)}
          >
            {FILESYSTEM_OPTIONS.map((option) => (
              <option value={option}>{option || "inherit"}</option>
            ))}
          </select>
        </label>

        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Execution</span>
          <select
            class={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            value={categories().execution ?? ""}
            onChange={(e) => updateCategory("execution", e.currentTarget.value)}
          >
            {EXECUTION_OPTIONS.map((option) => (
              <option value={option}>{option || "inherit"}</option>
            ))}
          </select>
        </label>

        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Network</span>
          <select
            class={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            )}
            value={categories().network ?? ""}
            onChange={(e) => updateCategory("network", e.currentTarget.value)}
          >
            {NETWORK_OPTIONS.map((option) => (
              <option value={option}>{option || "inherit"}</option>
            ))}
          </select>
        </label>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Allowed Paths</span>
          <Textarea
            rows={4}
            value={formatPaths(props.value.paths?.allowed)}
            onInput={(e) => updatePaths("allowed", e.currentTarget.value)}
          />
        </label>

        <label class="flex flex-col gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Denied Paths</span>
          <Textarea
            rows={4}
            value={formatPaths(props.value.paths?.denied)}
            onInput={(e) => updatePaths("denied", e.currentTarget.value)}
          />
        </label>
      </div>
    </div>
  );
}
