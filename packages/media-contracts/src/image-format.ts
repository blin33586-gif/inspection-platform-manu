export type SupportedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/bmp"
  | "image/tiff"
  | "image/heif";

export interface DetectedImageFormat {
  mimeType: SupportedImageMime;
  requiresPreview: boolean;
}

const extensionsByMime: Record<SupportedImageMime, ReadonlySet<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg", ".jfif"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "image/gif": new Set([".gif"]),
  "image/bmp": new Set([".bmp"]),
  "image/tiff": new Set([".tif", ".tiff"]),
  "image/heif": new Set([".heic", ".heif"]),
};

export const supportedImageExtensions = new Set(
  Object.values(extensionsByMime).flatMap((extensions) => [...extensions]),
);

export function isSupportedImageFileName(fileName: string) {
  return supportedImageExtensions.has(extensionOf(fileName));
}

export function shouldIgnoreArchiveEntry(fileName: string) {
  const segments = fileName.split("/");
  const baseName = segments.at(-1) ?? "";
  return segments.includes("__MACOSX")
    || baseName === ".DS_Store"
    || baseName.startsWith("._");
}

export function detectImageFormat(fileName: string, content: Uint8Array): DetectedImageFormat {
  const mimeType = detectMimeType(content);
  if (!mimeType || !extensionsByMime[mimeType].has(extensionOf(fileName))) {
    throw new Error(`图片格式无效：${fileName}`);
  }
  return {
    mimeType,
    requiresPreview: mimeType === "image/bmp" || mimeType === "image/tiff" || mimeType === "image/heif",
  };
}

function detectMimeType(content: Uint8Array): SupportedImageMime | null {
  if (startsWith(content, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(content, [0x52, 0x49, 0x46, 0x46]) && equalsAscii(content, 8, "WEBP")) return "image/webp";
  if (equalsAscii(content, 0, "GIF87a") || equalsAscii(content, 0, "GIF89a")) return "image/gif";
  if (startsWith(content, [0x42, 0x4d])) return "image/bmp";
  if (
    startsWith(content, [0x49, 0x49, 0x2a, 0x00])
    || startsWith(content, [0x4d, 0x4d, 0x00, 0x2a])
    || startsWith(content, [0x49, 0x49, 0x2b, 0x00])
    || startsWith(content, [0x4d, 0x4d, 0x00, 0x2b])
  ) return "image/tiff";
  if (equalsAscii(content, 4, "ftyp") && isHeifBrand(content)) return "image/heif";
  return null;
}

function isHeifBrand(content: Uint8Array) {
  const brand = asciiAt(content, 8, 4);
  return brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx" || brand === "mif1" || brand === "msf1";
}

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function startsWith(content: Uint8Array, expected: number[]) {
  return expected.every((value, index) => content[index] === value);
}

function equalsAscii(content: Uint8Array, offset: number, value: string) {
  return asciiAt(content, offset, value.length) === value;
}

function asciiAt(content: Uint8Array, offset: number, length: number) {
  if (content.length < offset + length) return "";
  return String.fromCharCode(...content.subarray(offset, offset + length));
}
