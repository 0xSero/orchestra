import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

interface StatusBadgeProps {
  status: WorkerStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<
    WorkerStatus,
    { variant: "success" | "warning" | "destructive" | "secondary"; label: string; pulse?: boolean }
  > = {
    starting: { variant: "secondary", label: "Starting", pulse: true },
    ready: { variant: "success", label: "Ready" },
    busy: { variant: "warning", label: "Busy", pulse: true },
    error: { variant: "destructive", label: "Error" },
    stopped: { variant: "secondary", label: "Stopped" },
  };

  const { variant, label, pulse } = config[status];

  return (
    <Badge
      variant={variant}
      className={cn(pulse && "animate-pulse-soft", className)}
    >
      {label}
    </Badge>
  );
}
