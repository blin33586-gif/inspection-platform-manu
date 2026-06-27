const tokenKey = "xunjianbao_token";
const userKey = "xunjianbao_user";

export interface SessionUser {
  username: string;
  name: string;
  role: string;
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

export function clearSession() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
}
