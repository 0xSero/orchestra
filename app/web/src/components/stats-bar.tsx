import { Card, CardContent } from "@/components/ui/card";
import { useWorkers, useJobs } from "@/hooks/use-workers";

export function StatsBar() {
  const workers = useWorkers();
  const jobs = useJobs();

  const stats = {
    total: workers.length,
    active: workers.filter((w) => w.status === "ready" || w.status === "busy").length,
    busy: workers.filter((w) => w.status === "busy").length,
    errors: workers.filter((w) => w.status === "error").length,
    runningJobs: jobs.filter((j) => j.status === "running").length,
  };

  const items = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Active", value: stats.active, color: "text-green-600 dark:text-green-400" },
    { label: "Busy", value: stats.busy, color: "text-amber-600 dark:text-amber-400" },
    { label: "Errors", value: stats.errors, color: "text-red-600 dark:text-red-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`text-2xl font-semibold ${item.color}`}>
              {item.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
