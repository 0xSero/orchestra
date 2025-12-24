import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { authMiddleware, getToken } from "./middleware/auth";
import { workerRoutes } from "./routes/workers";
import { jobRoutes } from "./routes/jobs";
import { streamRoutes } from "./routes/stream";
import { chatRoutes } from "./routes/chat";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    credentials: true,
  })
);

// Health check (no auth)
app.get("/health", (c) =>
  c.json({
    ok: true,
    timestamp: Date.now(),
    version: "0.3.0",
  })
);

// API routes (with auth)
app.use("/api/*", authMiddleware);
app.route("/api/workers", workerRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/stream", streamRoutes);
app.route("/api/chat", chatRoutes);

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/web" }));

  // SPA fallback
  app.get("*", async (c) => {
    const file = Bun.file("./dist/web/index.html");
    return new Response(await file.text(), {
      headers: { "Content-Type": "text/html" },
    });
  });
}

// Server config
const PORT = parseInt(process.env.CONTROL_PANEL_PORT || "3000");

Bun.serve({
  hostname: "0.0.0.0",
  port: PORT,
  fetch: app.fetch,
});

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          Open Orchestra Control Panel v0.3.0                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Local:     http://localhost:${PORT}                              ║
╚═══════════════════════════════════════════════════════════════╝
`);
