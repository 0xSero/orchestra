import { Hono } from "hono";
import { workerJobs } from "@orchestrator/core/jobs";

export const jobRoutes = new Hono();

// GET /api/jobs - List all jobs
jobRoutes.get("/", (c) => {
  const workerId = c.req.query("workerId");
  const limit = parseInt(c.req.query("limit") || "50");

  const jobs = workerJobs.list({ workerId, limit });

  const running = jobs.filter((j) => j.status === "running").length;
  const succeeded = jobs.filter((j) => j.status === "succeeded").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return c.json({
    jobs,
    meta: {
      total: jobs.length,
      running,
      succeeded,
      failed,
    },
  });
});

// GET /api/jobs/:id - Get single job
jobRoutes.get("/:id", (c) => {
  const job = workerJobs.get(c.req.param("id"));
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  return c.json(job);
});

// POST /api/jobs/:id/await - Wait for job completion
jobRoutes.post("/:id/await", async (c) => {
  try {
    const { timeoutMs } = await c.req.json().catch(() => ({}));
    const job = await workerJobs.await(c.req.param("id"), {
      timeoutMs: timeoutMs || 600000,
    });
    return c.json(job);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});
