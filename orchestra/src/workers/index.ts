export { createWorkerManager } from "./manager";
export { builtInProfiles, getProfile, getAllProfiles } from "./profiles";
export { createSessionManager, WorkerSessionManager } from "./session-manager";
export { startEventForwarding, stopEventForwarding } from "./event-forwarding";
export type { WorkerManager, WorkerManagerConfig, WorkerManagerDeps } from "./manager";
export type { TrackedSession, SessionActivity, SessionManagerEvent } from "./session-manager";
export type { EventForwardingHandle, EventForwardingConfig } from "./event-forwarding";
