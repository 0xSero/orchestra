import { useState } from "react";
import { WorkerCard } from "@/components/worker-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkers, useWorkerActions } from "@/hooks/use-workers";
import { useWorkersStore } from "@/stores/workers";
import { api, type Profile } from "@/lib/api";

export function WorkerGrid() {
  const workers = useWorkers();
  const selectedId = useWorkersStore((s) => s.selectedId);
  const { selectWorker, spawnWorker, stopWorker } = useWorkerActions();

  const [spawnOpen, setSpawnOpen] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [spawning, setSpawning] = useState<string | null>(null);

  const handleOpenSpawn = async () => {
    setSpawnOpen(true);
    try {
      const data = await api.workers.profiles();
      setProfiles(data.profiles);
    } catch (e) {
      console.error("Failed to load profiles:", e);
    }
  };

  const handleSpawn = async (profileId: string) => {
    setSpawning(profileId);
    try {
      await spawnWorker(profileId);
      setSpawnOpen(false);
    } catch (e) {
      console.error("Failed to spawn worker:", e);
    } finally {
      setSpawning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Workers</h2>
        <Button onClick={handleOpenSpawn}>Spawn Worker</Button>
      </div>

      {workers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">No workers running</p>
          <Button variant="secondary" className="mt-4" onClick={handleOpenSpawn}>
            Spawn your first worker
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <WorkerCard
              key={worker.profile.id}
              worker={worker}
              selected={selectedId === worker.profile.id}
              onSelect={() => selectWorker(worker.profile.id)}
              onStop={() => stopWorker(worker.profile.id)}
            />
          ))}
        </div>
      )}

      {/* Spawn Dialog */}
      <Dialog open={spawnOpen} onOpenChange={setSpawnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spawn Worker</DialogTitle>
            <DialogDescription>
              Choose a worker profile to spawn
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-80">
            <div className="space-y-2 pr-4">
              {Object.values(profiles).map((profile) => (
                <button
                  key={profile.id}
                  className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                  onClick={() => handleSpawn(profile.id)}
                  disabled={spawning === profile.id}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{profile.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {profile.id}
                      </p>
                    </div>
                    {spawning === profile.id && (
                      <span className="text-xs text-muted-foreground animate-pulse-soft">
                        Spawning...
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {profile.purpose}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSpawnOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
