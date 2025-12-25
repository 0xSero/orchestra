/**
 * SDK Context - Provides SupervisorClient to all components
 */

import { createContext, useContext, type ParentComponent } from "solid-js";
import { createSupervisorClient, type SupervisorClient } from "@/lib/supervisor-sdk";

interface SDKContextValue {
  client: SupervisorClient;
  baseUrl: string;
}

const SDKContext = createContext<SDKContextValue>();

export const SDKProvider: ParentComponent<{ baseUrl?: string }> = (props) => {
  // Default to /api which is proxied to supervisor in dev
  const baseUrl = props.baseUrl ?? "/api";
  const client = createSupervisorClient({ baseUrl });

  return (
    <SDKContext.Provider value={{ client, baseUrl }}>
      {props.children}
    </SDKContext.Provider>
  );
};

export function useSDK(): SDKContextValue {
  const ctx = useContext(SDKContext);
  if (!ctx) {
    throw new Error("useSDK must be used within an SDKProvider");
  }
  return ctx;
}
