declare global {
  interface Window {
    __OPENCODE__?: {
      port?: number;
      skillsPort?: number;
      baseUrl?: string;
      skillsBase?: string;
    };
  }
}

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const resolveOpenCodeBase = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const paramUrl = params.get("url");
  if (paramUrl) return paramUrl;
  if (window.__OPENCODE__?.baseUrl) {
    return window.__OPENCODE__.baseUrl;
  }
  if (window.__OPENCODE__?.port) {
    return `http://127.0.0.1:${window.__OPENCODE__.port}`;
  }
  return undefined;
};

export const resolveSkillsBase = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const paramUrl = params.get("skills");
  if (paramUrl) return paramUrl;
  if (window.__OPENCODE__?.skillsBase) {
    return window.__OPENCODE__.skillsBase;
  }
  if (window.__OPENCODE__?.skillsPort) {
    return `http://127.0.0.1:${window.__OPENCODE__.skillsPort}`;
  }
  return undefined;
};

export const getSkillsApiBase = (baseUrl?: string): string => {
  const fallback = import.meta.env.VITE_SKILLS_API_BASE ?? "http://localhost:4097";
  const resolved = baseUrl ?? resolveSkillsBase() ?? fallback;
  return trimTrailingSlash(resolved);
};
