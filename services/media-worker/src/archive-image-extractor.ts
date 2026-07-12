import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, posix, win32, join } from "node:path";
import type { Readable } from "node:stream";
import type { Entry, ZipFile } from "yauzl";
import { openPromise } from "yauzl";
import {
  detectImageFormat,
  isSupportedImageFileName,
  shouldIgnoreArchiveEntry,
  type SupportedImageMime,
} from "@xunjianbao/media-contracts";
import { prepareInspectionImage } from "./image-preview.js";

export interface ArchiveLimits {
  maxImages: number;
  maxExpandedBytes: number;
  maxFileBytes: number;
}

export interface ExtractedArchiveImage {
  fileName: string;
  storagePath: string;
  mimeType: SupportedImageMime;
  fileSize: number;
  sortIndex: number;
  previewStoragePath?: string;
  previewMimeType?: "image/jpeg";
  previewFileSize?: number;
}

export const defaultArchiveLimits: ArchiveLimits = {
  maxImages: 1000,
  maxExpandedBytes: 8 * 1024 ** 3,
  maxFileBytes: 50 * 1024 ** 2,
};

export function validateArchiveEntryName(fileName: string) {
  if (
    !fileName
    || fileName.includes("\0")
    || fileName.includes("\\")
    || posix.isAbsolute(fileName)
    || win32.isAbsolute(fileName)
    || fileName.split("/").includes("..")
  ) {
    throw new Error(`压缩包路径无效：${fileName}`);
  }
}

export function detectImageMime(fileName: string, content: Buffer): SupportedImageMime {
  return detectImageFormat(fileName, content).mimeType;
}

export async function extractArchiveImages(
  inputPath: string,
  outputDirectory: string,
  limits: ArchiveLimits = defaultArchiveLimits,
): Promise<ExtractedArchiveImage[]> {
  await mkdir(outputDirectory, { recursive: true });

  try {
    const archive = await openPromise(inputPath, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    });
    return await extractEntries(archive, outputDirectory, limits);
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function extractEntries(archive: ZipFile, outputDirectory: string, limits: ArchiveLimits) {
  const images: ExtractedArchiveImage[] = [];
  const usedNames = new Set<string>();
  let expandedBytes = 0;

  try {
    for await (const entry of archive.eachEntry()) {
      validateArchiveEntry(entry);
      if (entry.fileName.endsWith("/")) continue;
      if (shouldIgnoreArchiveEntry(entry.fileName)) continue;

      if (!isSupportedImageFileName(entry.fileName)) continue;
      if (images.length >= limits.maxImages) throw new Error(`图片数量超过 ${limits.maxImages} 张`);
      if (entry.uncompressedSize > limits.maxFileBytes) throw new Error(`单张图片超过 ${formatMegabytes(limits.maxFileBytes)} MB`);
      if (expandedBytes + entry.uncompressedSize > limits.maxExpandedBytes) {
        throw new Error(`解压后文件总量超过 ${formatMegabytes(limits.maxExpandedBytes)} MB`);
      }

      const stream = await archive.openReadStreamPromise(entry);
      const content = await readBoundedStream(stream, limits.maxFileBytes);
      detectImageMime(entry.fileName, content);
      expandedBytes += content.length;
      if (expandedBytes > limits.maxExpandedBytes) {
        throw new Error(`解压后文件总量超过 ${formatMegabytes(limits.maxExpandedBytes)} MB`);
      }

      const fileName = uniqueFlatName(posix.basename(entry.fileName), usedNames);
      const storagePath = join(outputDirectory, fileName);
      await writeFile(storagePath, content, { flag: "wx" });
      const prepared = await prepareInspectionImage({
        sourcePath: storagePath,
        originalFileName: fileName,
        previewDirectory: join(outputDirectory, "previews"),
        previewFileName: `${fileName.slice(0, -extname(fileName).length) || "image"}.jpg`,
      });
      images.push({
        fileName,
        storagePath,
        fileSize: content.length,
        sortIndex: images.length,
        ...prepared,
      });
    }
  } finally {
    archive.close();
  }

  if (!images.length) throw new Error("压缩包中没有有效的巡检图片");
  return images;
}

function validateArchiveEntry(entry: Entry) {
  validateArchiveEntryName(entry.fileName);
  if (entry.isEncrypted()) throw new Error(`不支持加密压缩包：${entry.fileName}`);

  const hostSystem = entry.versionMadeBy >> 8;
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if (hostSystem === 3 && (unixMode & 0xf000) === 0xa000) {
    throw new Error(`不支持符号链接：${entry.fileName}`);
  }
}

async function readBoundedStream(stream: Readable, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error(`单张图片超过 ${formatMegabytes(maxBytes)} MB`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function uniqueFlatName(originalName: string, usedNames: Set<string>) {
  const extension = extname(originalName);
  const stem = originalName.slice(0, -extension.length) || "image";
  let candidate = originalName;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function formatMegabytes(bytes: number) {
  return Math.ceil(bytes / (1024 ** 2));
}
