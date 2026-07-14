import type { ApiResponse } from "@xunjianbao/shared";
import { ApiClientError } from "./api-client-error";
import { buildApiUrl } from "./api-url";
import { getCurrentProject, getToken } from "../auth/session";
import { buildAuthenticatedHeaders, saveResponseAsDownload } from "./file-download";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3010/api/v1";

export function getApiUrl(path: string) {
  return buildApiUrl(
    apiBaseUrl,
    path,
    window.location.origin,
    getToken() ?? undefined,
    getCurrentProject()?.id,
  );
}

export function getPublicApiUrl(path: string) {
  return buildApiUrl(apiBaseUrl, path, window.location.origin);
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
  if (!response.ok) throw await parseApiError(response);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

export async function downloadApiFile(path: string, fallbackFileName: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: authHeaders() });
  if (!response.ok) throw await parseApiError(response);

  await saveResponseAsDownload(response, fallbackFileName);
}

export async function postFormApi<T>(path: string, formData: FormData, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    signal,
    headers: authHeaders(),
    body: formData,
  });
  if (!response.ok) throw await parseApiError(response);

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
  if (!response.ok) throw await parseApiError(response);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

export async function putJsonApi<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseApiError(response);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

export async function deleteJsonApi<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) throw await parseApiError(response);

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
  if (!response.ok) throw await parseApiError(response);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}

function authHeaders(): Record<string, string> {
  return buildAuthenticatedHeaders(getToken(), getCurrentProject()?.id);
}

async function parseApiError(response: Response): Promise<ApiClientError> {
  let message = `请求失败（HTTP ${response.status}）`;

  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) message = body.message;
  } catch {
    // Use the HTTP fallback when the error response cannot be parsed as JSON.
  }

  return new ApiClientError(response.status, message);
}
