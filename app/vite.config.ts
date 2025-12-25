import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      // Proxy API requests to OpenCode server (dev only)
      "/api": {
        target: "http://localhost:4080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
