export interface DownloadAnchor {
  href: string;
  download: string;
  hidden: boolean;
  click(): void;
  remove(): void;
}

export interface FileDownloadEnvironment {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createAnchor(): DownloadAnchor;
  appendAnchor(anchor: DownloadAnchor): void;
}

export function buildAuthenticatedHeaders(token: string | null | undefined, projectId: string | null | undefined) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(projectId ? { "X-Project-Id": projectId } : {}),
  };
}

export function getDownloadFileName(contentDisposition: string | null, fallbackFileName: string) {
  if (!contentDisposition) return fallbackFileName;
  const encoded = contentDisposition.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1]?.trim().replace(/^"|"$/g, "");
  if (encoded) {
    try {
      return safeHeaderFileName(decodeURIComponent(encoded)) || fallbackFileName;
    } catch {
      // Fall through to the plain filename or caller fallback.
    }
  }
  const plain = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  return safeHeaderFileName((plain?.[1] ?? plain?.[2] ?? "").trim()) || fallbackFileName;
}

export async function saveResponseAsDownload(
  response: Response,
  fallbackFileName: string,
  environment: FileDownloadEnvironment = browserDownloadEnvironment,
) {
  const objectUrl = environment.createObjectUrl(await response.blob());
  let anchor: DownloadAnchor | undefined;
  try {
    anchor = environment.createAnchor();
    anchor.href = objectUrl;
    anchor.download = getDownloadFileName(response.headers.get("Content-Disposition"), fallbackFileName);
    anchor.hidden = true;
    environment.appendAnchor(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    environment.revokeObjectUrl(objectUrl);
  }
}

function safeHeaderFileName(value: string) {
  return value.split(/[\\/]/).at(-1)?.replace(/[\r\n]/g, "").trim() ?? "";
}

const browserDownloadEnvironment: FileDownloadEnvironment = {
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  createAnchor: () => document.createElement("a"),
  appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
};
