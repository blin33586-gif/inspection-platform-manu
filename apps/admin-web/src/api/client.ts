import type { ApiResponse } from "@xunjianbao/shared";
import { getToken } from "../auth/session";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3010/api/v1";

export function getApiUrl(path: string) {
  const token = getToken();
  const url = new URL(`${apiBaseUrl}${path}`, window.location.origin);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function withQuery(path: string, query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export async function getApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    signal,
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

export async function postFormApi<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

export async function patchJsonApi<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

export async function postJsonApi<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
