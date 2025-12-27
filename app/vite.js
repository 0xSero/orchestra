import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";

const appSrc = fileURLToPath(new URL("./src", import.meta.url));
const postcssConfig = fileURLToPath(new URL("./postcss.config.js", import.meta.url));

export default [
  {
    name: "opencode-app:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": appSrc,
          },
        },
        css: {
          postcss: postcssConfig,
        },
      };
    },
  },
  solid(),
];
