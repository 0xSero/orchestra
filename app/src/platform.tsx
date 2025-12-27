import type { AsyncStorage, SyncStorage } from "@solid-primitives/storage";
import { createContext, type ParentComponent, useContext } from "solid-js";

export type Platform = {
  platform: "web" | "tauri";
  version?: string;
  openLink(url: string): void;
  restart(): Promise<void>;
  openDirectoryPickerDialog?: (opts?: { title?: string; multiple?: boolean }) => Promise<string | string[] | null>;
  openFilePickerDialog?: (opts?: { title?: string; multiple?: boolean }) => Promise<string | string[] | null>;
  saveFilePickerDialog?: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
  storage?: (name?: string) => SyncStorage | AsyncStorage;
  checkUpdate?: () => Promise<{ updateAvailable: boolean; version?: string }>;
  update?: () => Promise<void>;
  fetch?: typeof fetch;
};

const PlatformContext = createContext<Platform>();

export const PlatformProvider: ParentComponent<{ value: Platform }> = (props) => {
  return <PlatformContext.Provider value={props.value}>{props.children}</PlatformContext.Provider>;
};

export const usePlatform = () => {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }
  return ctx;
};
