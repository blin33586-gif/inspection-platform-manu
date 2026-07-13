import type { ProjectRole, SessionProject } from "./project-access";

const tokenKey = "xunjianbao_token";
const userKey = "xunjianbao_user";
const projectKey = "xunjianbao_project";

export interface SessionUser {
  username: string;
  name: string;
  role: ProjectRole;
  projectIds: string[];
}

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(userKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
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
    return getUser()?.projectIds.includes(project.id) ? project : null;
  } catch {
    return null;
  }
}

export function saveCurrentProject(project: SessionProject) {
  if (!getUser()?.projectIds.includes(project.id)) return false;
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
