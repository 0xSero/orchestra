import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useJobs } from "@/hooks/use-workers";
import type { Job } from "@/lib/api";

export function JobList() {
  const jobs = useJobs();

  const formatDuration = (ms?: number) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusVariant = (status: Job["status"]) => {
    switch (status) {
      case "running":
        return "warning";
      case "succeeded":
        return "success";
      case "failed":
        return "destructive";
      case "canceled":
        return "secondary";
      default:
        return "secondary";
    }
  };

  if (jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No jobs yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Jobs</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-64">
          <div className="divide-y divide-border">
            {jobs.slice(0, 10).map((job) => (
              <div key={job.id} className="px-6 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{job.message}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {job.workerId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.durationMs && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(job.durationMs)}
                      </span>
                    )}
                    <Badge
                      variant={getStatusVariant(job.status)}
                      className="text-xs"
                    >
                      {job.status}
                    </Badge>
                  </div>
                </div>
                {job.error && (
                  <p className="mt-1 text-xs text-destructive truncate">
                    {job.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
