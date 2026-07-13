export function buildApiUrl(baseUrl: string, path: string, origin: string, token?: string, projectId?: string) {
  const url = new URL(`${baseUrl}${path}`, origin);
  if (token) url.searchParams.set("token", token);
  if (projectId) url.searchParams.set("projectId", projectId);
  return url.toString();
}
