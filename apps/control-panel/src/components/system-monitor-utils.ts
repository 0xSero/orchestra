export type ProcessType = "opencode-serve" | "opencode-main" | "vite" | "bun" | "other";

export const PROCESS_FILTERS = ["all", "opencode-serve", "opencode-main", "vite", "bun", "other"] as const;

export const getTypeLabel = (type: string) => {
  switch (type) {
    case "opencode-serve":
      return "Server";
    case "opencode-main":
      return "Main";
    case "vite":
      return "Vite";
    case "bun":
      return "Bun";
    default:
      return "Other";
  }
};

export const getTypeBadgeClass = (type: string) => {
  switch (type) {
    case "opencode-serve":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "opencode-main":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
    case "vite":
      return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
    case "bun":
      return "bg-pink-500/15 text-pink-600 dark:text-pink-400";
    default:
      return "bg-muted text-muted-foreground";
  }
};
