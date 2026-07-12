import { mkdir, open, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { detectImageFormat, type SupportedImageMime } from "@xunjianbao/media-contracts";

const execFileAsync = promisify(execFile);

export interface PrepareInspectionImageInput {
  sourcePath: string;
  originalFileName: string;
  previewDirectory: string;
  previewFileName: string;
}

export interface PreparedInspectionImage {
  mimeType: SupportedImageMime;
  previewStoragePath?: string;
  previewMimeType?: "image/jpeg";
  previewFileSize?: number;
}

export async function prepareInspectionImage(input: PrepareInspectionImageInput): Promise<PreparedInspectionImage> {
  const format = detectImageFormat(input.originalFileName, await readImageHeader(input.sourcePath));
  if (!format.requiresPreview) return { mimeType: format.mimeType };

  await mkdir(input.previewDirectory, { recursive: true });
  const previewStoragePath = join(input.previewDirectory, input.previewFileName);
  if (format.mimeType === "image/heif") {
    await convertHeifToJpeg(input.sourcePath, previewStoragePath);
  } else {
    await convertRasterToJpeg(input.sourcePath, previewStoragePath);
  }
  const previewFileSize = (await stat(previewStoragePath)).size;

  return { mimeType: format.mimeType, previewStoragePath, previewMimeType: "image/jpeg", previewFileSize };
}

async function convertRasterToJpeg(sourcePath: string, previewStoragePath: string) {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", sourcePath,
    "-frames:v", "1",
    "-q:v", "2",
    previewStoragePath,
  ], { maxBuffer: 1024 * 1024 });
}

async function convertHeifToJpeg(sourcePath: string, previewStoragePath: string) {
  try {
    await execFileAsync("heif-convert", [sourcePath, previewStoragePath], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`HEIC/HEIF 预览转换失败，请确认服务器已安装 libheif：${reason}`);
  }
}

async function readImageHeader(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
