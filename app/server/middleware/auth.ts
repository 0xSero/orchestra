import { createMiddleware } from "hono/factory";

// Auth disabled for local development
export function getToken() {
  return "disabled";
}

export const authMiddleware = createMiddleware(async (_, next) => {
  return next();
});
