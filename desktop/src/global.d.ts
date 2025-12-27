export {};

declare global {
  interface Window {
    __OPENCODE__?: {
      updaterEnabled?: boolean;
      port?: number | null;
      skillsPort?: number | null;
      baseUrl?: string | null;
      skillsBase?: string | null;
    };
  }
}
