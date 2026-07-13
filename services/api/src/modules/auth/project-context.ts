import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthIdentity } from "./auth.service.js";

export interface ProjectRequestContext {
  projectId?: string;
  identity?: AuthIdentity;
}

const storage = new AsyncLocalStorage<ProjectRequestContext>();

export function runWithProjectContext<T>(context: ProjectRequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function currentProjectId() {
  return storage.getStore()?.projectId ?? "quyang";
}

export function currentIdentity() {
  return storage.getStore()?.identity ?? null;
}

export function requireCurrentIdentity() {
  const identity = currentIdentity();
  if (!identity) throw new Error("Authenticated identity is required for business writes");
  return identity;
}

export function currentActorUsername() {
  return requireCurrentIdentity().username;
}
