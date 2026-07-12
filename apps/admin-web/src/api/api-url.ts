export function buildApiUrl(baseUrl: string, path: string, origin: string, token?: string) {
  const url = new URL(`${baseUrl}${path}`, origin);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}
