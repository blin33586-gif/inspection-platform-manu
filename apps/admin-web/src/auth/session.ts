import { canManagePlatform, type ProjectRole, type SessionProject } from "./project-access";

const tokenKey = "xunjianbao_token";
const userKey = "xunjianbao_user";
const projectKey = "xunjianbao_project";

export interface SessionUser {
  username: string;
  name: string;
  role: ProjectRole;
  projectIds: string[];
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.username === "string" &&
    user.username.length > 0 &&
    typeof user.name === "string" &&
    user.name.length > 0 &&
    (user.role === "platform_admin" || user.role === "member") &&
    Array.isArray(user.projectIds) &&
    user.projectIds.every((projectId) => typeof projectId === "string")
  );
}

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(userKey);
  if (!raw) {
    if (getToken() || localStorage.getItem(projectKey)) clearSession();
    return null;
  }

  try {
    const user: unknown = JSON.parse(raw);
    if (isSessionUser(user)) return user;
  } catch {
    // Invalid persisted sessions are cleared below.
  }

  clearSession();
  return null;
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify(user));
}

export function getCurrentProject(): SessionProject | null {
  const raw = localStorage.getItem(projectKey);
  if (!raw) return null;
  try {
    const project = JSON.parse(raw) as SessionProject;
    const user = getUser();
    return user && (canManagePlatform(user.role) || user.projectIds.includes(project.id)) ? project : null;
  } catch {
    return null;
  }
}

export function saveCurrentProject(project: SessionProject) {
  const user = getUser();
  if (!user || (!canManagePlatform(user.role) && !user.projectIds.includes(project.id))) return false;
  localStorage.setItem(projectKey, JSON.stringify(project));
  return true;
}

export function clearCurrentProject() {
  localStorage.removeItem(projectKey);
}

export function clearSession() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  clearCurrentProject();
}
