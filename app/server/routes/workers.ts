import { Hono } from "hono";
import { workerPool } from "@orchestrator/core/worker-pool";
import { spawnWorker, stopWorker, sendToWorker } from "@orchestrator/workers/spawner";
import { builtInProfiles, getProfile } from "@orchestrator/config/profiles";

export const workerRoutes = new Hono();

// GET /api/workers - List all workers
workerRoutes.get("/", (c) => {
  const workers = workerPool.toJSON();
  return c.json({
    workers,
    meta: {
      total: workers.length,
      active: workerPool.getActiveWorkers().length,
      timestamp: Date.now(),
    },
  });
});

// GET /api/workers/profiles - List available profiles
workerRoutes.get("/profiles", (c) => {
  return c.json({ profiles: builtInProfiles });
});

// GET /api/workers/:id - Get single worker
workerRoutes.get("/:id", (c) => {
  const worker = workerPool.get(c.req.param("id"));
  if (!worker) {
    return c.json({ error: "Worker not found" }, 404);
  }
  return c.json(worker);
});

// POST /api/workers - Spawn a worker
workerRoutes.post("/", async (c) => {
  try {
    const { profileId, options } = await c.req.json();

    const profile = getProfile(profileId, builtInProfiles);

    if (!profile) {
      return c.json({ error: `Profile '${profileId}' not found` }, 400);
    }

    const instance = await spawnWorker(profile, options || {});
    return c.json(instance, 201);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// DELETE /api/workers/:id - Stop a worker
workerRoutes.delete("/:id", async (c) => {
  try {
    const result = await stopWorker(c.req.param("id"));
    return c.json({ success: result });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// POST /api/workers/:id/message - Send message to worker (sync)
workerRoutes.post("/:id/message", async (c) => {
  try {
    const workerId = c.req.param("id");
    const { content, attachments, timeout } = await c.req.json();

    const worker = workerPool.get(workerId);
    if (!worker) {
      return c.json({ error: "Worker not found" }, 404);
    }

    const result = await sendToWorker(workerId, content, {
      attachments,
      timeout: timeout || 120000,
    });

    return c.json(result);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});
