import type { Config } from "tailwindcss";
import baseConfig from "../control-panel/tailwind.config";

const baseContent = Array.isArray(baseConfig.content)
  ? baseConfig.content
  : baseConfig.content?.files ?? [];

const config: Config = {
  ...baseConfig,
  content: Array.from(
    new Set([
      ...baseContent,
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
      "../control-panel/index.html",
      "../control-panel/src/**/*.{js,ts,jsx,tsx}",
    ])
  ),
};

export default config;
