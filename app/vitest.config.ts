import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
  },
});
