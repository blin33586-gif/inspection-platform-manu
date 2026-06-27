import type { ApiResponse } from "@xunjianbao/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3010/api/v1";

export async function getApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);

  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(body.message);

  return body.data;
}
