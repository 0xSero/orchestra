import { fileURLToPath } from "node:url";

const appTailwindConfig = fileURLToPath(new URL("./tailwind.config.ts", import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: appTailwindConfig },
    autoprefixer: {},
  },
};
