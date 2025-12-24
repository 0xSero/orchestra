import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import type { Worker } from "@/lib/api";

interface WorkerCardProps {
  worker: Worker;
  selected?: boolean;
  onSelect?: () => void;
  onStop?: () => void;
}

export function WorkerCard({
  worker,
  selected,
  onSelect,
  onStop,
}: WorkerCardProps) {
  const { profile, status, lastActivity, currentTask, error, modelResolution } =
    worker;

  const formatTime = (iso?: string) => {
    if (!iso) return null;
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50",
        selected && "border-primary ring-1 ring-primary/20"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{profile.name}</CardTitle>
            <p className="text-xs text-muted-foreground font-mono">
              {profile.id}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Model */}
        <div className="text-xs">
          <span className="text-muted-foreground">Model: </span>
          <span className="font-mono">
            {modelResolution || profile.model}
          </span>
        </div>

        {/* Capabilities */}
        <div className="flex gap-1.5">
          {profile.supportsVision && (
            <Badge variant="outline" className="text-xs">
              Vision
            </Badge>
          )}
          {profile.supportsWeb && (
            <Badge variant="outline" className="text-xs">
              Web
            </Badge>
          )}
        </div>

        {/* Current Task */}
        {currentTask && (
          <p className="text-xs text-muted-foreground truncate">
            {currentTask}
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive truncate">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {lastActivity && `Last: ${formatTime(lastActivity)}`}
          </span>
          {status !== "stopped" && onStop && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
            >
              Stop
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
